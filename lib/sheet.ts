// FormulaSheet 의 순수 모델. 컴포넌트 테스트를 두지 않기로 했으므로(§7) 시트의 계산은 전부 여기 모인다.
// 여기서 만들지 않는 것 둘: 정확도 문자열(lib/formatting.formatAccuracy 하나뿐이다)과
// 오버레이 점 수(lib/fourier.overlayPointCount 하나뿐이다). 둘 다 다시 만들면 같은 값에 두 답이 생긴다.

import type { CircleAnalysis, OperatorDesc, StrokeAnalysis } from "@/lib/analysis";
import { formatAccuracy, formatOperator, formatStrokeExpr, formatStructure, formatSummarySentence } from "@/lib/formatting";
import { applyOperator, overlayPointCount, reconstruct, truncate, TARGET_ACCURACY, type Spectrum } from "@/lib/fourier";
import { copiesFor, pathFor, strokeCopies, type Point } from "@/lib/geometry";

export type SheetPath = { key: string; strokeIndex: number; copy: number; d: string };
export type CoefficientRow = { n: number; magnitude: number; phase: number; ratio: number };
export type BaseRow = { label: string; magnitude: number; phase: number };

export const FRAME_LINE = "원점 = 캔버스 중심 (50,50) · y축 위쪽이 양수";
// 열린 획의 아핀 항 + 사인급수가 승인된 지수급수와 같은 복소 푸리에임을 밝힌다(스펙 §1.5 · R1).
export const SIN_IDENTITY_LINE = "sin(πnt) = (e^(iπnt) − e^(−iπnt)) / 2i";

export const termCountOf = (spectrum: Spectrum): number => spectrum.kind === "point" ? 0 : spectrum.terms.length;

// 퇴화 획은 "실패한 0%"가 아니라 "잰 것이 없음"이다. null 을 그대로 넘겨 formatAccuracy 가 "—"를 찍게 한다(E4).
export const accuracyOf = (item: StrokeAnalysis): number | null =>
  item.spectrum.kind === "point" ? null : item.spectrum.stats.accuracy;

export const isCapped = (item: StrokeAnalysis): boolean =>
  item.spectrum.kind !== "point" && item.spectrum.stats.capped;

// ✓/미달 배지의 판정. TARGET_ACCURACY는 fourier가 적합할 때 실제로 겨눈 목표이므로 여기서 다시 상수를
// 선언하지 않고 그대로 import한다(I3) — 두 값이 갈라지면 배지가 조용히 적합기와 어긋난다.
export const reachedTarget = (item: StrokeAnalysis): boolean => {
  const value = accuracyOf(item);
  return !isCapped(item) && value !== null && value >= TARGET_ACCURACY;
};

export const achievedTarget = (analysis: CircleAnalysis): boolean =>
  !analysis.strokes.some(isCapped) && analysis.accuracy !== null && analysis.accuracy >= TARGET_ACCURACY;

export const strokeNumber = (index: number): string => String(index + 1).padStart(2, "0");

// 「식 보기」를 열 수 있는가. 전부 퇴화 획(점)이면 보여 줄 식이 없다 — 실패가 아니라 없음이다(E4).
export const hasFormula = (analysis: CircleAnalysis): boolean =>
  analysis.strokes.some((item) => item.spectrum.kind !== "point");

// 슬라이더는 획당 상한이다. 전역 예산은 D9가 폐기했고, 전역으로 두면 1항에서 한 획만 살아남아 슬라이더의 교육 가치가 사라진다.
export const maxTermCount = (analysis: CircleAnalysis): number =>
  analysis.strokes.reduce((most, item) => Math.max(most, termCountOf(item.spectrum)), 0);

export const termsAtCap = (analysis: CircleAnalysis, cap: number): number =>
  analysis.strokes.reduce((sum, item) => sum + Math.min(Math.max(0, cap), termCountOf(item.spectrum)), 0);

// operator.count 는 복사본 수다(D-I). 회전에서만 회전 수와 같은 값이라 라벨에 그대로 쓸 수 있다.
export const operatorLabel = (operator: OperatorDesc): string =>
  operator.kind === "rotate" ? `회전 ×${operator.count}`
    : operator.kind === "mirrorX" ? "좌우 대칭"
      : operator.kind === "mirrorY" ? "상하 대칭" : "대칭 없음";

