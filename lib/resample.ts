// 획을 호길이 균등 표본으로 바꾼다. 푸리에 계수는 매개변수화에 의존하므로 이 모듈이 틀리면 뒤가 전부 무의미해진다.
//
// 좌표는 여기서 단 한 번 z = conj(p − 중심) 으로 옮긴다. 화면의 "중심 이동 + y 뒤집기"가
// 수학 좌표에서는 켤레 한 번이라, 이후 모든 대칭 연산자에 평행이동 항이 등장하지 않는다.

import { curvePoints, pointDistance, type Closure, type Point } from "@/lib/geometry";

export type Complex = { re: number; im: number };

export const CENTER: Point = { x: 50, y: 50 };
export const POINT_ARC_LENGTH = 1.0;
export const CLOSED_MIN_LENGTH = 18;

export const toComplex = (point: Point): Complex => ({ re: point.x - CENTER.x, im: CENTER.y - point.y });
export const fromComplex = (z: Complex): Point => ({ x: CENTER.x + z.re, y: CENTER.y - z.im });

export const polylineLength = (poly: Point[]): number => {
  let total = 0;
  for (let index = 1; index < poly.length; index += 1) total += pointDistance(poly[index - 1], poly[index]);
  return total;
};

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
