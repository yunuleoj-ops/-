// 이 스위트가 지키는 것: 정규화 상수, 대역 경계, 재매개화 균등성(T6),
// 그리고 "정확도가 거짓말하지 않는다"는 이 기능의 유일한 판매 근거(뒤 describe).

import { describe, expect, it } from "vitest";
import { densify, resampleUniform, toComplex, type Complex } from "@/lib/resample";
import { ABS_FLOOR, T_MAX, amplitude, bandLimit, dftClosed, fitStroke, normOf, overlayPointCount, reconstruct, sampleCount, truncate, type FitOptions } from "@/lib/fourier";
import type { Point } from "@/lib/geometry";

// ── 픽스처: 캔버스 좌표(0..100, y 아래로 증가) 위의 닫힌 도형 제어점 ──
const circlePoints = (radius: number, count: number): Point[] =>
  Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count;
    return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
  });

// 꼭짓점 목록을 step 간격으로 찍어 모서리가 살아 있는 폐곡선을 만든다(꼭짓점 중복 없음).
const edgeLoop = (vertices: Point[], step: number): Point[] => {
  const out: Point[] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    const from = vertices[i];
    const to = vertices[(i + 1) % vertices.length];
    const parts = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / step));
    for (let s = 0; s < parts; s += 1) {
      out.push({ x: from.x + ((to.x - from.x) * s) / parts, y: from.y + ((to.y - from.y) * s) / parts });
    }
  }
  return out;
};

const regularPolygon = (sides: number, radius: number): Point[] =>
  Array.from({ length: sides }, (_, i) => {
    const angle = Math.PI / 2 + (Math.PI * 2 * i) / sides;
    return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
  });

const starPolygon = (points: number, outer: number): Point[] => {
  const inner = (outer * Math.cos((Math.PI * 2) / points)) / Math.cos(Math.PI / points);
  return Array.from({ length: points * 2 }, (_, i) => {
    const angle = Math.PI / 2 + (Math.PI * i) / points;
    const radius = i % 2 === 0 ? outer : inner;
    return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
  });
};

const CIRCLE = circlePoints(30, 64);
const SQUARE = edgeLoop([{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }], 1);
const HEXAGON = edgeLoop(regularPolygon(6, 30), 1);
const PENTAGRAM = edgeLoop(starPolygon(5, 30), 1);

const closedFit = (points: Point[], options?: FitOptions) => {
  const spectrum = fitStroke(points, "closed", options);
  if (spectrum.kind !== "closed") throw new Error("닫힌 스펙트럼이 아니다");
  return spectrum;
};

// 분석 파이프라인과 같은 경로로 표본을 만든다: densify → resampleUniform → toComplex
const closedSamples = (points: Point[]) => {
  const { poly, length } = densify(points, true);
  const P = sampleCount(length);
  return { P, length, samples: resampleUniform(poly, length, P, true).map(toComplex) };
};

describe("Task 3 densify 계약 게이트", () => {
  // 이 태스크의 모든 기대값이 이 계약 위에 서 있다(D-G). 여기가 빨강이면 Task 3이 바뀐 것이고,
  // 그 경우 아래 원 픽스처 숫자를 고칠 게 아니라 Task 3의 변경을 되돌려야 한다.
  it("닫힘은 직선 현으로 마감하고 Catmull-Rom 이웃을 순환으로 감지 않는다", () => {
    const open = densify(CIRCLE, false);
    const closed = densify(CIRCLE, true);
    const chord = Math.hypot(CIRCLE[63].x - CIRCLE[0].x, CIRCLE[63].y - CIRCLE[0].y);
    expect(chord).toBeCloseTo(60 * Math.sin(Math.PI / 64), 9);   // 2r·sin(π/64) = 2.944060
    expect(closed.length - open.length).toBeCloseTo(chord, 9);
    expect(open.length).toBeCloseTo(185.5481, 3);
    expect(closed.length).toBeCloseTo(188.4922, 3);
    expect(sampleCount(closed.length)).toBe(378);

    // 닫는 세그먼트가 직선 현이므로 그 중점이 반지름 안쪽으로 30(1−cos(π/64)) = 0.036136 들어온다.
    // 순환으로 감았다면 이 dip 이 1e-3 이하로 떨어지고 원의 maxError 가 2e-4 로 내려간다.
    let dip = 0;
    for (const point of closed.poly) dip = Math.max(dip, 30 - Math.hypot(point.x - 50, point.y - 50));
    expect(dip).toBeCloseTo(30 * (1 - Math.cos(Math.PI / 64)), 9);
    expect(resampleUniform(closed.poly, closed.length, 378, true)).toHaveLength(378);
  });
});

