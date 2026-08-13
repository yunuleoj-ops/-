// 이 스위트가 지키는 것: 직선 0항(스펙 D1의 판매 근거), 진폭 내림차순 저장(D-C),
// 공유 정지 코어가 열림에도 같은 규칙으로 작동한다는 것(D-D·D-F), 그리고 보고된 정확도가 참이라는 것(T7·T10).

import { describe, expect, it } from "vitest";

import type { Point } from "@/lib/geometry";
import { densify, resampleUniform, toComplex, type Complex } from "@/lib/resample";
import { ABS_FLOOR, T_MAX, fitStroke, overlayPointCount, reconstruct, truncate, type FitOptions, type Spectrum, type Term } from "@/lib/fourier";

// ---- 픽스처: 전부 결정적. 난수도 스냅샷도 쓰지 않는다 ----
const straightPoints = (a: Point, b: Point, count = 2): Point[] =>
  Array.from({ length: count }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / (count - 1),
    y: a.y + ((b.y - a.y) * i) / (count - 1)
  }));

const arcPoints = (degrees: number, radius = 30, segments = 24): Point[] =>
  Array.from({ length: segments + 1 }, (_, i) => {
    const angle = ((degrees * Math.PI) / 180) * (i / segments);
    return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
  });

const wavePoints = (cycles = 2, amplitude = 14, span = 60, segments = 40): Point[] =>
  Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    return { x: 50 - span / 2 + span * t, y: 50 - amplitude * Math.sin(2 * Math.PI * cycles * t) };
  });

// J 갈고리: 수직으로 내려오다 반원으로 말려 올라간다(접선 연속, 곡률만 점프).
const hookPoints = (drop = 24, radius = 10, downSteps = 12, turnSteps = 16): Point[] => {
  const top = 50 - drop / 2;
  const bottom = 50 + drop / 2;
  const points: Point[] = [];
  for (let i = 0; i <= downSteps; i += 1) points.push({ x: 50, y: top + (drop * i) / downSteps });
  for (let i = 1; i <= turnSteps; i += 1) {
    const angle = Math.PI - (Math.PI * i) / turnSteps;
    points.push({ x: 50 + radius + radius * Math.cos(angle), y: bottom + radius * Math.sin(angle) });
  }
  return points;
};

// 직각 코너: 가로 30 → 아래로 40. 접선이 끊기므로 열린 획 중 유일하게 국소 꺾임 보정을 발동시킨다.
const cornerPoints = (across = 30, down = 40, step = 2): Point[] => {
  const points: Point[] = [];
  for (let x = 20; x <= 20 + across; x += step) points.push({ x, y: 30 });
  for (let y = 30 + step; y <= 30 + down; y += step) points.push({ x: 20 + across, y });
  return points;
};

type OpenSpectrum = Extract<Spectrum, { kind: "open" }>;

const fitOpenStroke = (points: Point[], options?: FitOptions): OpenSpectrum => {
  const spectrum = fitStroke(points, "open", options);
  if (spectrum.kind !== "open") throw new Error(`expected kind "open", got "${spectrum.kind}"`);
  return spectrum;
};

const amplitudeOf = (term: Term) => Math.hypot(term.re, term.im);

// 라이브러리를 쓰지 않고 식을 직접 평가한다. 정확도가 자기 자신을 채점하지 못하게 하기 위함이다.
// terms 를 인자로 받는 이유: 부분합의 끝점 통과를 truncate 없이 재기 위해서다.
const evaluate = (spectrum: OpenSpectrum, terms: Term[], t: number): Complex => {
  let re = spectrum.z0.re + t * spectrum.delta.re;
  let im = spectrum.z0.im + t * spectrum.delta.im;
  for (const term of terms) {
    const basis = Math.sin(Math.PI * term.n * t);
    re += term.re * basis;
    im += term.im * basis;
  }
  return { re, im };
};

const samplesOf = (points: Point[], P: number): Complex[] => {
  const { poly, length } = densify(points, false);
  return resampleUniform(poly, length, P, false).map(toComplex);
};

const shapes = [
  { name: "반원 180°", points: arcPoints(180), terms: 3 },
  { name: "완만한 호 90°", points: arcPoints(90), terms: 3 },
  { name: "물결 2주기", points: wavePoints(), terms: 5 },
  { name: "갈고리", points: hookPoints(), terms: 4 },
  { name: "직각 코너", points: cornerPoints(), terms: 15 }
];

