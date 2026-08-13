// 대칭이 계수 위 연산으로 정확히 유도되는지 — 스펙 §1.7 / T2 / T8 / T9 / E9 / E10.
// 이 파일의 핵심 주장 두 개:
//  (1) applyOperator 로 만든 복사본과 transformPoint 로 만든 복사본이 같은 그림이다.
//  (2) 재샘플 전에 변환하든 후에 변환하든 같은 표본이 나온다 (스펙 §3 → T2).
// 둘 중 하나가 깨지면 화면과 식이 조용히 갈라진다.
import { describe, expect, it } from "vitest";

import { transformPoint, type Closure, type Point, type Symmetry } from "@/lib/geometry";
import { densify, fromComplex, resampleUniform, toComplex, type Complex } from "@/lib/resample";
import { applyOperator, fitStroke, reconstruct, sampleCount, type Spectrum } from "@/lib/fourier";

const TOL = 1e-12;   // 스펙 §1.9-3 대칭 연산자 항등식 허용치. 실측 최악 1.01e-13
const Q = 120;       // 재구성 표본 수. 양변이 같은 q를 쓰기만 하면 값 자체는 무관

// ---- 픽스처 --------------------------------------------------------------
// 실측: 1항 · n = −1 · L = 188.488 · P = 378 · 99.975%
const circle = (radius = 30, n = 48): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    return { x: 50 + radius * Math.cos(a), y: 50 + radius * Math.sin(a) };
  });

// 비대칭 닫힌 획. c_n 과 c_{−n} 이 둘 다 0이 아니어야 인덱스 반전 버그가 드러난다.
// 실측: 5항 · n = [−1, 1, 2, −3, −4] · L = 162.675 · 99.006%
const blob = (n = 64): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    return {
      x: 50 + 28 * Math.cos(a) + 5 * Math.cos(2 * a) + 2 * Math.sin(3 * a) - 3 * Math.sin(a),
      y: 50 + 21 * Math.sin(a) + 4 * Math.sin(2 * a) - 3 * Math.cos(3 * a) + 2 * Math.cos(a)
    };
  });

// 실측: 3항 · n = [3, 6, 9] · 99.151%
const wave = (n = 40): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: 15 + 70 * t, y: 50 + 12 * Math.sin(3 * Math.PI * t) };
  });

// 실측: 0항 · 100.000%. terms 가 빈 배열일 때 z₀·Δ 만 변환되는지 확인하는 픽스처다.
const straight = (): Point[] => [{ x: 20, y: 30 }, { x: 80, y: 74 }];

const FIXTURES: { name: string; points: Point[]; closure: Closure }[] = [
  { name: "circle", points: circle(), closure: "closed" },
  { name: "blob", points: blob(), closure: "closed" },
  { name: "wave", points: wave(), closure: "open" },
  { name: "straight", points: straight(), closure: "open" }
];

const fitAll = () => FIXTURES.map((f) => ({ ...f, spectrum: fitStroke(f.points, f.closure) }));

// ---- 헬퍼 ----------------------------------------------------------------
const maxPointError = (a: Point[], b: Point[]) => {
  expect(a.length).toBe(b.length);
  return a.reduce((worst, p, i) => Math.max(worst, Math.hypot(p.x - b[i].x, p.y - b[i].y)), 0);
};

// 집합 비교는 좌표 정렬이 아니라 최근접 이웃(하우스도르프)으로 한다.
// 대칭 점군에는 x가 거의 같고 y만 다른 점이 흔해서, 정렬 비교는 올바른 구현에서도
// 부동소수점 잡음으로 짝이 어긋난다 — 실측 가짜 오차: 원 6.0e+1, 물결 2.3e+1.
const hausdorff = (a: Point[], b: Point[]) => {
  const oneWay = (from: Point[], to: Point[]) =>
    from.reduce((worst, p) => Math.max(worst, to.reduce(
      (best, q) => Math.min(best, Math.hypot(p.x - q.x, p.y - q.y)), Number.POSITIVE_INFINITY)), 0);
  return Math.max(oneWay(a, b), oneWay(b, a));
};

// 계수 사전. 닫힘은 c₀ 와 n별 항, 열림은 z₀·Δ 와 n별 항을 모두 담는다.
// 열림의 z₀·Δ 를 빼면 straight(0항) 픽스처가 양쪽 다 빈 사전이 되어 공허하게 통과한다.
const coefficients = (spectrum: Spectrum) => {
  const map = new Map<string, Complex>();
  if (spectrum.kind === "point") return map;
  if (spectrum.kind === "closed") map.set("c0", { re: spectrum.c0.re, im: spectrum.c0.im });
  if (spectrum.kind === "open") {
    map.set("z0", { re: spectrum.z0.re, im: spectrum.z0.im });
    map.set("delta", { re: spectrum.delta.re, im: spectrum.delta.im });
  }
  for (const term of spectrum.terms) map.set(`n${term.n}`, { re: term.re, im: term.im });
  return map;
};

