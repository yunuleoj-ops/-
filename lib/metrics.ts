// 마법진의 위력과 극좌표식. 공유 링크로 받은 마법진도 같은 값을 내도록 순수 함수로 둔다.

import { copiesFor, curvePoints, pointDistance, transformPoint, type Stroke } from "@/lib/geometry";

const ANGLE_BINS = 180;
const MAX_HARMONIC = 24;
const MAX_TERMS = 4;

// 캔버스 중심을 원점 (0, 0)으로 옮기고 y축을 수학 좌표계 방향으로 뒤집은 뒤, 각도 구간별 평균 반지름을 구한다.
function radialProfile(strokes: Stroke[]) {
  const sums = new Array<number>(ANGLE_BINS).fill(0);
  const hits = new Array<number>(ANGLE_BINS).fill(0);
  strokes.forEach((stroke) => {
    const shaped = curvePoints(stroke.points);
    for (let copy = 0; copy < copiesFor(stroke.symmetry, stroke.rotationCount); copy += 1) {
      shaped.forEach((point) => {
        const placed = transformPoint(point, stroke.symmetry, stroke.rotationCount, copy);
        const x = placed.x - 50; const y = 50 - placed.y;
        const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
        const bin = Math.min(ANGLE_BINS - 1, Math.floor((angle / (Math.PI * 2)) * ANGLE_BINS));
        sums[bin] += Math.hypot(x, y); hits[bin] += 1;
      });
    }
  });
  if (!hits.some((hit) => hit > 0)) return null;
  const raw = sums.map((sum, bin) => hits[bin] ? sum / hits[bin] : NaN);
  return raw.map((value, bin) => {
    if (!Number.isNaN(value)) return value;
    let back = 1; let forward = 1;
    while (Number.isNaN(raw[(bin - back + ANGLE_BINS) % ANGLE_BINS])) back += 1;
    while (Number.isNaN(raw[(bin + forward) % ANGLE_BINS])) forward += 1;
    const before = raw[(bin - back + ANGLE_BINS) % ANGLE_BINS];
    const after = raw[(bin + forward) % ANGLE_BINS];
    return (before * forward + after * back) / (back + forward);
  });
}

// r(θ)를 푸리에 급수로 전개해 진폭이 큰 항만 남긴다.
export function polarFormula(strokes: Stroke[]) {
  const profile = radialProfile(strokes);
  if (!profile) return { formula: "r(θ) = —", accuracy: 0 };
  const mean = profile.reduce((sum, value) => sum + value, 0) / ANGLE_BINS;
  const harmonics = [];
  for (let k = 1; k <= MAX_HARMONIC; k += 1) {
    let cosine = 0; let sine = 0;
    profile.forEach((value, bin) => {
      const angle = (Math.PI * 2 * bin) / ANGLE_BINS;
      cosine += value * Math.cos(k * angle); sine += value * Math.sin(k * angle);
    });
    harmonics.push({ k, amplitude: Math.hypot(cosine, sine) * (2 / ANGLE_BINS), phase: Math.atan2(sine, cosine) });
  }
  const terms = harmonics.filter((harmonic) => harmonic.amplitude >= 0.05)
    .sort((a, b) => b.amplitude - a.amplitude).slice(0, MAX_TERMS).sort((a, b) => a.k - b.k);
  const approximate = (angle: number) => mean + terms.reduce((sum, term) => sum + term.amplitude * Math.cos(term.k * angle - term.phase), 0);
  const error = profile.reduce((sum, value, bin) => sum + Math.abs(value - approximate((Math.PI * 2 * bin) / ANGLE_BINS)), 0) / ANGLE_BINS;
  const accuracy = mean > 0 ? Math.max(0, Math.min(100, Math.round((1 - error / mean) * 100))) : 0;
  const text = terms.map((term) => `${term.amplitude.toFixed(1)}cos(${term.k}θ ${term.phase >= 0 ? "−" : "+"} ${Math.abs(term.phase).toFixed(2)})`).join(" + ");
  return { formula: `r(θ) = ${mean.toFixed(1)}${terms.length ? ` + ${text}` : ""}`, accuracy };
}

export type Metrics = ReturnType<typeof getMetrics>;

export function getMetrics(strokes: Stroke[]) {
  const lines = strokes.length;
  let length = 0; let corners = 0; let closed = 0; let copies = 0;
  strokes.forEach((stroke) => {
    const shaped = curvePoints(stroke.points);
    let drawn = 0;
    for (let index = 1; index < shaped.length; index += 1) drawn += pointDistance(shaped[index - 1], shaped[index]);
    length += drawn;
    if (drawn > 18 && pointDistance(shaped[0], shaped[shaped.length - 1]) < 8) closed += 1;
    // 제어점에서 진행 방향이 45도 넘게 꺾이면 꼭짓점으로 센다.
    for (let index = 1; index < stroke.points.length - 1; index += 1) {
      const before = Math.atan2(stroke.points[index].y - stroke.points[index - 1].y, stroke.points[index].x - stroke.points[index - 1].x);
      const after = Math.atan2(stroke.points[index + 1].y - stroke.points[index].y, stroke.points[index + 1].x - stroke.points[index].x);
      let turn = Math.abs(after - before);
      if (turn > Math.PI) turn = Math.PI * 2 - turn;
      if (turn > Math.PI / 4) corners += 1;
    }
    copies += copiesFor(stroke.symmetry, stroke.rotationCount);
  });
  const mirroredX = strokes.some((stroke) => stroke.symmetry === "mirrorX");
  const mirroredY = strokes.some((stroke) => stroke.symmetry === "mirrorY");
  const rotation = strokes.reduce((most, stroke) => stroke.symmetry === "rotate" ? Math.max(most, stroke.rotationCount) : most, 1);
  const intersections = Math.max(0, Math.min(28, Math.floor((copies - 1) * 1.7 + closed * 2)));
  const horizontal = mirroredX ? 100 : Math.min(88, Math.round(closed * 9 + lines * 3));
  const vertical = mirroredY ? 100 : Math.min(88, Math.round(closed * 8 + lines * 3));
  const complexity = Math.min(100, Math.round(lines * 7 + intersections * 2 + closed * 10 + corners * 1.5 + length / 42));
  const power = Math.round(copies + intersections * 3 + closed * 4 + (mirroredX ? 10 : 0) + (mirroredY ? 10 : 0) + (rotation - 1) * 10 + complexity * 2);
  const grade = power >= 260 ? "초월" : power >= 150 ? "고급" : power >= 60 ? "중급" : "초급";
  const { formula, accuracy } = polarFormula(strokes);
  return { lines, length: Math.round(length), intersections, closed, horizontal, vertical, rotation, complexity, power, grade, formula, accuracy };
}