// 범례의 연산자 정의를 KaTeX 가 조판할 수 있는 형태로 낸다. 좌표 프레임 설명은 수식이 아니라 문장이므로
// 여기 넣지 않고 화면에서 평문 그대로 쓴다.
export const legendTexLines = (analysis: CircleAnalysis): string[] => {
  const operators = analysis.strokes.map((item) => item.operator);
  const counts = [...new Set(operators.filter((one) => one.kind === "rotate").map((one) => one.count))].sort((a, b) => a - b);
  const lines = counts.map((count) => `R_k z = e^{2\\pi i k/${count}} z`);
  if (operators.some((one) => one.kind === "mirrorX")) lines.push("M_x z = -\\overline{z}");
  if (operators.some((one) => one.kind === "mirrorY")) lines.push("M_y z = \\overline{z}");
  if (!lines.length) lines.push("I z = z");
  // 열린 획이 있으면 사인 기저가 같은 복소 푸리에임을 밝힌다(스펙 R1 의 승인 조건).
  if (analysis.strokes.some((item) => item.spectrum.kind === "open")) {
    lines.push("\\sin(\\pi n t) = \\frac{e^{i\\pi n t} - e^{-i\\pi n t}}{2i}");
  }
  return lines;
};

export const legendLines = (analysis: CircleAnalysis): string[] => {
  const operators = analysis.strokes.map((item) => item.operator);
  // 회전 연산자의 지수는 회전 수다. operator.count 는 회전에서 복사본 수 = 회전 수라 그대로 쓴다(D-I).
  const counts = [...new Set(operators.filter((one) => one.kind === "rotate").map((one) => one.count))].sort((a, b) => a - b);
  const parts = counts.map((count) => `R_k z = e^(2πik/${count}) z`);
  if (operators.some((one) => one.kind === "mirrorX")) parts.push("M_x z = −z̄");
  if (operators.some((one) => one.kind === "mirrorY")) parts.push("M_y z = z̄");
  if (!parts.length) parts.push("I z = z");
  const lines = [FRAME_LINE, parts.join("  ·  ")];
  if (analysis.strokes.some((item) => item.spectrum.kind === "open")) lines.push(SIN_IDENTITY_LINE);
  return lines;
};

// 원본은 화면과 같은 진입점(strokeCopies)으로만 그리고, 화면과 같은 규칙으로 닫는다(D-A).
// 여기서 갈라지면 오버레이가 거짓말을 한다 — 모달의 신뢰는 전부 이 겹침에서 나온다(§4.1-a).
export const originalPaths = (analysis: CircleAnalysis): SheetPath[] =>
  analysis.strokes.flatMap((item, strokeIndex) =>
    strokeCopies(item.stroke).map((points, copy) => ({
      key: `${item.stroke.id}-${copy}`, strokeIndex, copy,
      d: pathFor(points, item.stroke.closure === "closed")
    })));

