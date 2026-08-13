import { describe, expect, it } from "vitest";

import type { Point, Stroke, Symmetry } from "@/lib/geometry";
import { polarFormula, radialProfile } from "@/lib/polar";

// polar 는 closure 를 보지 않는다. 픽스처에서는 타입을 채우는 용도로만 둔다.
const stroke = (points: Point[], symmetry: Symmetry = "free", rotationCount = 6): Stroke =>
  ({ id: "fixture", points, symmetry, rotationCount, closure: "open" });

const CIRCLE: Point[] = Array.from({ length: 36 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 36;
  return { x: 50 + 30 * Math.cos(angle), y: 50 + 30 * Math.sin(angle) };
});
const LINE: Point[] = [{ x: 50, y: 80 }, { x: 50, y: 50 }, { x: 50, y: 20 }];

describe("radialProfile", () => {
  it("획이 하나도 없으면 null", () => {
    expect(radialProfile([])).toBeNull();
  });

  it("반지름 30 원은 180칸 전부 30 근처", () => {
    const profile = radialProfile([stroke(CIRCLE)]);
    expect(profile).not.toBeNull();
    expect(profile!.length).toBe(180);
    // 실측 최대 편차 5.6424e-2
    expect(Math.max(...profile!.map((radius) => Math.abs(radius - 30)))).toBeLessThan(0.1);
  });
});

describe("polarFormula", () => {
  it("획이 없으면 빈 식", () => {
    expect(polarFormula([])).toEqual({ formula: "r(θ) = —", accuracy: 0 });
  });

  it("원은 상수항만 남는다", () => {
    expect(polarFormula([stroke(CIRCLE)])).toEqual({ formula: "r(θ) = 30.0", accuracy: 100 });
  });

  it("이관 전 출력 문자열을 글자 그대로 유지한다", () => {
    expect(polarFormula([stroke(CIRCLE), stroke(LINE)]).formula).toBe(
      "r(θ) = 29.7 + 0.6cos(4θ + 3.05) + 0.6cos(8θ + 2.96) + 0.6cos(12θ + 2.88) + 0.5cos(16θ + 2.80)"
    );
  });
});
