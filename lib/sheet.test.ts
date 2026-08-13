// 시트의 계산은 전부 여기서 고정한다. 컴포넌트에는 계산을 남기지 않는다(§7: jsdom 없음).
// 정확도 문자열(formatAccuracy)은 lib/formatting 소유라 여기서 다시 단언하지 않는다 —
// 이 파일이 검사하는 것은 "시트가 그 함수를 부른다"는 것뿐이고, 평문 복사 테스트가 그것을 본다.

import { describe, expect, it } from "vitest";

import type { CircleAnalysis, StrokeAnalysis } from "@/lib/analysis";
import { TARGET_ACCURACY, type ClosedSpectrum, type FitStats, type Spectrum, type Term } from "@/lib/fourier";
import type { Stroke, Symmetry } from "@/lib/geometry";
import type { Metrics } from "@/lib/metrics";
import {
  achievedTarget, baseRows, coefficientRows, legendLines, maxTermCount, originalPaths,
  reachedTarget, reconstructedPaths, sheetPlainText, termCountOf, termsAtCap
} from "@/lib/sheet";

const STATS: FitStats = { P: 128, arcLength: 60, normS: 20, rmsError: 0.1, maxError: 0.3, accuracy: 0.995, capped: false };

const strokeOf = (id: string, symmetry: Symmetry, rotationCount = 6, closure: Stroke["closure"] = "closed"): Stroke =>
  ({ id, points: [{ x: 20, y: 50 }, { x: 80, y: 50 }], symmetry, rotationCount, closure });

const closed = (terms: Term[]): ClosedSpectrum => ({ kind: "closed", c0: { re: 0, im: 0 }, terms, stats: STATS });
// 진폭 내림차순 저장이 fourier 의 계약이다(D-C). 픽스처도 그 순서를 지킨다.
const band = (count: number): Term[] => Array.from({ length: count }, (_, index) => ({ n: index + 1, re: count - index, im: 0 }));

const operatorOf = (symmetry: Symmetry, rotationCount: number) =>
  symmetry === "rotate" ? { kind: "rotate" as const, count: rotationCount }
    : symmetry === "mirrorX" ? { kind: "mirrorX" as const, count: 2 }
      : symmetry === "mirrorY" ? { kind: "mirrorY" as const, count: 2 }
        : { kind: "identity" as const, count: 1 };

const item = (id: string, terms: Term[], symmetry: Symmetry = "free", rotationCount = 6): StrokeAnalysis =>
  ({ stroke: strokeOf(id, symmetry, rotationCount), spectrum: closed(terms), operator: operatorOf(symmetry, rotationCount) });

// 열린 획: z(t) = z₀ + Δt + Σ b_n sin(πnt). 항은 진폭 내림차순(14 → 2).
const openItem = (id: string, symmetry: Symmetry = "free", rotationCount = 6): StrokeAnalysis => ({
  stroke: strokeOf(id, symmetry, rotationCount, "open"),
  spectrum: {
    kind: "open", z0: { re: -30, im: 0 }, delta: { re: 60, im: 0 },
    terms: [{ n: 1, re: 0, im: 14 }, { n: 3, re: 0, im: 2 }], stats: STATS
  },
  operator: operatorOf(symmetry, rotationCount)
});

// point 의 length 는 호길이다. 0 이 아니다(D-E).
const pointItem = (id: string): StrokeAnalysis => ({
  stroke: strokeOf(id, "free", 6, "point"),
  spectrum: { kind: "point", length: 0.4 },
  operator: { kind: "identity", count: 1 }
});

const circleOf = (strokes: StrokeAnalysis[], over: Partial<CircleAnalysis> = {}): CircleAnalysis => ({
  metrics: {} as Metrics, strokes,
  totalTerms: strokes.reduce((sum, one) => sum + termCountOf(one.spectrum), 0),
  accuracy: 0.99, worst: null, uniformSymmetry: null, silhouette: "r(θ) = 30.0", ...over
});

describe("항 수 슬라이더 산술", () => {
  it("획당 상한을 획별로 자른 뒤 합으로 접는다", () => {
    const analysis = circleOf([item("a", band(6)), item("b", band(8)), item("c", band(1)), pointItem("d")]);
    expect(maxTermCount(analysis)).toBe(8);
    expect(termsAtCap(analysis, 1)).toBe(3);
    expect(termsAtCap(analysis, 4)).toBe(9);
    expect(termsAtCap(analysis, 8)).toBe(15);
    expect(termsAtCap(analysis, 999)).toBe(15);
    expect(termsAtCap(analysis, 0)).toBe(0);
    expect(maxTermCount(circleOf([]))).toBe(0);
  });
});