describe("표본 수와 후보 대역", () => {
  it("P는 round(2L)을 128..512로 자르고 짝수로 올린다", () => {
    expect(sampleCount(10)).toBe(128);
    expect(sampleCount(64)).toBe(128);
    expect(sampleCount(100)).toBe(200);
    expect(sampleCount(94.3)).toBe(190);        // round(188.6)=189 → 짝수 보정
    expect(sampleCount(188.4922)).toBe(378);    // 반지름 30 원
    expect(sampleCount(255.7)).toBe(512);       // round(511.4)=511 → 512, 상한을 넘지 않는다
    expect(sampleCount(4000)).toBe(512);
  });

  it("K_max는 floor(P/4)와 64 중 작은 값이다", () => {
    expect(bandLimit(128)).toBe(32);
    expect(bandLimit(200)).toBe(50);
    expect(bandLimit(256)).toBe(64);
    expect(bandLimit(378)).toBe(64);
    expect(bandLimit(512)).toBe(64);
  });
});

describe("정확도 분모 normOf", () => {
  it("중심 대비 RMS 거리이고 평행이동에 불변이다", () => {
    expect(normOf([])).toBe(0);
    expect(normOf([{ re: 7, im: -3 }])).toBe(0);
    const ring: Complex[] = [{ re: 5, im: 0 }, { re: 0, im: 5 }, { re: -5, im: 0 }, { re: 0, im: -5 }];
    expect(normOf(ring)).toBeCloseTo(5, 12);
    expect(normOf(ring.map((z) => ({ re: z.re + 123, im: z.im - 77 })))).toBeCloseTo(5, 12);
  });

  it("닫힘에서는 c₀ 기준 분산과 같은 값이다", () => {
    const { P, samples } = closedSamples(CIRCLE);
    const { c0 } = dftClosed(samples, 1);
    let energy = 0;
    for (const z of samples) energy += z.re * z.re + z.im * z.im;
    expect(normOf(samples)).toBeCloseTo(Math.sqrt(energy / P - (c0.re * c0.re + c0.im * c0.im)), 12);
    expect(normOf(samples)).toBeCloseTo(29.9991, 4);   // 실측 29.999100446
  });
});

