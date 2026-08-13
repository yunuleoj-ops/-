import { describe, expect, it } from "vitest";

import type { Point, Stroke, Symmetry } from "@/lib/geometry";
import { getMetrics } from "@/lib/metrics";
import { polarFormula } from "@/lib/polar";

const stroke = (points: Point[], symmetry: Symmetry = "free", rotationCount = 6): Stroke =>
  ({ id: "fixture", points, symmetry, rotationCount, closure: "open" });

const CIRCLE: Point[] = Array.from({ length: 36 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 36;
  return { x: 50 + 30 * Math.cos(angle), y: 50 + 30 * Math.sin(angle) };
});
const LINE: Point[] = [{ x: 50, y: 80 }, { x: 50, y: 50 }, { x: 50, y: 20 }];

const CASES: Stroke[][] = [
  [],
  [stroke(CIRCLE)],
  [stroke(CIRCLE, "rotate", 6)],
  [stroke(CIRCLE), stroke(LINE)]
];

describe("getMetrics", () => {
  it("극좌표식을 lib/polar 에 위임한다 — 이관 중 두 번째 사본이 남지 않았다", () => {
    for (const list of CASES) {
      const metrics = getMetrics(list);
      const polar = polarFormula(list);
      expect(metrics.formula).toBe(polar.formula);
      expect(metrics.accuracy).toBe(polar.accuracy);
    }
  });

  // E8: 분석용 닫힘 임계(classifyClosure)가 게임용 임계의 진부분집합이라는 사실의 반대편 증거다.
  // 아래 네 줄이 움직이면 등급 컷(60/150/260)이 조용히 이동했다는 뜻이다.
  // toMatchObject 를 쓰는 이유: Task 11 이 formula/accuracy 두 필드를 뗄 때 이 스위트를 한 줄도 고칠 필요가 없다.
  it("닫힘 판정과 위력·등급이 이번 변경으로 움직이지 않는다", () => {
    expect(getMetrics([])).toMatchObject({
      lines: 0, length: 0, intersections: 0, closed: 0,
      horizontal: 0, vertical: 0, rotation: 1, complexity: 0, power: 0, grade: "초급"
    });
    expect(getMetrics([stroke(CIRCLE)])).toMatchObject({
      lines: 1, length: 183, intersections: 2, closed: 1,
      horizontal: 12, vertical: 11, rotation: 1, complexity: 25, power: 61, grade: "중급"
    });
    expect(getMetrics([stroke(CIRCLE, "rotate", 6)])).toMatchObject({
      lines: 1, length: 183, intersections: 10, closed: 1,
      horizontal: 12, vertical: 11, rotation: 6, complexity: 41, power: 172, grade: "고급"
    });
    expect(getMetrics([stroke(CIRCLE), stroke(LINE)])).toMatchObject({
      lines: 2, length: 243, intersections: 3, closed: 1,
      horizontal: 15, vertical: 14, rotation: 1, complexity: 36, power: 87, grade: "중급"
    });
  });
});
