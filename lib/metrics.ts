// 마법진의 위력 지표. 공유 링크로 받은 마법진도 같은 값을 내도록 순수 함수로 둔다.
//
// 위력은 지표 일곱 개의 합이고 만점은 999다. 명목 합계를 1000으로 두고 999에서 자르는 이유는,
// 마지막 1점까지 완벽해야 만점이 되는 것보다 "충분히 훌륭하면 만점"이 게임으로서 낫기 때문이다.
// 한 지표만 몰아서는 만점이 나오지 않는다 — 매끈한 원만 그리면 꺾임 120이 통째로 빠진다.

import { copiesFor, curvePoints, pointDistance, type Stroke } from "@/lib/geometry";
import { MAX_STROKES } from "@/lib/history";

export type Metrics = ReturnType<typeof getMetrics>;

// 각 지표의 만점과 그 만점을 받는 기준값. 합 1000.
const SCORE = {
  lines: { max: 120, full: MAX_STROKES },
  closed: { max: 130, full: 1 },        // 닫힘 비율이라 기준값은 1
  rotation: { max: 200, full: 7 },      // (회전 수 - 1), 회전 8회가 만점
  mirror: { max: 130, full: 2 },        // 좌우·상하 각 65
  intersections: { max: 150, full: 28 },
  corners: { max: 120, full: 36 },
  length: { max: 150, full: 1100 }
} as const;

export const MAX_POWER = 999;

const band = (value: number, { max, full }: { max: number; full: number }) =>
  Math.min(max, (Math.max(0, value) / full) * max);

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

  const power = Math.min(MAX_POWER, Math.round(
    band(lines, SCORE.lines)
    // 닫힘은 개수가 아니라 비율이다. 획을 늘려 점수를 사는 것은 획 수 지표가 이미 재고 있다.
    + band(lines ? closed / lines : 0, SCORE.closed)
    + band(rotation - 1, SCORE.rotation)
    + band((mirroredX ? 1 : 0) + (mirroredY ? 1 : 0), SCORE.mirror)
    + band(intersections, SCORE.intersections)
    + band(corners, SCORE.corners)
    + band(length, SCORE.length)
  ));
  const grade = power >= 650 ? "초월" : power >= 400 ? "고급" : power >= 180 ? "중급" : "초급";
  return { lines, length: Math.round(length), intersections, closed, horizontal, vertical, rotation, complexity, power, grade };
}