describe("fitStroke — 열린 획", () => {
  it("완전한 직선은 0항으로 정확하다", () => {
    const cases = [
      straightPoints({ x: 20, y: 50 }, { x: 80, y: 50 }),
      straightPoints({ x: 20, y: 20 }, { x: 80, y: 75 }),
      straightPoints({ x: 20, y: 20 }, { x: 80, y: 75 }, 9)
    ];
    for (const points of cases) {
      const spectrum = fitOpenStroke(points);
      expect(spectrum.terms).toEqual([]);
      expect(spectrum.stats.rmsError).toBeLessThan(1e-9);
      expect(spectrum.stats.maxError).toBeLessThan(1e-9);
      expect(spectrum.stats.accuracy).toBeCloseTo(1, 10);
      expect(spectrum.stats.capped).toBe(false);
      expect(spectrum.stats.normS).toBeGreaterThan(0);   // 0항인데 분모가 0이면 정확도가 자기충족적이다
    }
  });

  it("반원의 계수가 해석해와 일치한다", () => {
    const spectrum = fitOpenStroke(arcPoints(180));
    // r(t) = 30e^{iπt} − 30 + 60t → b₁ = 30i, b₂ = 20/π, b₄ = 2/π, 홀수 n ≥ 3 은 정확히 0.
    expect(spectrum.terms.map((term) => term.n)).toEqual([1, 2, 4]);
    expect(Math.hypot(spectrum.terms[0].re, spectrum.terms[0].im - 30)).toBeLessThan(0.01);
    expect(Math.hypot(spectrum.terms[1].re - 20 / Math.PI, spectrum.terms[1].im)).toBeLessThan(0.01);
    expect(Math.hypot(spectrum.terms[2].re - 2 / Math.PI, spectrum.terms[2].im)).toBeLessThan(0.01);
    expect(Math.hypot(spectrum.z0.re - 30, spectrum.z0.im)).toBeLessThan(1e-9);
    expect(Math.hypot(spectrum.delta.re + 60, spectrum.delta.im)).toBeLessThan(1e-9);
    expect(spectrum.stats.P).toBe(188);
    expect(spectrum.stats.arcLength).toBeCloseTo(94.2438, 3);
  });

  it("열린 획이 T_max 안에서 목표 정확도에 도달한다", () => {
    for (const shape of shapes) {
      const spectrum = fitOpenStroke(shape.points);
      expect({ name: shape.name, terms: spectrum.terms.length }).toEqual({ name: shape.name, terms: shape.terms });
      expect(spectrum.terms.length).toBeLessThanOrEqual(T_MAX);
      expect(spectrum.stats.capped, shape.name).toBe(false);
      expect(spectrum.stats.accuracy, shape.name).toBeGreaterThan(0.99);
      expect(spectrum.terms.every((term) => term.n >= 1), shape.name).toBe(true);
      expect(new Set(spectrum.terms.map((term) => term.n)).size, shape.name).toBe(spectrum.terms.length);
    }
  });

  it("항을 진폭 내림차순으로 저장한다", () => {
    // D-C: truncate(k) = "진폭 상위 k개" 계약의 근거. n 오름차순으로 재정렬하면 이 단언이 깨진다.
    // 물결은 |b₁₂| = 1.1389 > |b₈| = 1.0618 이라 두 순서가 실제로 갈리는 픽스처다.
    expect(fitOpenStroke(wavePoints()).terms.map((term) => term.n)).toEqual([4, 12, 8, 20, 16]);
    for (const shape of shapes) {
      const amplitudes = fitOpenStroke(shape.points).terms.map(amplitudeOf);
      expect(amplitudes, shape.name).toEqual([...amplitudes].sort((a, b) => b - a));
    }
  });

  it("보고된 오차가 표본에서 실제로 성립한다", () => {
    for (const shape of shapes) {
      const spectrum = fitOpenStroke(shape.points);
      const P = spectrum.stats.P;
      const samples = samplesOf(shape.points, P);
      let square = 0;
      let worst = 0;
      for (let k = 0; k <= P; k += 1) {
        const hat = evaluate(spectrum, spectrum.terms, k / P);
        const gap = Math.hypot(samples[k].re - hat.re, samples[k].im - hat.im);
        square += gap * gap;
        worst = Math.max(worst, gap);
      }
      const measured = Math.sqrt(square / (P + 1));
      expect(Math.abs(measured - spectrum.stats.rmsError) / measured, shape.name).toBeLessThan(1e-9);
      expect(worst, shape.name).toBeCloseTo(spectrum.stats.maxError, 10);
      expect(spectrum.stats.accuracy, shape.name).toBeCloseTo(1 - measured / spectrum.stats.normS, 10);
    }
  });

  it("재구성이 양 끝점을 항 수와 무관하게 정확히 지난다", () => {
    for (const shape of shapes) {
      const spectrum = fitOpenStroke(shape.points);
      const samples = samplesOf(shape.points, spectrum.stats.P);
      const last = samples[spectrum.stats.P];
      for (let count = 0; count <= spectrum.terms.length; count += 1) {
        const partial = spectrum.terms.slice(0, count);
        const head = evaluate(spectrum, partial, 0);
        const tail = evaluate(spectrum, partial, 1);
        const label = `${shape.name} ${count}항`;
        expect(Math.hypot(head.re - samples[0].re, head.im - samples[0].im), label).toBeLessThan(1e-12);
        expect(Math.hypot(tail.re - last.re, tail.im - last.im), label).toBeLessThan(1e-12);
      }
    }
  });

  it("시작점과 끝점이 같은 열린 획도 NaN 없이 처리한다", () => {
    const spectrum = fitOpenStroke(arcPoints(360, 4, 16));
    expect(Math.hypot(spectrum.delta.re, spectrum.delta.im)).toBeLessThan(1e-9);   // Δ ≈ 0 이어도 0으로 나누지 않는다
    expect(spectrum.terms.length).toBeGreaterThan(0);
    for (const term of spectrum.terms) {
      expect(Number.isFinite(term.re)).toBe(true);
      expect(Number.isFinite(term.im)).toBe(true);
    }
    expect(Number.isFinite(spectrum.stats.rmsError)).toBe(true);
    expect(spectrum.stats.accuracy).toBeGreaterThan(0);
    expect(spectrum.stats.accuracy).toBeLessThanOrEqual(1);
    // 반지름 4짜리 작은 획이라 절대 하한(0.15)에서 멈춘다 — 항 낭비 방지가 열림에도 그대로 걸린다.
    expect(spectrum.stats.rmsError).toBeLessThanOrEqual(ABS_FLOOR);
    expect(spectrum.stats.accuracy).toBeLessThan(0.99);
  });

  it("국소 꺾임 보호가 열린 획에서도 같은 규칙으로 발동한다", () => {
    // 공유 코어(selectAndFinalize)가 실제로 공유되는지 재는 유일한 테스트다.
    // 열림이 자기 정지 규칙을 따로 갖고 있으면 여기서만 빨강이 된다.
    const stopped = fitOpenStroke(cornerPoints(), { maxTerms: 10 });   // 그리디 정지 시점을 재현
    expect(stopped.stats.rmsError).toBeCloseTo(0.148, 2);
    expect(stopped.stats.maxError).toBeCloseTo(0.720, 1);
    expect(stopped.stats.maxError).toBeGreaterThan(3 * stopped.stats.rmsError);   // 실측 비율 4.863
    expect(stopped.stats.maxError).toBeGreaterThan(ABS_FLOOR);                    // D-F 의 두 번째 조건

    const grown = fitOpenStroke(cornerPoints());
    expect(grown.terms.length).toBe(15);                 // ceil(10 × 1.5)
    expect(grown.stats.rmsError).toBeCloseTo(0.08154, 4);
    expect(grown.stats.maxError).toBeCloseTo(0.45749, 4);
    expect(grown.stats.accuracy).toBeCloseTo(0.994991, 5);

    // 잔차가 매끄러운 획은 발동하지 않는다 — 성장 규칙이 항상 켜지면 직선 0항이 무너진다.
    const smooth = fitOpenStroke(arcPoints(90));
    expect(smooth.stats.maxError).toBeLessThanOrEqual(3 * smooth.stats.rmsError);
  });
});
describe("truncate · reconstruct — 열린 획", () => {
  it("truncate는 진폭 상위 k항만 남기고 오차를 다시 센다", () => {
    for (const shape of shapes) {
      const fit = fitOpenStroke(shape.points);
      let previous = Infinity;
      for (let count = 0; count <= fit.terms.length; count += 1) {
        const view = truncate(fit, count);
        if (view.kind !== "open") throw new Error("열린 스펙트럼이 아니다");
        const label = `${shape.name} ${count}항`;
        expect(view.terms, label).toEqual(fit.terms.slice(0, count));   // 진폭 상위 k개, 재정렬 없음
        expect(view.stats.rmsError, label).toBeLessThanOrEqual(previous + 1e-12);
        expect(view.z0, label).toBe(fit.z0);        // 아핀 항은 항 수와 무관하다 — 슬라이더가 끝점을 흔들지 않는 근거
        expect(view.delta, label).toBe(fit.delta);
        expect(view.stats.capped, label).toBe(false);
        previous = view.stats.rmsError;
      }
      expect(truncate(fit, fit.terms.length)).toBe(fit);   // 전량이면 같은 객체
      expect(truncate(fit, 999)).toBe(fit);
      const none = truncate(fit, -3);
      if (none.kind !== "open") throw new Error("열린 스펙트럼이 아니다");
      expect(none.terms).toHaveLength(0);
    }
    // 닫힘과 달리 0항 오차는 normS 가 아니다 — z₀ + Δt 가 이미 획의 상당 부분을 설명하고 있다.
    // 이 차이를 놓치고 normS² 에서 빼면 열린 획의 슬라이더 정확도가 전 구간 거짓이 된다.
    const semi = fitOpenStroke(arcPoints(180));
    const zero = truncate(semi, 0);
    if (zero.kind !== "open") throw new Error("열린 스펙트럼이 아니다");
    expect(zero.stats.rmsError).toBeCloseTo(21.6332, 3);
    expect(zero.stats.accuracy).toBeCloseTo(0.068178, 5);
    expect(semi.stats.normS).toBeCloseTo(23.2161, 3);
  });

  it("truncate(k)와 maxTerms:k 적합이 같은 항·같은 오차를 낸다", () => {
    for (const shape of shapes) {
      const fit = fitOpenStroke(shape.points);
      for (let count = 1; count < fit.terms.length; count += 1) {
        const view = truncate(fit, count);
        const refit = fitOpenStroke(shape.points, { maxTerms: count });
        if (view.kind !== "open") throw new Error("열린 스펙트럼이 아니다");
        const label = `${shape.name} ${count}항`;
        expect(view.terms.map((term) => term.n), label).toEqual(refit.terms.map((term) => term.n));
        expect(view.stats.rmsError, label).toBeCloseTo(refit.stats.rmsError, 9);
        expect(view.stats.accuracy, label).toBeCloseTo(refit.stats.accuracy, 9);
      }
    }
  });

  it("reconstruct는 끝점을 포함한 q개를 돌려준다", () => {
    for (const shape of shapes) {
      const fit = fitOpenStroke(shape.points);
      const q = overlayPointCount(fit);
      const drawn = reconstruct(fit, q);
      expect(drawn, shape.name).toHaveLength(q);
      // 같은 t 격자(j/(q−1))에서 원곡선을 뽑아 점대점으로 비교한다.
      const { poly, length } = densify(shape.points, false);
      const truth = resampleUniform(poly, length, q - 1, false);
      expect(truth, shape.name).toHaveLength(q);
      let worst = 0;
      for (let i = 0; i < q; i += 1) worst = Math.max(worst, Math.hypot(drawn[i].x - truth[i].x, drawn[i].y - truth[i].y));
      expect(Math.hypot(drawn[0].x - truth[0].x, drawn[0].y - truth[0].y), shape.name).toBeLessThan(1e-12);
      expect(Math.hypot(drawn[q - 1].x - truth[q - 1].x, drawn[q - 1].y - truth[q - 1].y), shape.name).toBeLessThan(1e-12);
      expect(worst, shape.name).toBeLessThanOrEqual(fit.stats.maxError * 1.05 + 1e-9);   // 실측 비 0.975 ~ 1.001
      // 슬라이더를 1항으로 내려도 끝점은 그대로다 — 오버레이가 획 끝에서 튀지 않는 근거.
      const one = reconstruct(truncate(fit, 1), q);
      expect(Math.hypot(one[0].x - truth[0].x, one[0].y - truth[0].y), shape.name).toBeLessThan(1e-12);
      expect(Math.hypot(one[q - 1].x - truth[q - 1].x, one[q - 1].y - truth[q - 1].y), shape.name).toBeLessThan(1e-12);
    }
    const fit = fitOpenStroke(arcPoints(180));
    expect(reconstruct(fit, 0)).toEqual([]);
    expect(reconstruct(fit, 1)).toEqual([{ x: 80, y: 50 }]);   // q = 1 은 0으로 나누지 않고 시작점만
    expect(reconstruct(fit, 64)).toHaveLength(64);
  });

  it("퇴화 획은 truncate·reconstruct를 그대로 통과한다", () => {
    // 새 동작을 요구하지 않는 가드다. 이 스텝이 두 함수의 첫 줄을 갈아끼우므로 point 경로가 살아 있는지 잡아 둔다.
    const degenerate = fitStroke(Array.from({ length: 12 }, () => ({ x: 50, y: 50 })), "open");
    expect(degenerate.kind).toBe("point");
    expect(truncate(degenerate, 3)).toBe(degenerate);
    expect(reconstruct(degenerate, 64)).toEqual([]);
    expect(overlayPointCount(degenerate)).toBe(0);
    // D-E: point 의 length 는 호길이다. 열림으로 들어와도 point 로 떨어지면 여기서 걸러진다.
    const asPoint = fitStroke(arcPoints(180), "point");
    if (asPoint.kind !== "point") throw new Error("point 가 아니다");
    expect(asPoint.length).toBeCloseTo(94.2438, 3);
    expect(reconstruct(asPoint, 64)).toEqual([]);
  });
});
