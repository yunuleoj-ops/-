// 마법진 전체의 외곽 실루엣 r(θ). 획별 푸리에는 획을 아무리 정확히 적어도
// "이 마법진이 육각형에 가깝다"는 전역 진술을 못 한다. 그 자리를 이 50줄이 지킨다.
//
// polarFormula 는 accuracy 도 함께 돌려주지만 그 숫자는 UI 어디에도 노출하지 않는다.
// 앱 전체에서 사용자에게 보이는 정확도는 lib/fourier 쪽 하나뿐이다 — 푸터가 87%,
// 모달이 99%면 사용자는 어느 쪽이 거짓말인지 묻게 되고, 정답인 "둘이 다른 것을 잰다"를
// 화면으로 설명할 방법이 없다. r(θ) 는 "외곽 실루엣 근사"로 재정의됐고 그 81~90%는
// 결함이 아니라 이 표현의 정의역이다.

import { copiesFor, curvePoints, transformPoint, type Stroke } from "@/lib/geometry";

const ANGLE_BINS = 180;
const MAX_HARMONIC = 24;
const MAX_TERMS = 4;

// 캔버스 중심을 원점 (0, 0)으로 옮기고 y축을 수학 좌표계 방향으로 뒤집은 뒤, 각도 구간별 평균 반지름을 구한다.
export function radialProfile(strokes: Stroke[]) {
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
