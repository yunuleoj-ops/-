// 획 하나를 복소 푸리에 계수로 옮긴다. 수치만 만들고 표시 문자열은 만들지 않는다 — 표기는 lib/formatting.ts 몫이다.
// 좌표는 이미 z = conj(p − 중심)으로 옮겨진 수학 좌표(lib/resample의 toComplex)만 쓴다.
// 닫힌 획은 지수급수, 열린 획은 현 분리 + 사인급수(DST-I, Task 5).
// FFT를 쓰지 않는다 — DST-I는 라딕스-2 복소 FFT와 호환되지 않고, 항이 한 자릿수 규모라 이득도 없다.

import type { Closure, Point, Symmetry } from "@/lib/geometry";
import { densify, fromComplex, resampleUniform, toComplex, type Complex } from "@/lib/resample";

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
  // 닫힘은 P개(끝점 중복 없음), 열림은 P+1개(양 끝 포함). fitOpen 은 samples.length − 1 로 P를 되찾는다.
  const samples = resampleUniform(poly, length, P, closed).map(toComplex);
  return closed ? fitClosed(samples, length, options) : fitOpen(samples, length, options);
}

// 임의 t 에서의 z(t) = c₀ + Σ c_n e^(2πint). 표본 격자를 벗어나므로 표 조회가 아니라 직접 계산한다.
const evaluateClosed = (c0: Complex, terms: Term[], t: number): Complex => {
  let re = c0.re;
  let im = c0.im;
  for (const term of terms) {
    const angle = Math.PI * 2 * term.n * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    re += term.re * cos - term.im * sin;
    im += term.re * sin + term.im * cos;
  }
  return { re, im };
};

// 열린 획의 슬라이더용. 닫힘은 S² 에서 선택 항 에너지를 빼지만 열림은 S 가 잔차 에너지가 아니다
// (z₀ + Δt 가 이미 제거되어 있다). 대신 "버린 항의 에너지를 rmsError² 에 도로 더한다" —
// 같은 파스발의 다른 표현이고, 이쪽만 Spectrum 이 실제로 들고 있는 값(stats.P, stats.rmsError, terms)으로 닫힌다.
function truncateOpen(spectrum: Extract<Spectrum, { kind: "open" }>, termCount: number): Spectrum {
  const count = Math.max(0, Math.min(spectrum.terms.length, Math.floor(termCount)));
  if (count === spectrum.terms.length) return spectrum;
  const { P, normS, rmsError } = spectrum.stats;
  const scale = P / (2 * (P + 1));
  let tail = rmsError * rmsError;
  for (let index = count; index < spectrum.terms.length; index += 1) tail += scale * energyOf(spectrum.terms[index]);
  const nextRms = Math.sqrt(Math.max(0, tail));
  return {
    ...spectrum,   // z0 와 delta 를 참조 그대로 물려준다 — 항 수와 무관하게 끝점이 고정된다
    terms: spectrum.terms.slice(0, count),
    stats: {
      ...spectrum.stats,
      rmsError: nextRms,
      accuracy: normS > 0 ? clamp01(1 - nextRms / normS) : 1,
      capped: false
    }
  };
}

// 항 수 슬라이더용. 계수는 항 개수와 무관하게 정해지므로 변환을 다시 돌리지 않는다.
// terms 가 진폭 내림차순이므로 slice(0, k) 가 곧 "진폭 상위 k개"다(D-C).
// maxError는 표본이 있어야 다시 잴 수 있는데 Spectrum은 표본을 들고 다니지 않는다 —
// 잘라낸 스펙트럼의 maxError는 적합 시점 값을 물려받으며, 화면에 표시하지 않는다.
export function truncate(spectrum: Spectrum, termCount: number): Spectrum {
  if (spectrum.kind === "open") return truncateOpen(spectrum, termCount);
  if (spectrum.kind !== "closed") return spectrum;   // point 는 자를 것이 없다
  const count = Math.max(0, Math.min(spectrum.terms.length, Math.floor(termCount)));
  if (count === spectrum.terms.length) return spectrum;
  const terms = spectrum.terms.slice(0, count);
  let tail = spectrum.stats.normS * spectrum.stats.normS;
  for (const term of terms) tail -= energyOf(term);
  const rmsError = Math.sqrt(Math.max(0, tail));
  const accuracy = spectrum.stats.normS > 0 ? clamp01(1 - rmsError / spectrum.stats.normS) : 1;
  return { ...spectrum, terms, stats: { ...spectrum.stats, rmsError, accuracy, capped: false } };
}

