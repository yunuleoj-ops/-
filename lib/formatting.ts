// 스펙트럼을 사람이 읽는 문자열로 옮긴다. 수치는 analysis가 정한 것을 옮겨 적기만 하고 여기서 새로 계산하지 않는다.

import type { CircleAnalysis, OperatorDesc, StrokeAnalysis } from "@/lib/analysis";
import type { Term } from "@/lib/fourier";
import type { Symmetry } from "@/lib/geometry";

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const subscript = (value: number) => String(value).split("").map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit).join("");

const SYMMETRY_LABEL: Record<Exclude<Symmetry, "rotate">, string> = { free: "대칭 없음", mirrorX: "좌우 대칭", mirrorY: "상하 대칭" };
const OPERATOR_SIGN: Record<Exclude<Symmetry, "free">, string> = { rotate: "R", mirrorX: "M_x", mirrorY: "M_y" };

// 두 번째 인자는 회전 수(Stroke.rotationCount)다. 복사본 수(copiesFor의 결과)를 넘기면 안 된다 —
// 회전에서만 두 값이 같아서 반사·자유 대칭에서 조용히 틀린다.
export const formatOperator = (symmetry: Symmetry, rotationCount: number) =>
  symmetry === "rotate" ? `R${subscript(rotationCount)}`
    : symmetry === "mirrorX" ? "M_x"
      : symmetry === "mirrorY" ? "M_y" : "I";

// 앱 전체에서 정확도를 문자열로 만드는 유일한 함수다. 푸터·모달·카드·LaTeX가 전부 이것을 부른다 —
// 같은 화면에서 99%와 99.4%가 동시에 보이면 사용자는 어느 쪽이 거짓말인지 묻게 된다.
// null은 "아직 없음", 0%는 "쟀는데 실패"다(E4). 내림 한 번이 "미달을 위로 반올림하지 않는다"(E5)와
// "근사식에 100%를 찍지 않는다"(§4.4)를 동시에 만족한다. 100%는 잔차가 배정도에서 정확히 0일 때만 나온다.
export const formatAccuracy = (accuracy: number | null): string => {
  if (accuracy === null) return "—";
  if (!Number.isFinite(accuracy) || accuracy <= 0) return "0.0%";
  if (accuracy >= 1) return "100%";
  return `${(Math.min(999, Math.floor(accuracy * 1000 + 1e-9)) / 10).toFixed(1)}%`;
};

// 퇴화 획은 그릴 것도 적을 것도 없다. "획 0개"와 "전부 퇴화"는 같은 화면을 내야 한다(E4).
const drawn = (analysis: CircleAnalysis) => analysis.strokes.filter((item) => item.spectrum.kind !== "point");

export const formatStructure = (analysis: CircleAnalysis) => {
  if (!drawn(analysis).length) return "Z(t) = ∅";
  const uniform = analysis.uniformSymmetry;
  if (!uniform) return "Z(t) = ⋃_j S_j[z_j(t)]";
  if (uniform.symmetry === "free") return "Z(t) = ⋃_j z_j(t)";
  // uniform.count 는 이미 복사본 수다(analysis가 copiesFor를 적용해 넣었다). 여기서 다시 씌우면 이중 적용이다.
  return `Z(t) = ⋃(k=0..${uniform.count - 1}) ${OPERATOR_SIGN[uniform.symmetry]}^k z_j(t)`;
};

export const formatSummarySentence = (analysis: CircleAnalysis) => {
  const strokes = drawn(analysis);
  if (!strokes.length) return "획을 그리면 식이 나타납니다";
  const uniform = analysis.uniformSymmetry;
  const head = !uniform ? "혼합 대칭"
    : uniform.symmetry === "rotate" ? `${uniform.count}겹 회전` : SYMMETRY_LABEL[uniform.symmetry];
  return `${head} · ${strokes.length}획 · ${analysis.totalTerms}항으로 재현`;
};