// 재구성 곡선 전용 폴리라인 이미터(I2). reconstruct 는 이미 곡선 위의 정확한 표본을 ≥64개 돌려주므로
// pathFor 의 Catmull-Rom 재보간은 다시 매끄럽게 하는 게 아니라 스펙트럼이 정의하지 않는 곡선을 그린다 —
// "이 곡선이 당신의 그림임을 증명"하는 게 유일한 임무인 오버레이에서는 정확한 표본을 직선으로 잇는 쪽이 맞다.
// pathFor 대비 세그먼트당 toFixed 호출이 6회→2회로 줄고 문자열도 짧아진다. originalPaths 는 여전히
// pathFor 를 쓴다(D-A) — 캔버스와 바이트 단위로 같아야 한다는 계약이라 이 이미터로 바꾸지 않는다.
const polylineFor = (points: Point[], closed: boolean): string => {
  if (!points.length) return "";
  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i += 1) path += ` L${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  return closed ? `${path} Z` : path;
};

// 대칭 복사본은 계수 위 연산자로 만든다(D10). 복사본을 다시 적합하지 않는다.
// 복사본 수는 strokeCopies 와 같은 copiesFor 에서 나온다(= item.operator.count). 두 블록의 개수와 순서가 어긋나면 겹침이 깨진다.
export const reconstructedPaths = (analysis: CircleAnalysis, cap: number): SheetPath[] =>
  analysis.strokes.flatMap((item, strokeIndex) => {
    if (item.spectrum.kind === "point") return [];
    const cut = truncate(item.spectrum, cap);
    const q = overlayPointCount(cut);
    return Array.from({ length: copiesFor(item.stroke.symmetry, item.stroke.rotationCount) }, (_, copy) => ({
      key: `${item.stroke.id}-${copy}`, strokeIndex, copy,
      d: polylineFor(
        reconstruct(applyOperator(cut, item.stroke.symmetry, item.stroke.rotationCount, copy), q),
        item.stroke.closure === "closed"
      )
    }));
  });

// 위상은 [0,2π)로 정규화한다. ±π 근처에서 −3.14와 +3.14가 오가는 깜빡임을 막는다(E15).
const polar = (re: number, im: number) => ({
  magnitude: Math.hypot(re, im),
  phase: (Math.atan2(im, re) + Math.PI * 2) % (Math.PI * 2)
});

// 선택은 진폭 기준(fourier), 표시도 진폭 기준이지만 두 축은 독립이다(§4.3 정정).
// terms 는 이미 진폭 내림차순이지만(D-C) 표시 정렬을 여기서 다시 확정한다 — 표시 규칙이 저장 순서에 매달리지 않게.
export const coefficientRows = (spectrum: Spectrum): CoefficientRow[] => {
  if (spectrum.kind === "point" || !spectrum.terms.length) return [];
  const rows = spectrum.terms.map((term) => ({ n: term.n, ...polar(term.re, term.im) }))
    .sort((a, b) => b.magnitude - a.magnitude || a.n - b.n);
  const top = rows[0].magnitude;
  return rows.map((row) => ({ ...row, ratio: top > 0 ? row.magnitude / top : 0 }));
};

export const baseRows = (spectrum: Spectrum): BaseRow[] => {
  if (spectrum.kind === "point") return [];
  if (spectrum.kind === "closed") return [{ label: "c₀", ...polar(spectrum.c0.re, spectrum.c0.im) }];
  return [{ label: "z₀", ...polar(spectrum.z0.re, spectrum.z0.im) }, { label: "Δ", ...polar(spectrum.delta.re, spectrum.delta.im) }];
};

// 복사 텍스트에 좌표 프레임과 연산자 정의를 반드시 넣는다. 빠지면 이 식은 다른 곳에서 재현 불가능하다(§4.7).
// 획 하나만 떼어 복사할 때의 평문. 식만으로는 다시 그릴 수 없으므로 계수를 함께 싣는다.
export const strokeCopyPlain = (item: StrokeAnalysis, index: number): string => {
  const head = `획 ${strokeNumber(index)} · ${formatOperator(item.stroke.symmetry, item.stroke.rotationCount)} · ${termCountOf(item.spectrum)}항 · ${formatAccuracy(accuracyOf(item))}`;
  const rows = [
    ...baseRows(item.spectrum).map((row) => `  ${row.label}\t${row.magnitude.toFixed(2)}\t${row.phase.toFixed(2)}`),
    ...coefficientRows(item.spectrum).map((row) => `  n=${row.n}\t${row.magnitude.toFixed(2)}\t${row.phase.toFixed(2)}`)
  ];
  const table = rows.length ? ["  항\t|c_n|\targ c_n", ...rows] : [];
  return [head, formatStrokeExpr(item, index), ...table].join("\n");
};

export const sheetPlainText = (analysis: CircleAnalysis): string => {
  const head = [
    "마법연산자 · 획별 복소 푸리에 분해",
    ...legendLines(analysis),
    formatStructure(analysis),
    `${formatSummarySentence(analysis)} · 정확도 ${formatAccuracy(analysis.accuracy)}`
  ];
  // formatOperator 의 두 번째 인자는 회전 수다(D-I). operator.count(복사본 수)를 넣지 않는다.
  const body = analysis.strokes.map((item, index) => [
    `획 ${strokeNumber(index)} · ${formatOperator(item.stroke.symmetry, item.stroke.rotationCount)} · ${termCountOf(item.spectrum)}항 · ${formatAccuracy(accuracyOf(item))}`,
    formatStrokeExpr(item, index)
  ].join("\n"));
  return [...head, "", ...body].join("\n");
};
