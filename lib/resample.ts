// 획을 호길이 균등 표본으로 바꾼다. 푸리에 계수는 매개변수화에 의존하므로 이 모듈이 틀리면 뒤가 전부 무의미해진다.
//
// 좌표는 여기서 단 한 번 z = conj(p − 중심) 으로 옮긴다. 화면의 "중심 이동 + y 뒤집기"가
// 수학 좌표에서는 켤레 한 번이라, 이후 모든 대칭 연산자에 평행이동 항이 등장하지 않는다.

import { curvePoints, pointDistance, type Closure, type Point } from "@/lib/geometry";

export type Complex = { re: number; im: number };

export const CENTER: Point = { x: 50, y: 50 };
export const DENSE_SPACING = 0.25;
export const MAX_DENSE_POINTS = 4096;
export const MIN_SEGMENT_STEPS = 4;
export const MAX_SEGMENT_STEPS = 64;
export const POINT_ARC_LENGTH = 1.0;
export const CLOSED_MIN_LENGTH = 18;

export const toComplex = (point: Point): Complex => ({ re: point.x - CENTER.x, im: CENTER.y - point.y });
export const fromComplex = (z: Complex): Point => ({ x: CENTER.x + z.re, y: CENTER.y - z.im });

// geometry.curvePoints 와 같은 Catmull-Rom 식. 스텝 수만 세그먼트 길이에 맞춰 바뀐다.
const catmullRomAt = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const t2 = t * t; const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
};

export const polylineLength = (poly: Point[]): number => {
  let total = 0;
  for (let index = 1; index < poly.length; index += 1) total += pointDistance(poly[index - 1], poly[index]);
  return total;
};

const stepsFor = (chord: number, spacing: number) =>
  Math.min(MAX_SEGMENT_STEPS, Math.max(MIN_SEGMENT_STEPS, Math.ceil(chord / spacing)));

const evaluateAt = (points: Point[], closed: boolean, spacing: number): Point[] => {
  const poly: Point[] = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    // 끝단을 클램프한다. geometry.curvePoints 와 글자 그대로 같아야 한다 — 여기가 갈라지면
    // 화면 곡선과 분석 곡선이 끝단에서만 조용히 달라지고, 증상은 "정확도 99% 인데 오버레이 끝이 어긋남"이다.
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index]; const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const steps = stepsFor(pointDistance(p1, p2), spacing);
    for (let step = 1; step <= steps; step += 1) poly.push(catmullRomAt(p0, p1, p2, p3, step / steps));
  }
  // 닫힘 획은 렌더의 Z 와 같은 직선 현으로 되돌아온다. 이웃을 순환으로 감지 않는 이유가 이것이다:
  // 화면이 pathFor(points, true) 로 직선 현을 그리므로, 순환으로 감으면 분석만 다른 곡선을 보게 된다(스펙 §1.2).
  if (closed) {
    const from = points[points.length - 1]; const to = points[0];
    const steps = stepsFor(pointDistance(from, to), spacing);
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      poly.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  }
  return poly;
};

// 렌더와 같은 곡선을 간격 0.25 로 훑는다. 선형보간 새그가 h²κ/8 ≈ 0.008 로 절대 오차 하한 0.15 보다 한 자릿수 작다.
export function densify(points: Point[], closed: boolean): { poly: Point[]; length: number } {
  if (!points.length) return { poly: [], length: 0 };
  if (points.length === 1) return { poly: [points[0]], length: 0 };
  let poly = evaluateAt(points, closed, DENSE_SPACING);
  let length = polylineLength(poly);
  // 세그먼트마다 ceil 하므로 재계산 후 개수는 MAX_DENSE_POINTS + 세그먼트 수까지 뜬다. 뒤가 P ≤ 512 로 다시 줄이므로 무해하다.
  if (poly.length > MAX_DENSE_POINTS && length > 0) {
    poly = evaluateAt(points, closed, length / MAX_DENSE_POINTS);
    length = polylineLength(poly);
  }
  return { poly, length };
}

// 커밋 시 1회만 부른다(E7). L·g 를 게임 지표와 똑같이 curvePoints 위에서 재므로 분석용 closed 가 게임용 closed 의 진부분집합이 된다.
export function classifyClosure(points: Point[]): Closure {
  const shaped = curvePoints(points);
  if (shaped.length < 2) return "point";
  const length = polylineLength(shaped);
  if (!(length >= POINT_ARC_LENGTH)) return "point"; // NaN 도 여기서 point 로 떨어진다
  const gap = pointDistance(shaped[0], shaped[shaped.length - 1]);
  const limit = Math.min(8, Math.max(1.5, 0.03 * length));
  return length > CLOSED_MIN_LENGTH && gap <= limit ? "closed" : "open";
}