describe("테이블 DFT", () => {
  const P = 128;
  // z_k = (4 − 6i) + (5 + i)e^(2πi·3k/P) + (2 + 3i)e^(−2πi·7k/P)
  const synthetic: Complex[] = Array.from({ length: P }, (_, k) => {
    const t = (Math.PI * 2 * k) / P;
    const a = { re: 5, im: 1 };
    const b = { re: 2, im: 3 };
    return {
      re: 4 + a.re * Math.cos(3 * t) - a.im * Math.sin(3 * t) + b.re * Math.cos(-7 * t) - b.im * Math.sin(-7 * t),
      im: -6 + a.re * Math.sin(3 * t) + a.im * Math.cos(3 * t) + b.re * Math.sin(-7 * t) + b.im * Math.cos(-7 * t)
    };
  });

  it("대역 제한 신호의 계수를 그대로 되돌린다", () => {
    const { c0, terms, cosTable, sinTable } = dftClosed(synthetic, 12);
    expect(terms).toHaveLength(24);              // n = −12..12, 0 제외
    expect(cosTable).toHaveLength(P);            // Task 5의 fitOpen 이 이 두 표를 재사용한다(D-D)
    expect(sinTable).toHaveLength(P);
    expect(c0.re).toBeCloseTo(4, 12);
    expect(c0.im).toBeCloseTo(-6, 12);
    const at = (n: number) => terms.find((term) => term.n === n)!;
    expect(at(3).re).toBeCloseTo(5, 12);
    expect(at(3).im).toBeCloseTo(1, 12);
    expect(at(-7).re).toBeCloseTo(2, 12);
    expect(at(-7).im).toBeCloseTo(3, 12);
    for (const term of terms) {
      if (term.n !== 3 && term.n !== -7) expect(amplitude(term)).toBeLessThan(1e-12);
    }
  });

  it("파스발: 전 대역 Σ|c_n|² = mean|z − c₀|²", () => {
    const { c0, terms } = dftClosed(synthetic, P / 2);
    // n = ±P/2는 같은 빈의 별칭이므로 한쪽만 센다(스펙 E10).
    const sum = terms.filter((term) => term.n > -P / 2).reduce((total, term) => total + term.re ** 2 + term.im ** 2, 0);
    const mean = synthetic.reduce((total, z) => total + (z.re - c0.re) ** 2 + (z.im - c0.im) ** 2, 0) / P;
    expect(sum).toBeCloseTo(39, 9);              // |5+i|² + |2+3i|² = 26 + 13
    expect(Math.abs(sum - mean)).toBeLessThan(1e-9);   // 실측 2.13e-14
  });

  it("재샘플한 원에서도 파스발이 성립하고 ±P/2는 같은 값이다", () => {
    const { P: count, samples } = closedSamples(CIRCLE);
    expect(count).toBe(378);
    const { c0, terms } = dftClosed(samples, count / 2);
    const sum = terms.filter((term) => term.n > -count / 2).reduce((total, term) => total + term.re ** 2 + term.im ** 2, 0);
    const mean = samples.reduce((total, z) => total + (z.re - c0.re) ** 2 + (z.im - c0.im) ** 2, 0) / count;
    expect(Math.abs(sum - mean)).toBeLessThan(1e-9);   // 실측 9.10e-13
    const low = terms.find((term) => term.n === -count / 2)!;
    const high = terms.find((term) => term.n === count / 2)!;
    expect(low.re).toBe(high.re);
    expect(low.im).toBe(high.im);
  });

  it("T6 — 호길이 항등식 Σ(2πn)²|c_n|² = L² (전 대역)", () => {
    // 스펙 §1.9-1: 재매개화 버그·좌표 부호 실수·정규화 상수 실수를 한 줄로 잡는 유일한 자체 검증이다.
    // 호길이 균등 매개화에서 |z'(t)| = L 이므로 ∫|z'|² dt = Σ(2πn)²|c_n|² = L².
    // 다각형은 코너 이산화 때문에 0.3% 이내로만 맞는다(스펙이 0.7% 이내라고 적은 그 오차).
    const table = [
      { name: "circle", points: CIRCLE, tolerance: 1e-4 },      // 실측 2.47e-6
      { name: "square", points: SQUARE, tolerance: 5e-3 },      // 실측 1.22e-3
      { name: "hexagon", points: HEXAGON, tolerance: 5e-3 },    // 실측 8.01e-4
      { name: "pentagram", points: PENTAGRAM, tolerance: 5e-3 } // 실측 2.26e-3
    ];
    for (const row of table) {
      const { P: count, length, samples } = closedSamples(row.points);
      const { terms } = dftClosed(samples, count / 2);
      let total = 0;
      for (const term of terms) {
        if (term.n <= -count / 2) continue;   // ±P/2 별칭은 한쪽만
        total += (2 * Math.PI * term.n) ** 2 * (term.re ** 2 + term.im ** 2);
      }
      expect(Math.abs(total - length ** 2) / length ** 2, row.name).toBeLessThan(row.tolerance);
    }
  });
});

