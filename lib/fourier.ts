// 획 하나를 복소 푸리에 계수로 옮긴다. 수치만 만들고 표시 문자열은 만들지 않는다 — 표기는 lib/formatting.ts 몫이다.
// 좌표는 이미 z = conj(p − 중심)으로 옮겨진 수학 좌표(lib/resample의 toComplex)만 쓴다.
// 닫힌 획은 지수급수, 열린 획은 현 분리 + 사인급수(DST-I, Task 5).
// FFT를 쓰지 않는다 — DST-I는 라딕스-2 복소 FFT와 호환되지 않고, 항이 한 자릿수 규모라 이득도 없다.

import type { Closure, Point } from "@/lib/geometry";
import { densify, resampleUniform, toComplex, type Complex } from "@/lib/resample";

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

// 에너지는 항상 이 식으로 센다. hypot(re,im)²와 re²+im²는 부동소수에서 같은 값이 아니라서
// 그리디 누적과 truncate가 서로 다른 식을 쓰면 두 경로의 rmsError가 미세하게 갈린다.
const energyOf = (term: { re: number; im: number }) => term.re * term.re + term.im * term.im;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// 진폭 그리디 · 파스발 꼬리 · 정지조건 · 국소 꺾임 보정. 닫힘과 열림이 이 함수 하나만 쓴다(D-D).
// Task 5의 fitOpen 은 candidates/tailEnergy/rebuild 만 자기 기저로 만들어 여기로 넘긴다 —
// 정확도·정지조건·maxError 보정이 두 벌 존재하면 열림이 닫힘과 다른 규칙으로 끝나고,
// 그 차이는 화면에 "정확도 99%"로 똑같이 표시되어 절대 발견되지 않는다.
export function selectAndFinalize(
  samples: Complex[],
  candidates: Candidate[],
  tailEnergy: number,
  normS: number,
  arcLength: number,
  P: number,
  rebuild: (terms: Term[]) => Complex[],
  options: FitOptions = {}
): { terms: Term[]; stats: FitStats } {
  const target = options.target ?? TARGET_ACCURACY;
  const maxTerms = options.maxTerms ?? T_MAX;
  const absFloor = options.absFloor ?? ABS_FLOOR;

  // 직교 기저에서 최적 T항 근사는 진폭 상위 T개다(스펙 §1.6). 재적합 루프는 없다.
  // 이 순서가 곧 저장 순서다 — n 오름차순으로 되돌리지 않는다(D-C).
  const sorted = [...candidates].sort((a, b) => b.energy - a.energy || Math.abs(a.n) - Math.abs(b.n) || a.n - b.n);
  const limit = Math.max(0, (1 - target) * normS);
  const ceiling = Math.min(maxTerms, sorted.length);

  const residualAt = (count: number) => {
    let rest = tailEnergy;
    for (let index = 0; index < count; index += 1) rest -= sorted[index].energy;
    return Math.sqrt(Math.max(0, rest));
  };
  // 진단용 최대 오차. 항 집합이 확정된 뒤에만 부른다(획당 1~2회).
  const measure = (count: number) => {
    const terms = sorted.slice(0, count).map(({ n, re, im }) => ({ n, re, im }));
    const hat = rebuild(terms);
    let worst = 0;
    for (let k = 0; k < samples.length; k += 1) {
      worst = Math.max(worst, Math.hypot(samples[k].re - hat[k].re, samples[k].im - hat[k].im));
    }
    return { terms, maxError: worst };
  };

  let count = 0;
  while (count < ceiling) {
    const error = residualAt(count);
    if (error <= limit || error <= absFloor) break;   // 정지조건 (1) 과 (2)
    count += 1;
  }
  let rmsError = residualAt(count);
  let measured = measure(count);
  // 최종 A를 정한 뒤 한 번만 재구성해 최대 오차를 잰다. RMS의 3배를 넘으면 항을 1.5배로 딱 한 번 늘린다.
  // 조건 넷은 각각 다른 실패를 막는다(D-F):
  //  · maxError > 3*rmsError — 잔차가 한 점에 몰린 모서리 도형만 고른다.
  //  · maxError > absFloor   — 잔차가 이미 눈에 안 보이는 획을 늘리지 않는다. 원의 seam 비율이 9.03이라
  //                            이 조건이 없으면 완전한 원이 2항이 되고 스펙 T3가 깨진다.
  //  · count > 0             — 직선(0항)에서 ceil(0 × 1.5) = 0 이라 무의미하게 도는 것을 막는다.
  //  · count < ceiling       — 이미 상한이면 늘릴 자리가 없다.
  if (measured.maxError > 3 * rmsError && measured.maxError > absFloor && count > 0 && count < ceiling) {
    count = Math.min(ceiling, Math.ceil(count * 1.5));
    rmsError = residualAt(count);
    measured = measure(count);
  }

  return {
    terms: measured.terms,
    stats: {
      P,
      arcLength,
      normS,
      rmsError,
      maxError: measured.maxError,
      accuracy: normS > 0 ? clamp01(1 - rmsError / normS) : 1,
      capped: measured.terms.length >= maxTerms
    }
  };
}

export function fitClosed(samples: Complex[], arcLength: number, options?: FitOptions): ClosedSpectrum {
  const P = samples.length;
  const { c0, terms, cosTable, sinTable } = dftClosed(samples, bandLimit(P));
  // S² = (1/P)Σ|z_k|² − |c₀|². 앱 전체에서 정확도 분모는 이 S 하나뿐이다.
  const normS = normOf(samples);
  const candidates: Candidate[] = terms.map((term) => ({ ...term, energy: energyOf(term) }));

  // 표본 격자 위의 재구성이라 dftClosed 가 만든 표를 그대로 조회한다(삼각함수 호출 0회).
  const rebuild = (chosen: Term[]): Complex[] => {
    const out: Complex[] = [];
    for (let k = 0; k < P; k += 1) {
      let re = c0.re;
      let im = c0.im;
      for (const term of chosen) {
        const index = (((term.n * k) % P) + P) % P;
        re += term.re * cosTable[index] - term.im * sinTable[index];
        im += term.re * sinTable[index] + term.im * cosTable[index];
      }
      out.push({ re, im });
    }
    return out;
  };

  const { terms: chosen, stats } = selectAndFinalize(samples, candidates, normS * normS, normS, arcLength, P, rebuild, options);
  return { kind: "closed", c0, terms: chosen, stats };
}

export function fitStroke(points: Point[], closure: Closure, options?: FitOptions): Spectrum {
  if (points.length < 2) return { kind: "point", length: 0 };
  const closed = closure === "closed";
  const { poly, length } = densify(points, closed);
  // !(length > …) 는 부정형이 아니라 NaN 처리다. length > … 로 쓰면 NaN 이 아래로 새어 나간다.
  if (closure === "point" || !(length > MIN_ARC_LENGTH)) return { kind: "point", length };
  const P = sampleCount(length);
  const samples = resampleUniform(poly, length, P, closed).map(toComplex);
  // Task 5가 이 한 줄을 `return closed ? fitClosed(...) : fitOpen(samples, length, options);` 로 바꾼다.
  if (!closed) throw new Error("fitStroke: open stroke fitting lands in Task 5");
  return fitClosed(samples, length, options);
}
