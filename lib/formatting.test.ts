import { describe, expect, it } from "vitest";

import type { CircleAnalysis, OperatorDesc, StrokeAnalysis } from "@/lib/analysis";
import { formatAccuracy, formatDecomposition, formatLatex, formatOperator, formatStrokeExpr, formatStructure, formatSummarySentence } from "@/lib/formatting";
import type { FitStats, Spectrum } from "@/lib/fourier";
import type { Closure, Stroke, Symmetry } from "@/lib/geometry";
import { getMetrics } from "@/lib/metrics";

// formatting은 타입만 읽으므로 픽스처를 손으로 적는다. 적합을 돌리지 않는 것이 이 모듈을 분리한 이유다.
const stats = (P: number, accuracy: number, arcLength = 60): FitStats =>
  ({ P, arcLength, normS: 30, rmsError: 0.1, maxError: 0.2, accuracy, capped: false });

// terms는 진폭 내림차순으로 저장된다(D-C). WAVE의 |b₁|=3.2 > |b₃|=0.90 순서가 그것이다.
// formatting은 이 순서를 재정렬하지 않고 그대로 적는다.
const CIRCLE: Spectrum = { kind: "closed", c0: { re: 0, im: 0 }, terms: [{ n: 1, re: 30, im: 0 }], stats: stats(384, 0.9999) };
const LINE: Spectrum = { kind: "open", z0: { re: -20, im: 0 }, delta: { re: 40, im: 0 }, terms: [], stats: stats(128, 1) };
const WAVE: Spectrum = {
  kind: "open", z0: { re: -30, im: -5.25 }, delta: { re: 60, im: 0 },
  terms: [{ n: 1, re: 0, im: -3.2 }, { n: 3, re: 0.8, im: 0.42 }], stats: stats(160, 0.9921)
};
// point의 length는 호길이다(D-E). 0이 아니라 임계(1e-6) 아래 값이다. formatting은 이 값을 읽지 않는다.
const DOT: Spectrum = { kind: "point", length: 4e-7 };
// kind는 closed인데 호길이가 0 — Task 7의 가중 평균에서 valid가 비어 accuracy가 null로 남는 경로다.
const FROZEN: Spectrum = { kind: "closed", c0: { re: 0, im: 0 }, terms: [{ n: 1, re: 30, im: 0 }], stats: stats(384, 0, 0) };

const ROTATE: OperatorDesc = { kind: "rotate", count: 6 };
const MIRROR_X: OperatorDesc = { kind: "mirrorX", count: 2 };
const IDENTITY: OperatorDesc = { kind: "identity", count: 1 };

const stroke = (id: string, symmetry: Symmetry, closure: Closure): Stroke =>
  ({ id, points: [{ x: 20, y: 50 }, { x: 80, y: 50 }], symmetry, rotationCount: 6, closure });
const item = (id: string, symmetry: Symmetry, closure: Closure, spectrum: Spectrum, operator: OperatorDesc): StrokeAnalysis =>
  ({ stroke: stroke(id, symmetry, closure), spectrum, operator });

// uniformSymmetry.count와 OperatorDesc.count는 "복사본 수"다(D-I). rotate×6 → 6, mirrorX → 2, free → 1.
const analysis = (over: Partial<CircleAnalysis>): CircleAnalysis => ({
  metrics: getMetrics([]), strokes: [], totalTerms: 0, accuracy: null,
  worst: null, uniformSymmetry: null, silhouette: "", ...over
});