describe("닫힌 획 적합", () => {
  it("반지름 30 완전한 원은 정확히 1항이다", () => {
    const fit = closedFit(CIRCLE);
    expect(fit.terms).toHaveLength(1);
    expect(fit.terms[0].n).toBe(1);
    expect(amplitude(fit.terms[0])).toBeCloseTo(30, 2);   // 실측 29.999100
    // |c₀| 이 1e-9 이 아닌 이유: 닫는 직선 현(2.944)이 중심을 아주 조금 끌어당긴다.
    expect(amplitude(fit.c0)).toBeLessThan(2e-3);         // 실측 1.111e-3
    expect(fit.stats.P).toBe(378);
    expect(fit.stats.arcLength).toBeCloseTo(188.4922, 3);
    expect(fit.stats.normS).toBeCloseTo(30, 2);           // 실측 29.999100
    expect(fit.stats.rmsError).toBeLessThan(5e-3);        // 실측 3.778e-3
    expect(fit.stats.maxError).toBeLessThan(5e-2);        // 실측 3.412e-2 (seam 하나가 지배한다)
    expect(fit.stats.accuracy).toBeGreaterThan(0.9998);   // 실측 0.9998741
    expect(fit.stats.capped).toBe(false);
  });

  it("정사각형 6항 · 정육각형 4항 · 오각별 8항에서 99%에 닿는다", () => {
    const table = [
      { name: "square", points: SQUARE, terms: 6, reached: 0.9902253, short: 0.9872027 },
      { name: "hexagon", points: HEXAGON, terms: 4, reached: 0.9916976, short: 0.9882091 },
      { name: "pentagram", points: PENTAGRAM, terms: 8, reached: 0.9903255, short: 0.9879917 }
    ];
    for (const row of table) {
      const enough = closedFit(row.points, { maxTerms: row.terms });
      const lacking = closedFit(row.points, { maxTerms: row.terms - 1 });
      expect(enough.terms, row.name).toHaveLength(row.terms);
      expect(enough.stats.accuracy, row.name).toBeGreaterThanOrEqual(0.99);
      expect(enough.stats.accuracy, row.name).toBeCloseTo(row.reached, 5);
      expect(lacking.stats.accuracy, row.name).toBeLessThan(0.99);
      expect(lacking.stats.accuracy, row.name).toBeCloseTo(row.short, 5);
      expect(enough.stats.capped, row.name).toBe(true);
    }
  });

  it("terms는 진폭 내림차순으로 저장된다", () => {
    // D-C: truncate(k) = "진폭 상위 k개" 계약의 근거다. n 오름차순으로 정렬하지 않는다.
    for (const [points, name] of [[CIRCLE, "circle"], [SQUARE, "square"], [PENTAGRAM, "pentagram"]] as const) {
      const fit = closedFit(points);
      for (let i = 1; i < fit.terms.length; i += 1) {
        expect(amplitude(fit.terms[i - 1]), `${name} #${i}`).toBeGreaterThanOrEqual(amplitude(fit.terms[i]));
      }
    }
    expect(closedFit(SQUARE).terms.map((term) => term.n)).toEqual([-1, 3, -5, 7, -9, 11, -13, 15, -17]);
  });

  it("m겹 대칭 도형은 n ≡ n₁ (mod m) 인 항만 고른다", () => {
    for (const [points, m, name] of [[SQUARE, 4, "square"], [HEXAGON, 6, "hexagon"], [PENTAGRAM, 5, "pentagram"]] as const) {
      const fit = closedFit(points);
      const first = fit.terms[0].n;
      for (const term of fit.terms) expect(((term.n - first) % m + m) % m, `${name} n=${term.n}`).toBe(0);
    }
  });

  it("퇴화 획은 NaN 없이 point로 떨어지고 length는 호길이를 담는다", () => {
    // D-E: point 의 length 는 "항상 0"이 아니라 호길이다. toEqual 로 통째 비교하지 않는다.
    const sameSpot = Array.from({ length: 12 }, () => ({ x: 50, y: 50 }));
    for (const [points, closure] of [[sameSpot, "closed"], [[], "closed"], [[{ x: 10, y: 10 }], "closed"]] as const) {
      const spectrum = fitStroke(points as Point[], closure);
      expect(spectrum.kind).toBe("point");
      if (spectrum.kind !== "point") throw new Error("point가 아니다");
      expect(spectrum.length).toBe(0);
    }
    const asPoint = fitStroke(CIRCLE, "point");
    expect(asPoint.kind).toBe("point");
    if (asPoint.kind !== "point") throw new Error("point가 아니다");
    expect(asPoint.length).toBeCloseTo(185.5481, 3);   // closure="point"는 열린 폴리라인 길이다
  });

  it("열린 획은 아직 이 모듈이 처리하지 않는다", () => {
    expect(() => fitStroke([{ x: 20, y: 50 }, { x: 80, y: 50 }], "open")).toThrow(/open/);
  });
});