describe("계수표", () => {
  it("진폭 내림차순으로 세우고 위상을 [0,2π)로 정규화한다", () => {
    const rows = coefficientRows(closed([{ n: 5, re: 1, im: 0 }, { n: -1, re: 0, im: -3 }, { n: 2, re: -2, im: 0 }]));
    expect(rows.map((row) => row.n)).toEqual([-1, 2, 5]);
    expect(rows[0].magnitude).toBeCloseTo(3, 12);
    expect(rows[0].phase).toBeCloseTo((3 * Math.PI) / 2, 12);
    expect(rows[1].phase).toBeCloseTo(Math.PI, 12);
    expect(rows[2].phase).toBe(0);
    expect(rows.map((row) => Number(row.ratio.toFixed(3)))).toEqual([1, 0.667, 0.333]);
    expect(coefficientRows({ kind: "point", length: 0.4 })).toEqual([]);
  });

  it("기저 행은 닫힘이 c₀ 하나, 열림이 z₀와 Δ 둘이다", () => {
    const open = openItem("o").spectrum;
    expect(baseRows(closed([])).map((row) => row.label)).toEqual(["c₀"]);
    expect(baseRows(open).map((row) => row.label)).toEqual(["z₀", "Δ"]);
    expect(baseRows(open)[1].magnitude).toBeCloseTo(60, 12);
    expect(baseRows({ kind: "point", length: 0.4 })).toEqual([]);
  });
});

describe("오버레이 경로", () => {
  it("닫힌 획은 복사본을 전부 내고 Z로 닫는다 — 원 1항 + 회전 ×4", () => {
    const analysis = circleOf([item("c", [{ n: 1, re: 30, im: 0 }], "rotate", 4)]);
    const paths = reconstructedPaths(analysis, 1);
    expect(paths).toHaveLength(4);
    expect(new Set(paths.map((path) => path.key)).size).toBe(4);
    expect(paths.every((path) => !path.d.includes("NaN"))).toBe(true);
    expect(paths.every((path) => path.d.endsWith(" Z"))).toBe(true);
    // I2: 재구성 경로는 폴리라인 이미터를 쓴다 — pathFor(Catmull-Rom 큐빅)가 아니라 M + L만 나온다.
    expect(paths.every((path) => !path.d.includes("C"))).toBe(true);
    // 점 수는 overlayPointCount(=64)에서 온다. L 세그먼트가 63(=q−1)개라는 것이 그 증거다.
    expect(paths[0].d.split(" L").length - 1).toBe(63);
    expect(new Set(paths.map((path) => path.d.slice(0, path.d.indexOf(" L")))))
      .toEqual(new Set(["M80.00 50.00", "M50.00 20.00", "M20.00 50.00", "M50.00 80.00"]));
  });

  it("열린 획도 실제로 그려지고 Z로 닫지 않는다", () => {
    const analysis = circleOf([openItem("o", "mirrorX")]);
    const paths = reconstructedPaths(analysis, 2);
    expect(paths).toHaveLength(2);
    expect(paths.every((path) => path.d.length > 0)).toBe(true);
    expect(paths.some((path) => path.d.endsWith(" Z"))).toBe(false);
    expect(paths.every((path) => !path.d.includes("C"))).toBe(true);
    expect(paths.map((path) => path.d.slice(0, path.d.indexOf(" L"))))
      .toEqual(["M20.00 50.00", "M80.00 50.00"]);
    // cap 0 이면 사인 항이 전부 빠져 z₀ + Δt, 즉 y가 전부 50.00 인 직선 현이다.
    const chord = reconstructedPaths(analysis, 0)[0].d;
    expect(new Set([...chord.matchAll(/-?\d+\.\d\d (\d+\.\d\d)/g)].map((match) => match[1]))).toEqual(new Set(["50.00"]));
    // 슬라이더가 열린 획에도 먹는다. 이게 같으면 truncate 의 "open" 분기가 비어 있는 것이다.
    expect(reconstructedPaths(analysis, 1)[0].d).not.toBe(paths[0].d);
  });

  it("퇴화 획은 재구성에서 빠지고 원본에는 남는다", () => {
    const analysis = circleOf([pointItem("p"), item("q", band(2), "mirrorY")]);
    expect(reconstructedPaths(analysis, 2).map((path) => path.strokeIndex)).toEqual([1, 1]);
    expect(originalPaths(analysis)).toHaveLength(3);
    // 원본은 화면과 같은 규칙으로 닫는다(D-A): closed 획만 " Z".
    expect(originalPaths(analysis).map((path) => path.d.endsWith(" Z"))).toEqual([false, true, true]);
    // originalPaths는 여전히 pathFor(Catmull-Rom)을 쓴다 — reconstructedPaths와 달리 C가 남아 있다(D-A).
    // 이 픽스처의 stroke.points는 2점뿐이라 pathFor가 L로 떨어지므로, 3점 이상인 별도 stroke로 C를 확인한다.
    const curved: Stroke = { id: "curve", points: [{ x: 10, y: 10 }, { x: 50, y: 90 }, { x: 90, y: 10 }], symmetry: "free", rotationCount: 6, closure: "open" };
    const curvedAnalysis = circleOf([{ stroke: curved, spectrum: closed([]), operator: operatorOf("free", 6) }]);
    expect(originalPaths(curvedAnalysis)[0].d).toContain("C");
  });
});