// z(t) = z₀ + Δ·t + Σ b_n sin(πnt). 오버레이용이라 테이블 없이 직접 sin 을 부른다 — q ≤ 512, 항 ≤ 24.
const evaluateOpen = (z0: Complex, delta: Complex, terms: Term[], t: number): Complex => {
  let re = z0.re + t * delta.re;
  let im = z0.im + t * delta.im;
  for (const term of terms) {
    const basis = Math.sin(Math.PI * term.n * t);
    re += term.re * basis;
    im += term.im * basis;
  }
  return { re, im };
};

// 오버레이용 곡선. 닫힘은 t = j/q 로 끝점을 중복하지 않고(렌더가 Z로 닫는다),
// 열림은 t = j/(q−1) 로 양 끝점을 포함한다. 개수는 둘 다 q 개다 — 호출부가 kind 를 몰라도 되게.
export function reconstruct(spectrum: Spectrum, q: number): Point[] {
  const count = Math.floor(q);
  if (spectrum.kind === "point" || count < 1) return [];
  const out: Point[] = [];
  if (spectrum.kind === "open") {
    const last = count > 1 ? count - 1 : 1;   // q = 1 에서 0으로 나누지 않는다
    for (let j = 0; j < count; j += 1) {
      out.push(fromComplex(evaluateOpen(spectrum.z0, spectrum.delta, spectrum.terms, j / last)));
    }
    return out;
  }
  for (let j = 0; j < count; j += 1) out.push(fromComplex(evaluateClosed(spectrum.c0, spectrum.terms, j / count)));
  return out;
}

// Q = clamp(8·max|n|, 64, 512). 최고 조화를 주기당 8점으로 해상한다.
// 오버레이 점 수의 유일한 구현이다 — Task 10은 overlayQ 를 따로 만들지 않고 이것을 import한다(4-B).
export function overlayPointCount(spectrum: Spectrum): number {
  if (spectrum.kind === "point") return 0;
  let top = 1;
  for (const term of spectrum.terms) top = Math.max(top, Math.abs(term.n));
  return Math.max(64, Math.min(512, 8 * top));
}