describe("국소 꺾임 보호", () => {
  it("최대 오차가 RMS의 3배를 넘는 모서리 도형은 항을 1.5배로 한 번 늘린다", () => {
    const table = [
      { name: "square", points: SQUARE, terms: 9, accuracy: 0.9945916, maxError: 0.9442, normS: 34.6458 },
      { name: "hexagon", points: HEXAGON, terms: 6, accuracy: 0.9954116, maxError: 0.4967, normS: 27.3899 },
      { name: "pentagram", points: PENTAGRAM, terms: 12, accuracy: 0.9949019, maxError: 0.6147, normS: 20.8901 }
    ];
    for (const row of table) {
      const fit = closedFit(row.points);
      expect(fit.terms, row.name).toHaveLength(row.terms);
      expect(fit.stats.accuracy, row.name).toBeCloseTo(row.accuracy, 5);
      expect(fit.stats.maxError, row.name).toBeCloseTo(row.maxError, 3);
      expect(fit.stats.normS, row.name).toBeCloseTo(row.normS, 3);
      expect(fit.stats.capped, row.name).toBe(false);
    }
  });

  it("발동 조건과 비발동 조건을 둘 다 고정한다", () => {
    // 그리디 정지 시점(6항)의 진단값: 최대 오차 1.4216 > 3 × RMS 0.3387 (비율 4.198) → 9항으로 늘어난 이유.
    const stopped = closedFit(SQUARE, { maxTerms: 6 });
    expect(stopped.stats.rmsError).toBeCloseTo(0.33865, 4);
    expect(stopped.stats.maxError).toBeCloseTo(1.4216, 3);
    expect(stopped.stats.maxError / stopped.stats.rmsError).toBeCloseTo(4.198, 2);

    // 원은 seam(닫는 직선 현) 하나가 잔차를 지배해 비율이 9.03이다 — 3배 조건만으로는 발동을 못 막는다.
    // 절대 하한 0.15가 유일한 방어선이고, 그래서 D-F 조건에 maxError > absFloor 가 들어간다.
    const circle = closedFit(CIRCLE);
    expect(circle.terms).toHaveLength(1);
    expect(circle.stats.maxError).toBeCloseTo(0.0341, 4);
    expect(circle.stats.maxError / circle.stats.rmsError).toBeGreaterThan(3);
    expect(circle.stats.maxError).toBeLessThan(ABS_FLOOR);

    // absFloor 를 0으로 낮추면 그 방어선이 사라져 원이 2항이 된다. 이 단언이 조건의 존재 이유다.
    const unguarded = closedFit(CIRCLE, { absFloor: 0 });
    expect(unguarded.terms).toHaveLength(2);
    expect(unguarded.terms.map((term) => term.n)).toEqual([1, -1]);
  });

  it("성장은 T_max를 넘지 않고 상한에 닿으면 capped가 선다", () => {
    expect(T_MAX).toBe(24);
    const capped = closedFit(PENTAGRAM, { maxTerms: 5 });
    expect(capped.terms).toHaveLength(5);
    expect(capped.stats.capped).toBe(true);
    expect(capped.stats.accuracy).toBeCloseTo(0.9813628, 5);
  });
});