export const formatStrokeExpr = (item: StrokeAnalysis, index: number) => {
  const name = `z${subscript(index + 1)}(t)`;
  if (item.spectrum.kind === "point") return `${name} = 상수 · 퇴화 획`;
  if (item.spectrum.kind === "closed") return item.spectrum.terms.length ? `${name} = c₀ + Σ c_n e^(2πint)` : `${name} = c₀`;
  return item.spectrum.terms.length ? `${name} = z₀ + Δt + Σ b_n sin(πnt)` : `${name} = z₀ + Δt`;
};

// ---- 화면 표시용 LaTeX 조각. KaTeX 가 이 문자열을 조판한다 ----
// 복사용 전체 문서(formatLatex)와 목적이 다르다. 여기 것은 한 줄짜리 수식이고, 사람이 읽는 설명 문구는
// 넣지 않는다 — KaTeX 는 수식 조판기지 문단 조판기가 아니다.

export const structureTex = (analysis: CircleAnalysis) => {
  if (!drawn(analysis).length) return "Z(t) = \\emptyset";
  const uniform = analysis.uniformSymmetry;
  if (!uniform) return "Z(t) = \\bigcup_j S_j[z_j(t)]";
  if (uniform.symmetry === "free") return "Z(t) = \\bigcup_j z_j(t)";
  // uniform.count 는 이미 복사본 수다. 지수 k 는 0부터 세므로 상한이 count - 1 이다.
  return `Z(t) = \\bigcup_{k=0}^{${uniform.count - 1}} ${LATEX_SIGN[uniform.symmetry]}^k z_j(t)`;
};

export const strokeExprTex = (item: StrokeAnalysis, index: number) => {
  const name = `z_{${index + 1}}(t)`;
  // 퇴화 획은 수식이 아니라 상태다. 한글을 \\text 로 감싸면 KaTeX 가 폰트를 못 찾으므로 영문 기호로 적는다.
  if (item.spectrum.kind === "point") return `${name} = \\mathrm{const}`;
  if (item.spectrum.kind === "closed") {
    return item.spectrum.terms.length ? `${name} = c_0 + \\sum_n c_n e^{2\\pi i n t}` : `${name} = c_0`;
  }
  return item.spectrum.terms.length
    ? `${name} = z_0 + \\Delta t + \\sum_n b_n \\sin(\\pi n t)`
    : `${name} = z_0 + \\Delta t`;
};

// ---- 여기부터 LaTeX 전용. 위 유니코드 생성기와 문자열을 한 조각도 공유하지 않는다 ----
// 단 하나의 예외가 formatAccuracy다 — 정확도 표기는 포맷을 가리지 않고 하나여야 한다.

const fixed = (value: number) => { const text = value.toFixed(2); return text === "-0.00" ? "0.00" : text; };
const latexComplex = (z: { re: number; im: number }) => `(${fixed(z.re)} ${z.im < 0 ? "-" : "+"} ${fixed(Math.abs(z.im))}i)`;
const latexClosedTerm = (term: Term) => `${latexComplex(term)}\\,e^{2\\pi i (${term.n}) t}`;
const latexOpenTerm = (term: Term) => `${latexComplex(term)}\\,\\sin(\\pi (${term.n}) t)`;

const LATEX_SIGN: Record<OperatorDesc["kind"], string> = { rotate: "R", mirrorX: "M_{x}", mirrorY: "M_{y}", identity: "I" };
// OperatorDesc.count 는 복사본 수다. 회전에서만 회전 수와 같고, 회전 연산자 정의에 필요한 것이 바로 그 값이다.
const latexOperator = (operator: OperatorDesc) => operator.kind === "rotate" ? `R_{${operator.count}}` : LATEX_SIGN[operator.kind];
const latexOperatorDef = (operator: OperatorDesc) =>
  operator.kind === "rotate" ? `R_{${operator.count}}z = e^{2\\pi i/${operator.count}}z`
    : operator.kind === "mirrorX" ? "M_{x}z = -\\overline{z}"
      : operator.kind === "mirrorY" ? "M_{y}z = \\overline{z}" : "I z = z";