const maxCoefError = (a: Spectrum, b: Spectrum) => {
  const left = coefficients(a);
  const right = coefficients(b);
  let worst = 0;
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const x = left.get(key) ?? { re: 0, im: 0 };
    const y = right.get(key) ?? { re: 0, im: 0 };
    worst = Math.max(worst, Math.hypot(x.re - y.re, x.im - y.im));
  }
  return worst;
};

// 수학 좌표에서 e^(iθ)를 곱한다. z = conj(p − 중심)이라 화면으로는 −θ 회전이다.
const rotateMath = (points: Point[], theta: number): Point[] =>
  points.map((p) => {
    const z = toComplex(p);
    return fromComplex({
      re: z.re * Math.cos(theta) - z.im * Math.sin(theta),
      im: z.re * Math.sin(theta) + z.im * Math.cos(theta)
    });
  });

const orbit = (spectrum: Spectrum, symmetry: Symmetry, count: number) =>
  Array.from({ length: count }, (_, k) => reconstruct(applyOperator(spectrum, symmetry, count, k), Q)).flat();

const orbitByPoints = (spectrum: Spectrum, symmetry: Symmetry, count: number) => {
  const source = reconstruct(spectrum, Q);
  return Array.from({ length: count }, (_, k) =>
    source.map((p) => transformPoint(p, symmetry, count, k))).flat();
};

// ---- 테스트 --------------------------------------------------------------
describe("applyOperator — 항등과 불변량", () => {
  // 이 테스트가 이 파일 전체의 전제다. Task 5 가 reconstruct 의 "open" 분기를 채우지 않으면
  // 열린 픽스처가 빈 배열이 되어 아래 모든 루프가 maxPointError([], []) = 0 으로 공허 통과한다.
  it("네 픽스처가 모두 Q개 점으로 재구성된다 — 열린 획이 빈 배열이면 이 파일은 무의미하다", () => {
    for (const { name, spectrum } of fitAll()) {
      expect(spectrum.kind, name).not.toBe("point");
      const drawn = reconstruct(spectrum, Q);
      expect(drawn, name).toHaveLength(Q);
      expect(drawn.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), name).toBe(true);
    }
    // 0항 열린 획은 재구성이 정확히 현이다: t = 0 과 t = 1 이 양 끝점을 지난다.
    const line = fitStroke(straight(), "open");
    if (line.kind !== "open") throw new Error("open 이어야 한다");
    expect(line.terms).toHaveLength(0);
    const drawn = reconstruct(line, Q);
    expect(drawn[0].x).toBeCloseTo(20, 9);
    expect(drawn[0].y).toBeCloseTo(30, 9);
    expect(drawn[Q - 1].x).toBeCloseTo(80, 9);
    expect(drawn[Q - 1].y).toBeCloseTo(74, 9);
  });

  it("copy 0과 free는 입력 객체를 그대로 돌려준다", () => {
    const spectrum = fitStroke(blob(), "closed");
    expect(applyOperator(spectrum, "free", 1, 0)).toBe(spectrum);
    expect(applyOperator(spectrum, "free", 1, 1)).toBe(spectrum);
    expect(applyOperator(spectrum, "rotate", 6, 0)).toBe(spectrum);
    expect(applyOperator(spectrum, "mirrorX", 2, 0)).toBe(spectrum);
    expect(applyOperator(spectrum, "mirrorY", 2, 0)).toBe(spectrum);
  });

  it("퇴화 획은 어떤 연산자에도 그대로다 (E2 NaN 전파 차단)", () => {
    // point 의 length 는 호길이다(확정: 항상 0이 아니다). 0.4 는 커밋 문턱 1.0 미만의 실제 호길이.
    const degenerate: Spectrum = { kind: "point", length: 0.4 };
    expect(applyOperator(degenerate, "rotate", 6, 3)).toBe(degenerate);
    expect(applyOperator(degenerate, "mirrorX", 2, 1)).toBe(degenerate);
  });

  it("항 수와 stats는 연산자에 불변이다 — 등거리변환은 오차를 만들지 않는다", () => {
    const operators: [Symmetry, number, number][] = [
      ["rotate", 6, 2], ["rotate", 8, 5], ["mirrorX", 2, 1], ["mirrorY", 2, 1]
    ];
    for (const { name, spectrum } of fitAll()) {
      if (spectrum.kind === "point") throw new Error(`${name}: 퇴화 픽스처가 아니어야 한다`);
      for (const [symmetry, count, copy] of operators) {
        const moved = applyOperator(spectrum, symmetry, count, copy);
        if (moved.kind === "point") throw new Error(`${name}: kind가 바뀌면 안 된다`);
        expect(moved.kind).toBe(spectrum.kind);
        expect(moved.terms.length).toBe(spectrum.terms.length);
        expect(moved.stats).toEqual(spectrum.stats);
        // |c_n| 보존 → Task 4가 정렬한 진폭 내림차순이 그대로 유지된다. 실측 최대 편차 3.55e-15
        moved.terms.forEach((term, i) => {
          expect(Math.hypot(term.re, term.im))
            .toBeCloseTo(Math.hypot(spectrum.terms[i].re, spectrum.terms[i].im), 12);
        });
      }
    }
  });
});

