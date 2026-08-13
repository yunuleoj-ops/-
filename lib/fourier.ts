// 획 하나를 복소 푸리에 계수로 옮긴다. 수치만 만들고 표시 문자열은 만들지 않는다 — 표기는 lib/formatting.ts 몫이다.
// 좌표는 이미 z = conj(p − 중심)으로 옮겨진 수학 좌표(lib/resample의 toComplex)만 쓴다.
// 닫힌 획은 지수급수, 열린 획은 현 분리 + 사인급수(DST-I, Task 5).
// FFT를 쓰지 않는다 — DST-I는 라딕스-2 복소 FFT와 호환되지 않고, 항이 한 자릿수 규모라 이득도 없다.

import type { Complex } from "@/lib/resample";

export type { Complex } from "@/lib/resample";

export type Term = { n: number; re: number; im: number };

// 항 선택 전의 후보. energy 는 이미 "표본 평균제곱오차" 단위로 환산된 값이다:
// 닫힘은 |c_n|², 열림은 (P/(2(P+1)))|b_n|² (Task 5가 같은 단위로 채운다).
export type Candidate = Term & { energy: number };

export type FitStats = {
  P: number;           // 표본 수
  arcLength: number;
  normS: number;       // 정확도 분모 = 중심 대비 RMS 거리
  rmsError: number;
  maxError: number;
  accuracy: number;    // 0~1 숫자. 문자열은 lib/formatting.ts의 formatAccuracy 하나만 만든다.
  capped: boolean;     // T_max 도달로 종료
};

export type Spectrum =
  | { kind: "point"; length: number }   // length 는 호길이다 — 0으로 고정된 값이 아니다.
  | { kind: "closed"; c0: Complex; terms: Term[]; stats: FitStats }
  | { kind: "open"; z0: Complex; delta: Complex; terms: Term[]; stats: FitStats };

export type ClosedSpectrum = Extract<Spectrum, { kind: "closed" }>;

export type FitOptions = { target?: number; maxTerms?: number; absFloor?: number };

export const T_MAX = 24;
export const TARGET_ACCURACY = 0.99;
export const ABS_FLOOR = 0.15;
export const MIN_ARC_LENGTH = 1e-6;

export const amplitude = (term: { re: number; im: number }) => Math.hypot(term.re, term.im);

// P = clamp(round(2L), 128, 512), 짝수. 표본 간격을 0.5단위 이하로 묶는다.
// 511 → 512로 올라가므로 짝수 보정이 상한을 넘기지 않는다.
export const sampleCount = (arcLength: number) => {
  const clamped = Math.max(128, Math.min(512, Math.round(2 * arcLength)));
  return clamped % 2 === 0 ? clamped : clamped + 1;
};

// K_max ≤ P/4. 나이퀴스트가 아니라 2배 오버샘플 여유를 강제하는 값이다.
// P/2까지 쓰면 DFT가 표본을 정확히 보간해 오차가 0이 되고 정확도가 자기충족적이 된다.
export const bandLimit = (P: number) => Math.min(Math.floor(P / 4), 64);

// 정확도 분모 S = 표본의 중심 대비 RMS 거리. 스펙 §1.6이 "앱 전체에 하나만"이라고 못 박은 값이다.
// 닫힘(P개)·열림(P+1개)이 이 함수 하나를 부른다 — Task 5의 fitOpen 도 여기를 호출한다(D-D).
// 닫힘에서는 표본 평균이 곧 c₀이므로 sqrt((1/P)Σ|z_k|² − |c₀|²)와 비트 단위로 같은 값이 나온다.
export function normOf(samples: Complex[]): number {
  const count = samples.length;
  if (!count) return 0;
  let sumRe = 0;
  let sumIm = 0;
  let energy = 0;
  for (const z of samples) {
    sumRe += z.re;
    sumIm += z.im;
    energy += z.re * z.re + z.im * z.im;
  }
  const meanRe = sumRe / count;
  const meanIm = sumIm / count;
  return Math.sqrt(Math.max(0, energy / count - (meanRe * meanRe + meanIm * meanIm)));
}

// 테이블 DFT. cos/sin 표를 획마다 한 번 만들고 (n·k) mod P 인덱스로 조회해 루프 안 삼각함수 호출을 0으로 만든다.
// 표를 반환하는 이유는 호출자가 진단 재구성(rebuild)에서 같은 표를 다시 써야 하기 때문이다 — 두 번 만들지 않는다.
// n = ±P/2는 같은 빈의 별칭이라 band = P/2로 부르면 양쪽 모두 돌려준다. 전 대역 합에서는 한쪽만 세라.
export function dftClosed(
  samples: Complex[],
  band: number
): { c0: Complex; terms: Term[]; cosTable: Float64Array; sinTable: Float64Array } {
  const P = samples.length;
  const cosTable = new Float64Array(P);
  const sinTable = new Float64Array(P);
  for (let j = 0; j < P; j += 1) {
    const angle = (Math.PI * 2 * j) / P;
    cosTable[j] = Math.cos(angle);
    sinTable[j] = Math.sin(angle);
  }
  const coefficient = (n: number): Complex => {
    const step = ((n % P) + P) % P;
    let re = 0;
    let im = 0;
    let index = 0;
    for (let k = 0; k < P; k += 1) {
      const cos = cosTable[index];
      const sin = sinTable[index];
      re += samples[k].re * cos + samples[k].im * sin;
      im += samples[k].im * cos - samples[k].re * sin;
      index += step;
      if (index >= P) index -= P;
    }
    return { re: re / P, im: im / P };
  };
  const top = Math.max(0, Math.min(Math.floor(band), P / 2));
  const terms: Term[] = [];
  for (let n = -top; n <= top; n += 1) {
    if (n === 0) continue;
    const { re, im } = coefficient(n);
    terms.push({ n, re, im });
  }
  return { c0: coefficient(0), terms, cosTable, sinTable };
}