const latexStructure = (analysis: CircleAnalysis) => {
  const uniform = analysis.uniformSymmetry;
  if (!uniform) return "Z(t) &= \\bigcup_{j} S_{j}[z_{j}(t)]";
  if (uniform.symmetry === "free") return "Z(t) &= \\bigcup_{j} z_{j}(t)";
  return `Z(t) &= \\bigcup_{j}\\bigcup_{k=0}^{${uniform.count - 1}} ${LATEX_SIGN[uniform.symmetry]}^{k} z_{j}(t)`;
};

// 퇴화 획은 본문에 넣지 않는다. kind "point"에는 적을 계수가 없고, 수식 안의 한글은 한글 패키지 없이 컴파일되지 않는다.
// terms는 진폭 내림차순으로 저장된 그대로 적는다 — 정렬을 다시 하면 "중요한 순서"라는 정보가 사라진다.
const latexStroke = (item: StrokeAnalysis, index: number, mixed: boolean) => {
  const tail = mixed ? ` \\quad (S_{${index + 1}} = ${latexOperator(item.operator)})` : "";
  const parts = item.spectrum.kind === "closed"
    ? [latexComplex(item.spectrum.c0), ...item.spectrum.terms.map(latexClosedTerm)]
    : item.spectrum.kind === "open"
      ? [latexComplex(item.spectrum.z0), `${latexComplex(item.spectrum.delta)}\\,t`, ...item.spectrum.terms.map(latexOpenTerm)]
      : [];
  return `z_{${index + 1}}(t) &= ${parts.join(" + ")}${tail}`;
};

export const formatLatex = (analysis: CircleAnalysis) => {
  const head = [
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100"
  ];
  const drawnCount = drawn(analysis).length;
  if (!drawnCount) return [...head, "\\[ Z(t) = \\emptyset \\]"].join("\n");
  const defs: string[] = [];
  analysis.strokes.forEach((item) => {
    if (item.spectrum.kind === "point") return;
    const def = latexOperatorDef(item.operator);
    if (!defs.includes(def)) defs.push(def);
  });
  head.push(`% 연산자: ${defs.join(" · ")}`);
  // 유효 획이 있는데 호길이 가중이 0이면 accuracy가 null로 온다. 그때는 "0.0%"가 아니라 "—"다.
  head.push(`% 재현: ${drawnCount}획 · ${analysis.totalTerms}항 · 정확도 ${formatAccuracy(analysis.accuracy)}`);
  if (analysis.silhouette) head.push(`% 외곽 실루엣: ${analysis.silhouette}`);
  const degenerate = analysis.strokes
    .map((item, index) => item.spectrum.kind === "point" ? `z_{${index + 1}}` : "")
    .filter((name) => name);
  if (degenerate.length) head.push(`% 퇴화 획(계수 없음): ${degenerate.join(", ")}`);
  const mixed = !analysis.uniformSymmetry;
  const lines = [latexStructure(analysis)];
  analysis.strokes.forEach((item, index) => { if (item.spectrum.kind !== "point") lines.push(latexStroke(item, index, mixed)); });
  return [...head, "\\[", "\\begin{aligned}", lines.join(" \\\\\n"), "\\end{aligned}", "\\]"].join("\n");
};

// 카드 뒷면 <dt>분해</dt> 의 값. 퇴화 획은 획 수에서 뺀다 — formatSummarySentence 와 같은 셈법이라
// 푸터의 "3획"과 카드의 "3획"이 같은 수를 가리킨다.
export const formatDecomposition = (analysis: CircleAnalysis): string => {
  const live = analysis.strokes.filter((item) => item.spectrum.kind !== "point").length;
  if (!live) return "—";
  // live > 0 인데 analysis.accuracy 가 null인 조합은 현재 도달 불가다(#13): fitStroke는 kind가
  // "point"가 아니면 항상 arcLength > MIN_ARC_LENGTH를 보장하므로, analysis.ts의 valid 필터를
  // live와 정확히 같은 집합으로 통과시킨다 — accuracy가 null이 되려면 valid가 비어야 하는데 그건
  // live도 0이라는 뜻이다. 그래도 formatAccuracy(null) = "—"로 안전하게 떨어지는 방어적 위임이다.
  return `${live}획 · ${analysis.totalTerms}항 · ${formatAccuracy(analysis.accuracy)}`;
};
