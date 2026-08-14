import { describe, expect, it } from "vitest";

import type { Point, Stroke, Symmetry } from "@/lib/geometry";
import { MAX_LENGTH, MAX_STROKES } from "@/lib/history";
import { getMetrics, MAX_POWER } from "@/lib/metrics";

const stroke = (points: Point[], symmetry: Symmetry = "free", rotationCount = 6): Stroke =>
  ({ id: "fixture", points, symmetry, rotationCount, closure: "open" });

const CIRCLE: Point[] = Array.from({ length: 36 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 36;
  return { x: 50 + 30 * Math.cos(angle), y: 50 + 30 * Math.sin(angle) };
});
const LINE: Point[] = [{ x: 50, y: 80 }, { x: 50, y: 50 }, { x: 50, y: 20 }];

// 만점 그림: 각진 닫힌 별 하나가 꼭짓점을 여럿 낸다.
const star = (radius: number, points = 5): Point[] => {
  const list = Array.from({ length: points * 2 }, (_, index) => {
    const angle = (Math.PI * index) / points;
    const r = index % 2 ? radius * 0.45 : radius;
    return { x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle) };
  });
  return [...list, list[0]];
};

describe("getMetrics", () => {
  it("빈 마법진은 0점 초급이다", () => {
    expect(getMetrics([])).toMatchObject({
      lines: 0, length: 0, intersections: 0, closed: 0,
      horizontal: 0, vertical: 0, rotation: 1, complexity: 0, power: 0, grade: "초급"
    });
  });

  it("기하 지표는 점수 개편으로 움직이지 않는다", () => {
    // 아래 값들은 화면 곳곳에 그대로 표시된다. 점수식만 바뀌었고 재는 방식은 그대로임을 못 박는다.
    expect(getMetrics([stroke(CIRCLE)])).toMatchObject({
      lines: 1, length: 183, intersections: 2, closed: 1, rotation: 1, complexity: 25
    });
    expect(getMetrics([stroke(CIRCLE, "rotate", 6)])).toMatchObject({
      lines: 1, length: 183, intersections: 10, closed: 1, rotation: 6, complexity: 41
    });
    expect(getMetrics([stroke(CIRCLE), stroke(LINE)])).toMatchObject({
      lines: 2, length: 243, intersections: 3, closed: 1, rotation: 1, complexity: 36
    });
  });

  it("일곱 지표를 모두 채운 마법진이 999를 받는다", () => {
    const strokes = [
      ...Array.from({ length: MAX_STROKES - 2 }, () => stroke(star(26), "rotate", 8)),
      stroke(star(20), "mirrorX"),
      stroke(star(20), "mirrorY")
    ];
    const metrics = getMetrics(strokes);
    expect(metrics).toMatchObject({ lines: MAX_STROKES, rotation: 8, closed: MAX_STROKES, intersections: 28 });
    expect(metrics.power).toBe(MAX_POWER);
    expect(metrics.grade).toBe("초월");
  });

  it("매끈한 원만으로는 만점이 나오지 않는다 — 꺾임이 통째로 빠진다", () => {
    const strokes = Array.from({ length: MAX_STROKES }, () => stroke(CIRCLE, "rotate", 8));
    const metrics = getMetrics(strokes);
    expect(metrics.power).toBeGreaterThan(700);
    expect(metrics.power).toBeLessThan(MAX_POWER - 100);
  });

  it(`길이 점수는 잉크 예산 ${MAX_LENGTH}에서 만점이고 더 그려도 오르지 않는다`, () => {
    const long = Array.from({ length: 6 }, () => stroke(CIRCLE, "rotate", 8));   // 길이 1000 남짓
    const longer = Array.from({ length: 10 }, () => stroke(CIRCLE, "rotate", 8)); // 길이 1800 남짓
    expect(getMetrics(long).length).toBeGreaterThan(MAX_LENGTH);
    // 길이 지표가 이미 만점이라 남은 차이는 획 수에서만 온다.
    const gap = getMetrics(longer).power - getMetrics(long).power;
    expect(gap).toBeLessThanOrEqual(120 * (4 / MAX_STROKES) + 1);
  });

  it("회전 수를 올리면 점수가 오른다", () => {
    const power = (count: number) => getMetrics([stroke(CIRCLE, "rotate", count)]).power;
    expect(power(8)).toBeGreaterThan(power(6));
    expect(power(6)).toBeGreaterThan(power(2));
  });

  it("획을 늘리기만 하고 닫지 않으면 닫힘 점수가 깎인다", () => {
    const closedOnly = getMetrics(Array.from({ length: 4 }, () => stroke(CIRCLE, "rotate", 8)));
    const halfOpen = getMetrics([
      ...Array.from({ length: 4 }, () => stroke(CIRCLE, "rotate", 8)),
      ...Array.from({ length: 4 }, () => stroke(LINE, "rotate", 8))
    ]);
    // 획 수·길이는 늘었지만 닫힘 비율이 절반으로 떨어져 그만큼을 되돌려 준다.
    expect(halfOpen.closed / halfOpen.lines).toBeLessThan(closedOnly.closed / closedOnly.lines);
  });

  it("등급은 새 경계에서 갈린다", () => {
    const gradeOf = (power: number) => power >= 650 ? "초월" : power >= 400 ? "고급" : power >= 180 ? "중급" : "초급";
    const samples = [
      getMetrics([stroke(CIRCLE)]),
      getMetrics([stroke(CIRCLE, "rotate", 6)]),
      getMetrics(Array.from({ length: 6 }, () => stroke(star(26), "rotate", 8)))
    ];
    samples.forEach((metrics) => expect(metrics.grade).toBe(gradeOf(metrics.power)));
  });
});