const EMPTY = analysis({});
const SINGLE = analysis({
  strokes: [item("a", "rotate", "closed", CIRCLE, ROTATE)],
  uniformSymmetry: { symmetry: "rotate", count: 6 }, totalTerms: 1, accuracy: 0.9999, silhouette: "r(θ) = 29.6"
});
const MIRRORED = analysis({
  strokes: [item("a", "mirrorX", "open", WAVE, MIRROR_X)],
  uniformSymmetry: { symmetry: "mirrorX", count: 2 }, totalTerms: 2, accuracy: 0.9921, silhouette: "r(θ) = 20.1"
});
const MIXED = analysis({
  strokes: [
    item("a", "rotate", "closed", CIRCLE, ROTATE),
    item("b", "mirrorX", "open", WAVE, MIRROR_X),
    item("c", "free", "open", LINE, IDENTITY)
  ],
  uniformSymmetry: null, totalTerms: 3, accuracy: 0.9932,
  worst: { index: 1, accuracy: 0.9921 }, silhouette: "r(θ) = 29.6 + 3.2cos(12θ − 1.29)"
});
const DEGENERATE = analysis({
  strokes: [item("a", "free", "point", DOT, IDENTITY), item("b", "free", "open", LINE, IDENTITY)],
  uniformSymmetry: { symmetry: "free", count: 1 }, totalTerms: 0, accuracy: 1, silhouette: "r(θ) = 12.0"
});
const ALL_DEGENERATE = analysis({
  strokes: [item("a", "free", "point", DOT, IDENTITY)],
  uniformSymmetry: { symmetry: "free", count: 1 }
});
// 유효 획이 있는데 accuracy가 null인 유일한 경로. 이 픽스처가 없으면 null 분기가 한 번도 실행되지 않는다.
const UNWEIGHTED = analysis({
  strokes: [item("a", "free", "closed", FROZEN, IDENTITY)],
  uniformSymmetry: { symmetry: "free", count: 1 }, totalTerms: 1, accuracy: null, silhouette: "r(θ) = 0.0"
});

describe("formatOperator", () => {
  it("두 번째 인자는 회전 수다 — 복사본 수를 넘기지 않는다", () => {
    expect(formatOperator("rotate", 6)).toBe("R₆");
    expect(formatOperator("rotate", 12)).toBe("R₁₂");
    expect(formatOperator("mirrorX", 2)).toBe("M_x");
    expect(formatOperator("mirrorY", 2)).toBe("M_y");
    expect(formatOperator("free", 1)).toBe("I");
  });
});

describe("formatAccuracy", () => {
  it("유효 획이 없으면 0%가 아니라 —", () => {
    expect(formatAccuracy(null)).toBe("—");
  });

  it("잔차가 정확히 0인 획만 100%", () => {
    expect(formatAccuracy(1)).toBe("100%");
    expect(formatAccuracy(1.0000001)).toBe("100%");
  });

  it("근사식에 100%를 찍지 않는다 — 99.9%로 클램프", () => {
    expect(formatAccuracy(0.9999999999999999)).toBe("99.9%");
    expect(formatAccuracy(0.999999)).toBe("99.9%");
    expect(formatAccuracy(0.9999)).toBe("99.9%");
  });

  it("미달을 위로 반올림하지 않고 소수 한 자리로 내린다", () => {
    expect(formatAccuracy(0.9932)).toBe("99.3%");
    expect(formatAccuracy(0.99)).toBe("99.0%");
    expect(formatAccuracy(0.98999999999)).toBe("98.9%");
    expect(formatAccuracy(0.94159)).toBe("94.1%");
  });

  it("쟀는데 실패한 0%는 —와 구분된다", () => {
    expect(formatAccuracy(0)).toBe("0.0%");
    expect(formatAccuracy(-0.2)).toBe("0.0%");
    expect(formatAccuracy(Number.NaN)).toBe("0.0%");
  });
});