describe("항 수 슬라이더와 오버레이", () => {
  it("truncate는 재변환 없이 부분집합의 오차를 다시 센다", () => {
    const fit = closedFit(PENTAGRAM);
    let previous = Infinity;
    for (let count = 0; count <= fit.terms.length; count += 1) {
      const view = truncate(fit, count);
      if (view.kind !== "closed") throw new Error("닫힌 스펙트럼이 아니다");
      expect(view.terms).toHaveLength(count);
      expect(view.stats.rmsError).toBeLessThanOrEqual(previous + 1e-12);
      previous = view.stats.rmsError;
    }
    const empty = truncate(fit, 0);
    if (empty.kind !== "closed") throw new Error("닫힌 스펙트럼이 아니다");
    expect(empty.stats.rmsError).toBeCloseTo(fit.stats.normS, 10);
    expect(empty.stats.accuracy).toBe(0);
    expect(truncate(fit, fit.terms.length)).toBe(fit);      // 전량이면 같은 객체
  });

  it("truncate는 범위를 벗어난 값을 자르고 point는 그대로 돌려준다", () => {
    const fit = closedFit(PENTAGRAM);
    expect(truncate(fit, 999)).toBe(fit);
    const none = truncate(fit, -3);
    if (none.kind !== "closed") throw new Error("닫힌 스펙트럼이 아니다");
    expect(none.terms).toHaveLength(0);
    const degenerate = fitStroke([{ x: 50, y: 50 }, { x: 50, y: 50 }], "point");
    expect(truncate(degenerate, 3)).toBe(degenerate);
  });

  it("truncate(k)와 maxTerms:k 적합은 같은 항 집합·같은 오차를 낸다", () => {
    // 이 등식이 성립하는 이유는 terms 가 진폭 내림차순이기 때문이다(D-C).
    // n 오름차순으로 재정렬하면 여기가 즉시 빨강이 된다.
    const fit = closedFit(SQUARE);
    const view = truncate(fit, 6);
    if (view.kind !== "closed") throw new Error("닫힌 스펙트럼이 아니다");
    const refit = closedFit(SQUARE, { maxTerms: 6 });
    expect(view.terms.map((term) => term.n)).toEqual([-1, 3, -5, 7, -9, 11]);
    expect(view.terms.map((term) => term.n)).toEqual(refit.terms.map((term) => term.n));
    expect(view.stats.rmsError).toBeCloseTo(refit.stats.rmsError, 9);
    expect(view.stats.accuracy).toBeCloseTo(refit.stats.accuracy, 9);
  });

  it("reconstruct는 q개 점을 캔버스 좌표로 돌려준다", () => {
    const fit = closedFit(CIRCLE);
    const drawn = reconstruct(fit, 512);
    expect(drawn).toHaveLength(512);
    expect(drawn[0].x).toBeCloseTo(80, 2);        // 실측 79.997991
    expect(drawn[0].y).toBeCloseTo(50, 2);        // 실측 50.000510
    for (const point of drawn) expect(Math.hypot(point.x - 50, point.y - 50)).toBeCloseTo(30, 2);
    expect(reconstruct(fit, 0)).toEqual([]);
    expect(reconstruct(fitStroke([], "closed"), 64)).toEqual([]);
  });

  it("오버레이 점 수는 clamp(8·max|n|, 64, 512)", () => {
    expect(overlayPointCount(closedFit(CIRCLE))).toBe(64);        // max|n| = 1
    expect(overlayPointCount(closedFit(SQUARE))).toBe(136);       // max|n| = 17
    expect(overlayPointCount(closedFit(HEXAGON))).toBe(136);      // max|n| = 17
    expect(overlayPointCount(closedFit(PENTAGRAM))).toBe(288);    // max|n| = 36
    expect(overlayPointCount(fitStroke([], "closed"))).toBe(0);   // 퇴화 획은 오버레이에서 걸러진다
  });
});