describe("목표 달성 판정 (I3)", () => {
  // TARGET_ACCURACY는 lib/fourier가 적합할 때 실제로 겨눈 값이다. 여기서 상수를 다시 선언하지 않고
  // 그 값을 직접 써서 achieved/reached가 fourier의 목표와 어긋나지 않는지 증명한다.
  it("reachedTarget은 목표 이상 · capped 아님을 함께 요구한다", () => {
    const reached = item("a", band(3));   // STATS.accuracy = 0.995 ≥ TARGET_ACCURACY, capped:false
    expect(STATS.accuracy).toBeGreaterThanOrEqual(TARGET_ACCURACY);
    expect(reachedTarget(reached)).toBe(true);

    // I1: capped된 획은 정확도가 목표를 넘어도 도달로 세지 않는다 — 국소 꺾임 증가 단계가 상한을
    // 건드렸을 뿐인 경우와, 그리디 자신이 상한에 막힌 진짜 미달을 UI가 구분하지 않기 때문이다.
    const cappedItem: StrokeAnalysis = { ...reached, spectrum: { ...closed(band(3)), stats: { ...STATS, capped: true } } };
    expect(reachedTarget(cappedItem)).toBe(false);

    expect(reachedTarget(pointItem("p"))).toBe(false);   // 퇴화 획은 accuracyOf가 null
  });

  it("achievedTarget은 전체 정확도와 모든 획의 capped 상태를 함께 본다", () => {
    const analysis = circleOf([item("a", band(3))], { accuracy: 0.995 });
    expect(achievedTarget(analysis)).toBe(true);

    expect(achievedTarget(circleOf([item("a", band(3))], { accuracy: 0.98 }))).toBe(false);   // 목표 미달
    expect(achievedTarget(circleOf([], { accuracy: null }))).toBe(false);   // 유효 획 없음(E4)

    const cappedStroke: StrokeAnalysis = { ...item("a", band(3)), spectrum: { ...closed(band(3)), stats: { ...STATS, capped: true } } };
    expect(achievedTarget(circleOf([cappedStroke], { accuracy: 0.995 }))).toBe(false);   // 획 하나라도 capped면 거짓
  });
});

describe("범례와 복사 문안", () => {
  it("이 마법진이 실제로 쓴 연산자만 적는다", () => {
    expect(legendLines(circleOf([item("a", band(1), "rotate", 6), item("b", band(1))]))[1])
      .toBe("R_k z = e^(2πik/6) z");
    expect(legendLines(circleOf([item("a", band(1), "rotate", 6), item("b", band(1), "rotate", 4), item("c", band(1), "mirrorX")]))[1])
      .toBe("R_k z = e^(2πik/4) z  ·  R_k z = e^(2πik/6) z  ·  M_x z = −z̄");
    expect(legendLines(circleOf([item("a", band(1))]))[1]).toBe("I z = z");
    expect(legendLines(circleOf([]))[1]).toBe("I z = z");
    expect(legendLines(circleOf([]))[0]).toBe("원점 = 캔버스 중심 (50,50) · y축 위쪽이 양수");
  });

  it("열린 획이 있으면 사인이 같은 복소 푸리에임을 병기한다 (R1)", () => {
    expect(legendLines(circleOf([item("a", band(1), "rotate", 6)]))).toHaveLength(2);
    expect(legendLines(circleOf([openItem("o"), item("a", band(1), "rotate", 6)]))).toEqual([
      "원점 = 캔버스 중심 (50,50) · y축 위쪽이 양수",
      "R_k z = e^(2πik/6) z",
      "sin(πnt) = (e^(iπnt) − e^(−iπnt)) / 2i"
    ]);
  });

  it("평문 복사에 좌표 프레임·연산자 정의·획별 식이 들어간다", () => {
    const analysis = circleOf(
      [item("a", band(3), "rotate", 6), openItem("o", "rotate", 6), pointItem("p")],
      { uniformSymmetry: { symmetry: "rotate", count: 6 }, accuracy: 0.9932 }
    );
    expect(sheetPlainText(analysis)).toBe([
      "마법연산자 · 획별 복소 푸리에 분해",
      "원점 = 캔버스 중심 (50,50) · y축 위쪽이 양수",
      "R_k z = e^(2πik/6) z",
      "sin(πnt) = (e^(iπnt) − e^(−iπnt)) / 2i",
      "Z(t) = ⋃(k=0..5) R^k z_j(t)",
      "6겹 회전 · 2획 · 5항으로 재현 · 정확도 99.3%",
      "",
      "획 01 · R₆ · 3항 · 99.5%",
      "z₁(t) = c₀ + Σ c_n e^(2πint)",
      "획 02 · R₆ · 2항 · 99.5%",
      "z₂(t) = z₀ + Δt + Σ b_n sin(πnt)",
      "획 03 · I · 0항 · —",
      "z₃(t) = 상수 · 퇴화 획"
    ].join("\n"));
  });
});