describe("formatStructure", () => {
  it("획이 없으면 공집합", () => expect(formatStructure(EMPTY)).toBe("Z(t) = ∅"));
  it("전부 퇴화여도 공집합", () => expect(formatStructure(ALL_DEGENERATE)).toBe("Z(t) = ∅"));
  it("대칭이 같으면 복사본 범위를 적는다 — count는 이미 복사본 수라 -1만 한다", () => {
    expect(formatStructure(SINGLE)).toBe("Z(t) = ⋃(k=0..5) R^k z_j(t)");
    expect(formatStructure(MIRRORED)).toBe("Z(t) = ⋃(k=0..1) M_x^k z_j(t)");
    expect(formatStructure(DEGENERATE)).toBe("Z(t) = ⋃_j z_j(t)");
  });
  it("대칭이 섞이면 연산자를 획별로 낮춘다", () => expect(formatStructure(MIXED)).toBe("Z(t) = ⋃_j S_j[z_j(t)]"));
});

describe("formatSummarySentence", () => {
  it("획이 없으면 실패가 아니라 안내", () => expect(formatSummarySentence(EMPTY)).toBe("획을 그리면 식이 나타납니다"));
  it("전부 퇴화여도 같은 안내", () => expect(formatSummarySentence(ALL_DEGENERATE)).toBe("획을 그리면 식이 나타납니다"));
  it("대칭 · 획 수 · 항 수를 적는다", () => {
    expect(formatSummarySentence(SINGLE)).toBe("6겹 회전 · 1획 · 1항으로 재현");
    expect(formatSummarySentence(MIRRORED)).toBe("좌우 대칭 · 1획 · 2항으로 재현");
    expect(formatSummarySentence(MIXED)).toBe("혼합 대칭 · 3획 · 3항으로 재현");
  });
  it("퇴화 획은 획 수에서 뺀다", () => expect(formatSummarySentence(DEGENERATE)).toBe("대칭 없음 · 1획 · 0항으로 재현"));
  it("정확도가 null이어도 문장은 나온다 — 문장은 accuracy를 읽지 않는다", () =>
    expect(formatSummarySentence(UNWEIGHTED)).toBe("대칭 없음 · 1획 · 1항으로 재현"));
});

describe("formatStrokeExpr", () => {
  it("닫힌 획은 지수급수", () => expect(formatStrokeExpr(MIXED.strokes[0], 0)).toBe("z₁(t) = c₀ + Σ c_n e^(2πint)"));
  it("열린 획은 아핀 항 + 사인급수", () => expect(formatStrokeExpr(MIXED.strokes[1], 1)).toBe("z₂(t) = z₀ + Δt + Σ b_n sin(πnt)"));
  it("직선은 0항이라 급수 자체가 없다", () => expect(formatStrokeExpr(MIXED.strokes[2], 2)).toBe("z₃(t) = z₀ + Δt"));
  it("퇴화 획은 상수라고 밝힌다", () => expect(formatStrokeExpr(DEGENERATE.strokes[0], 0)).toBe("z₁(t) = 상수 · 퇴화 획"));
  it("두 자리 번호도 아래첨자", () => expect(formatStrokeExpr(MIXED.strokes[0], 11)).toBe("z₁₂(t) = c₀ + Σ c_n e^(2πint)"));
});

