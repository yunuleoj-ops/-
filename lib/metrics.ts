// 마법진의 위력 지표. 공유 링크로 받은 마법진도 같은 값을 내도록 순수 함수로 둔다.

import { copiesFor, curvePoints, pointDistance, type Stroke } from "@/lib/geometry";
import { polarFormula } from "@/lib/polar";

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