// 열린 획: 현 분리 후 DST-I. z(t) = z₀ + Δ·t + Σ b_n sin(πnt).
// 항 선택·정지조건·정확도·maxError 보정은 손대지 않는다 — selectAndFinalize 하나가 닫힘과 열림을 모두 끝낸다.
function fitOpen(samples: Complex[], arcLength: number, options?: FitOptions): Spectrum {
  const P = samples.length - 1;
  const K = bandLimit(P);
  const z0 = samples[0];
  const delta = { re: samples[P].re - z0.re, im: samples[P].im - z0.im };

  // r_k = z_k − z₀ − (k/P)Δ. 정의상 r_0 = r_P = 0 이므로 합에서 뺀다(Float64Array 는 0으로 초기화된다).
  const rRe = new Float64Array(P + 1);
  const rIm = new Float64Array(P + 1);
  for (let k = 1; k < P; k += 1) {
    const f = k / P;
    rRe[k] = samples[k].re - z0.re - f * delta.re;
    rIm[k] = samples[k].im - z0.im - f * delta.im;
  }

  // sin(πm/P) 는 m 에 대해 주기 2P. n·k ≤ 64 × 512 = 32768 이라 정수 나머지가 안전하다.
  const span = 2 * P;
  const sinTable = new Float64Array(span);
  for (let j = 0; j < span; j += 1) sinTable[j] = Math.sin((Math.PI * j) / P);

  // 표본 P+1 개 기준 평균제곱오차 환산 계수. Σ_{k=1}^{P−1}|res_k|² = (P/2)Σ_{n∉A}|b_n|² 이므로.
  // 닫힘의 energy 는 |c_n|²(환산 계수 1)이고 열림은 이 scale 이 붙는다. 두 kind 의 energy 가
  // 같은 단위(표본 MSE)여야 selectAndFinalize 의 정지 문턱이 한 벌로 성립한다.
  const scale = P / (2 * (P + 1));

  const candidates: Candidate[] = [];
  for (let n = 1; n <= K; n += 1) {
    let re = 0;
    let im = 0;
    for (let k = 1; k < P; k += 1) {
      const s = sinTable[(n * k) % span];
      re += rRe[k] * s;
      im += rIm[k] * s;
    }
    re *= 2 / P;
    im *= 2 / P;
    candidates.push({ n, re, im, energy: scale * (re * re + im * im) });
  }

  // 파스발: Σ_{n=1}^{P−1}|b_n|² = (2/P)Σ_{k=1}^{P−1}|r_k|². 후보 대역(K) 밖 에너지까지 정확히 포함된다.
  let power = 0;
  for (let k = 1; k < P; k += 1) power += rRe[k] * rRe[k] + rIm[k] * rIm[k];
  const tailEnergy = scale * (2 / P) * power;

  const rebuild = (terms: Term[]): Complex[] => {
    const out: Complex[] = [];
    for (let k = 0; k <= P; k += 1) {
      const f = k / P;
      let re = z0.re + f * delta.re;
      let im = z0.im + f * delta.im;
      for (const term of terms) {
        const s = sinTable[(term.n * k) % span];
        re += term.re * s;
        im += term.im * s;
      }
      out.push({ re, im });
    }
    return out;
  };

  const { terms, stats } = selectAndFinalize(samples, candidates, tailEnergy, normOf(samples), arcLength, P, rebuild, options);
  return { kind: "open", z0, delta, terms, stats };
}

// ---- 대칭 연산자 (스펙 §1.7 / D10) ---------------------------------------
// 복사본을 다시 적합하지 않는다. 대칭은 등거리변환이므로 계수 위의 선형(회전)
// 또는 반선형(반사) 연산으로 정확히 유도된다 — 근사가 아니라 항등식이다.
//
// 부호 주의: z = conj(p − 중심) 이라 수학 좌표의 회전 방향이 화면과 반대다.
// 교과서 부호 ω = e^(2πi/m) 을 그대로 쓰므로 applyOperator 의 복사본 k 는
// transformPoint 의 복사본 (m − k) mod m 과 같은 그림이다. 순환군 궤도 {ω^k z} 는
// 집합으로서 동일하므로 화면에 그려지는 마법진은 이 부호 때문에 달라지지 않는다.
//
// count 는 회전 수(stroke.rotationCount)다. 복사본 수(copiesFor 의 결과)가 아니다.

const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re
});

// w·z. 회전은 지수 기저와 사인 기저 모두에서 인덱스를 건드리지 않는다.
// terms 를 그대로 map 하므로 Task 4 가 정렬해 둔 진폭 내림차순이 유지된다.
const mapLinear = (spectrum: Spectrum, w: Complex): Spectrum => {
  if (spectrum.kind === "closed") {
    return { ...spectrum, c0: cMul(w, spectrum.c0),
      terms: spectrum.terms.map((term) => ({ n: term.n, ...cMul(w, term) })) };
  }
  if (spectrum.kind === "open") {
    return { ...spectrum, z0: cMul(w, spectrum.z0), delta: cMul(w, spectrum.delta),
      terms: spectrum.terms.map((term) => ({ n: term.n, ...cMul(w, term) })) };
  }
  return spectrum;
};

export const applyOperator = (spectrum: Spectrum, symmetry: Symmetry, count: number, copy: number): Spectrum => {
  // 항등 분기는 transformPoint 의 항등 분기와 글자 그대로 같은 조건이어야 한다.
  // 여기서 갈라지면 화면과 식이 갈라진다.
  if (spectrum.kind === "point" || copy === 0 || symmetry === "free") return spectrum;
  if (symmetry === "mirrorX" || symmetry === "mirrorY") return spectrum;   // Step 7에서 채운다
  const angle = (Math.PI * 2 * copy) / count;
  return mapLinear(spectrum, { re: Math.cos(angle), im: Math.sin(angle) });
};