describe("formatLatex", () => {
  it("획이 없으면 좌표계와 공집합만", () => expect(formatLatex(EMPTY)).toBe([
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100",
    "\\[ Z(t) = \\emptyset \\]"
  ].join("\n")));

  it("단일 획은 계수를 그대로 적는다", () => expect(formatLatex(SINGLE)).toBe([
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100",
    "% 연산자: R_{6}z = e^{2\\pi i/6}z",
    "% 재현: 1획 · 1항 · 정확도 99.9%",
    "% 외곽 실루엣: r(θ) = 29.6",
    "\\[",
    "\\begin{aligned}",
    "Z(t) &= \\bigcup_{j}\\bigcup_{k=0}^{5} R^{k} z_{j}(t) \\\\",
    "z_{1}(t) &= (0.00 + 0.00i) + (30.00 + 0.00i)\\,e^{2\\pi i (1) t}",
    "\\end{aligned}",
    "\\]"
  ].join("\n")));

  it("혼합 대칭은 획마다 연산자를 붙인다", () => expect(formatLatex(MIXED)).toBe([
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100",
    "% 연산자: R_{6}z = e^{2\\pi i/6}z · M_{x}z = -\\overline{z} · I z = z",
    "% 재현: 3획 · 3항 · 정확도 99.3%",
    "% 외곽 실루엣: r(θ) = 29.6 + 3.2cos(12θ − 1.29)",
    "\\[",
    "\\begin{aligned}",
    "Z(t) &= \\bigcup_{j} S_{j}[z_{j}(t)] \\\\",
    "z_{1}(t) &= (0.00 + 0.00i) + (30.00 + 0.00i)\\,e^{2\\pi i (1) t} \\quad (S_{1} = R_{6}) \\\\",
    "z_{2}(t) &= (-30.00 - 5.25i) + (60.00 + 0.00i)\\,t + (0.00 - 3.20i)\\,\\sin(\\pi (1) t) + (0.80 + 0.42i)\\,\\sin(\\pi (3) t) \\quad (S_{2} = M_{x}) \\\\",
    "z_{3}(t) &= (-20.00 + 0.00i) + (40.00 + 0.00i)\\,t \\quad (S_{3} = I)",
    "\\end{aligned}",
    "\\]"
  ].join("\n")));

  it("퇴화 획은 주석으로 빼고 본문 번호는 유지한다", () => expect(formatLatex(DEGENERATE)).toBe([
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100",
    "% 연산자: I z = z",
    "% 재현: 1획 · 0항 · 정확도 100%",
    "% 외곽 실루엣: r(θ) = 12.0",
    "% 퇴화 획(계수 없음): z_{1}",
    "\\[",
    "\\begin{aligned}",
    "Z(t) &= \\bigcup_{j} z_{j}(t) \\\\",
    "z_{2}(t) &= (-20.00 + 0.00i) + (40.00 + 0.00i)\\,t",
    "\\end{aligned}",
    "\\]"
  ].join("\n")));

  it("유효 획이 있어도 정확도가 null이면 —로 적는다", () => expect(formatLatex(UNWEIGHTED)).toBe([
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100",
    "% 연산자: I z = z",
    "% 재현: 1획 · 1항 · 정확도 —",
    "% 외곽 실루엣: r(θ) = 0.0",
    "\\[",
    "\\begin{aligned}",
    "Z(t) &= \\bigcup_{j} z_{j}(t) \\\\",
    "z_{1}(t) &= (0.00 + 0.00i) + (30.00 + 0.00i)\\,e^{2\\pi i (1) t}",
    "\\end{aligned}",
    "\\]"
  ].join("\n")));
});

// 카드 뒷면의 <dd>분해</dd> 한 줄. 카드는 수집품이라 계수를 싣지 않는다(§4.5) —
// 이 줄이 카드가 식에 대해 말하는 전부다.
describe("formatDecomposition", () => {
  it("유효 획이 없으면 0획이 아니라 —", () => {
    expect(formatDecomposition(EMPTY)).toBe("—");
    expect(formatDecomposition(ALL_DEGENERATE)).toBe("—");
  });

  it("퇴화 획을 뺀 획 수 · 항 수 · 정확도를 한 줄로 적는다", () => {
    expect(formatDecomposition(SINGLE)).toBe("1획 · 1항 · 99.9%");
    expect(formatDecomposition(MIXED)).toBe("3획 · 3항 · 99.3%");
    expect(formatDecomposition(DEGENERATE)).toBe("1획 · 0항 · 100%");
  });

  // 푸터(문장)와 카드(숫자)가 같은 그림에 대해 다른 획 수를 말하면 둘 다 신뢰를 잃는다.
  it("푸터 요약 문장과 획 수가 어긋나지 않는다", () => {
    for (const one of [SINGLE, MIRRORED, MIXED, DEGENERATE]) {
      const count = formatDecomposition(one).split(" · ")[0];
      expect(formatSummarySentence(one)).toContain(`· ${count} ·`);
    }
  });
});
