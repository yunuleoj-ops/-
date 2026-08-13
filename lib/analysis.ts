// 획별 스펙트럼을 마법진 하나의 진술로 묶는다. 수치는 여기서 계산하고 문자열 조립은 lib/formatting 이 한다.

import { fitStroke, type FitOptions, type Spectrum } from "@/lib/fourier";
import { copiesFor, type Stroke, type Symmetry } from "@/lib/geometry";
import { getMetrics, type Metrics } from "@/lib/metrics";
import { polarFormula } from "@/lib/polar";

// count 는 전부 "복사본 수"다: rotate 6 → 6, mirrorX/mirrorY → 2, free → 1.
// formatOperator 의 두 번째 인자는 "회전 수"이므로 두 값을 섞지 말 것(회전에서만 우연히 같다).
export type OperatorDesc = { kind: "rotate" | "mirrorX" | "mirrorY" | "identity"; count: number };
export type StrokeAnalysis = { stroke: Stroke; spectrum: Spectrum; operator: OperatorDesc };
export type CircleAnalysis = {
  metrics: Metrics;
  strokes: StrokeAnalysis[];
  totalTerms: number;
  // 유효 획이 하나도 없으면 null. 0 은 "쟀는데 실패했다"로 읽히고 0/0 은 NaN 이다 (E4).
  accuracy: number | null;
  // 가중 평균이 숨기는 최악 획. 유효 획이 하나뿐이면 전체와 같은 값이므로 null.
  worst: { index: number; accuracy: number } | null;
  uniformSymmetry: { symmetry: Symmetry; count: number } | null;
  silhouette: string;
};

// 획은 endStroke 에서 한 번 만들어진 뒤 변형되지 않고, undo/redo 는 같은 객체 참조를 배열 사이에서
// 옮길 뿐이다. 그래서 객체 아이덴티티가 곧 기하 아이덴티티다 — 축출 로직이 필요 없고, 지우개로
// 획이 사라지면 GC 가 캐시까지 회수한다. id 를 키로 쓰면 서로 다른 기하가 같은 키를 갖는 사고가
// 가능하고 그때 증상은 "틀린 식이 표시됨"이라 발견이 늦다.
const spectrumCache = new WeakMap<Stroke, Spectrum>();

export function fitAll(strokes: Stroke[], options?: FitOptions): Spectrum[] {
  // options 를 명시한 호출은 테스트·실험용이다. 옵션을 캐시 키에 섞으면 위의 등식이 깨진다.
  if (options) return strokes.map((stroke) => fitStroke(stroke.points, stroke.closure, options));
  return strokes.map((stroke) => {
    const cached = spectrumCache.get(stroke);
    if (cached) return cached;
    const spectrum = fitStroke(stroke.points, stroke.closure);
    spectrumCache.set(stroke, spectrum);
    return spectrum;
  });
}

const operatorOf = (stroke: Stroke): OperatorDesc => ({
  kind: stroke.symmetry === "free" ? "identity" : stroke.symmetry,
  count: copiesFor(stroke.symmetry, stroke.rotationCount)
});

// 회전 수가 다르면 다른 연산자다. 반사는 rotationCount 가 복사본 수에 관여하지 않으므로 무시한다.
const uniformSymmetryOf = (strokes: Stroke[]) => {
  const first = strokes[0];
  if (!first) return null;
  const same = strokes.every((stroke) => stroke.symmetry === first.symmetry
    && (stroke.symmetry !== "rotate" || stroke.rotationCount === first.rotationCount));
  return same ? { symmetry: first.symmetry, count: copiesFor(first.symmetry, first.rotationCount) } : null;
};

// 1단(fitAll)과 2단(집계)을 따로 부를 수 있게 열어 둔다. page.tsx 의 useMemo 두 개가 이 경계에 붙는다.
export function analyzeFitted(strokes: Stroke[], spectra: Spectrum[]): CircleAnalysis {
  // export된 이음매다(M3). 1단(fitAll)과 2단을 따로 부르는 호출부가 위치로만 strokes[i]↔spectra[i]를
  // 짝짓는다 — 길이가 어긋나면 아래 map이 undefined.kind에서 죽는다. 여기서 미리 잘라 원인을 밝힌다.
  if (spectra.length !== strokes.length) throw new Error("analyzeFitted: strokes와 spectra의 길이가 다르다");
  const list: StrokeAnalysis[] = strokes.map((stroke, index) => ({
    stroke, spectrum: spectra[index], operator: operatorOf(stroke)
  }));

  // 퇴화 획은 호길이가 0이라 가중치가 저절로 0이 된다. 여기서 한 번만 좁혀 두면 아래는 분기가 없다.
  const valid: { index: number; length: number; accuracy: number; terms: number }[] = [];
  list.forEach((item, index) => {
    if (item.spectrum.kind === "point") return;
    const { arcLength, accuracy } = item.spectrum.stats;
    if (!(arcLength > 0)) return;
    valid.push({ index, length: arcLength, accuracy, terms: item.spectrum.terms.length });
  });

  let totalTerms = 0;
  let accuracy: number | null = null;
  let worst: { index: number; accuracy: number } | null = null;

  // E4: 유효 획이 없으면 집계를 아예 돌리지 않는다.
  if (valid.length) {
    let weight = 0;
    let weighted = 0;
    valid.forEach((entry) => {
      weight += entry.length;
      weighted += entry.length * entry.accuracy;
      totalTerms += entry.terms;
    });
    // 대칭 복사본 수를 곱하지 않는다. 복사는 등거리변환이라 추가 오차가 정확히 0이다.
    accuracy = weighted / weight;
    if (valid.length > 1) {
      const lowest = valid.reduce((low, entry) => entry.accuracy < low.accuracy ? entry : low);
      worst = { index: lowest.index, accuracy: lowest.accuracy };
    }
  }

  return {
    metrics: getMetrics(strokes),
    strokes: list,
    totalTerms,
    accuracy,
    worst,
    uniformSymmetry: uniformSymmetryOf(strokes),
    // 실루엣은 문자열만 가져온다. polarFormula.accuracy 는 버린다 — 화면의 정확도는 푸리에 것 하나뿐이다.
    silhouette: polarFormula(strokes).formula
  };
}

export const analyze = (strokes: Stroke[], options?: FitOptions): CircleAnalysis =>
  analyzeFitted(strokes, fitAll(strokes, options));