describe("회전 — T8", () => {
  it("fit(수학좌표 회전) 의 계수가 applyOperator(rotate) 와 같다", () => {
    let worst = 0;
    for (const count of [3, 4, 6, 8]) {
      for (let copy = 1; copy < count; copy += 1) {
        for (const { points, closure } of FIXTURES) {
          const refit = fitStroke(rotateMath(points, (Math.PI * 2 * copy) / count), closure);
          const derived = applyOperator(fitStroke(points, closure), "rotate", count, copy);
          worst = Math.max(worst, maxCoefError(refit, derived));
        }
      }
    }
    expect(worst).toBeLessThan(TOL);   // 실측 1.01e-13 (최악: blob)
  });

  it("회전 궤도가 transformPoint 궤도와 집합으로 같다", () => {
    for (const count of [2, 3, 4, 6, 8]) {
      for (const { name, spectrum } of fitAll()) {
        expect.soft(hausdorff(orbit(spectrum, "rotate", count), orbitByPoints(spectrum, "rotate", count)),
          `${name} m=${count}`).toBeLessThan(TOL);   // 실측 최악 4.55e-14
      }
    }
  });

  it("복사본 k 는 transformPoint 의 복사본 (m−k) mod m 이다 — 켤레 좌표계의 부호 반전", () => {
    let matched = 0;
    let naive = 0;
    for (const count of [3, 4, 6, 8]) {
      for (const { spectrum } of fitAll()) {
        const source = reconstruct(spectrum, Q);
        for (let copy = 1; copy < count; copy += 1) {
          const derived = reconstruct(applyOperator(spectrum, "rotate", count, copy), Q);
          matched = Math.max(matched, maxPointError(derived,
            source.map((p) => transformPoint(p, "rotate", count, (count - copy) % count))));
          naive = Math.max(naive, maxPointError(derived,
            source.map((p) => transformPoint(p, "rotate", count, copy))));
        }
      }
    }
    expect(matched).toBeLessThan(TOL);   // 실측 4.55e-14
    // naive 는 최댓값이다. k = m/2(180°)는 자기 역원이라 그 항만 0에 가깝고, 나머지가 크게 어긋난다.
    expect(naive).toBeGreaterThan(1);    // 실측 7.68e+1
  });

  it("R^a ∘ R^b = R^(a+b)", () => {
    const spectrum = fitStroke(blob(), "closed");
    const twice = applyOperator(applyOperator(spectrum, "rotate", 6, 1), "rotate", 6, 1);
    expect(maxPointError(reconstruct(twice, Q), reconstruct(applyOperator(spectrum, "rotate", 3, 1), Q)))
      .toBeLessThan(TOL);   // 실측 1.59e-14
  });
});

describe("재샘플과 변환의 교환법칙 — T2", () => {
  // 스펙 §3: 렌더는 제어점을 변환하고 분석은 재샘플 후 변환한다. 지금은 대칭이 아핀이라
  // 두 순서가 같지만, 비아핀 대칭(나선, 스케일 그라디언트)을 넣으면 화면과 식이 조용히 갈라진다.
  // 이 테스트는 새 동작을 요구하지 않는다 — 통과가 기대값이고, 깨지는 날이 그 경고다.
  it("resample(transform(points)) 와 transform(resample(points)) 가 같은 표본을 만든다", () => {
    const pipeline = (points: Point[], closure: Closure) => {
      const closed = closure === "closed";
      const { poly, length } = densify(points, closed);
      const P = sampleCount(length);
      return { P, samples: resampleUniform(poly, length, P, closed) };
    };
    const operators: [Symmetry, number, number][] = [
      ["rotate", 3, 1], ["rotate", 4, 1], ["rotate", 6, 5], ["rotate", 8, 3],
      ["mirrorX", 2, 1], ["mirrorY", 2, 1]
    ];
    let worst = 0;
    for (const { name, points, closure } of FIXTURES) {
      const before = pipeline(points, closure);
      for (const [symmetry, count, copy] of operators) {
        const after = pipeline(points.map((p) => transformPoint(p, symmetry, count, copy)), closure);
        // 호길이가 등거리변환에 불변이므로 P 도 같아야 한다. 여기가 갈라지면 표본 수부터 다르다.
        expect(after.P, `${name} ${symmetry}`).toBe(before.P);
        worst = Math.max(worst, maxPointError(after.samples,
          before.samples.map((p) => transformPoint(p, symmetry, count, copy))));
      }
    }
    expect(worst).toBeLessThan(TOL);   // 실측 2.31e-13 (호길이 차 최대 2.84e-13)
  });
});
