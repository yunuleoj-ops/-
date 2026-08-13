// 리팩터가 화면에 그려지는 결과를 바꾸지 않았는지 확인하는 회귀 테스트.
// 값은 현재 구현의 실제 출력이며, 여기가 깨지면 그림이 달라진 것이다.
import { describe, expect, it } from "vitest";

import { copiesFor, curvePoints, pathFor, strokeCopies, transformPoint, type Point, type Stroke, type Symmetry } from "@/lib/geometry";

const TRIANGLE: Point[] = [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }];
const SQUARE: Point[] = [...TRIANGLE, { x: 20, y: 80 }];
// Task 2에서 Stroke에 id/closure가 붙으면 이 한 줄만 고치면 된다.
const strokeOf = (symmetry: Symmetry, rotationCount: number, points: Point[]): Stroke => ({ points, symmetry, rotationCount });

describe("pathFor", () => {
  it("점이 없으면 빈 문자열", () => {
    expect(pathFor([])).toBe("");
  });

  it("1점은 M 명령 하나", () => {
    expect(pathFor([{ x: 10, y: 20 }])).toBe("M10.00 20.00");
  });

  it("2점은 직선 L", () => {
    expect(pathFor([{ x: 10, y: 20 }, { x: 30, y: 40 }])).toBe("M10.00 20.00 L30.00 40.00");
  });

  it("3점은 큐빅 베지어 2개", () => {
    expect(pathFor(TRIANGLE)).toBe("M20.00 20.00 C30.00 20.00 70.00 10.00 80.00 20.00 C90.00 30.00 80.00 70.00 80.00 80.00");
  });

  it("4점은 큐빅 베지어 3개", () => {
    expect(pathFor(SQUARE)).toBe("M20.00 20.00 C30.00 20.00 70.00 10.00 80.00 20.00 C90.00 30.00 90.00 70.00 80.00 80.00 C70.00 90.00 30.00 80.00 20.00 80.00");
  });

  it("좌표는 소수 둘째 자리로 고정한다", () => {
    expect(pathFor([{ x: 1 / 3, y: 2 / 3 }, { x: 99.999, y: 0.005 }])).toBe("M0.33 0.67 L100.00 0.01");
  });

  it("closed면 끝에 Z를 붙여 실제로 닫는다", () => {
    expect(pathFor(TRIANGLE, true)).toBe("M20.00 20.00 C30.00 20.00 70.00 10.00 80.00 20.00 C90.00 30.00 80.00 70.00 80.00 80.00 Z");
  });

  it("closed 기본값은 false이고 명시해도 열린 출력과 한 글자도 다르지 않다", () => {
    expect(pathFor(TRIANGLE, false)).toBe(pathFor(TRIANGLE));
    expect(pathFor(SQUARE, false)).toBe(pathFor(SQUARE));
  });

  it("2점 직선도 닫을 수 있다", () => {
    expect(pathFor([{ x: 10, y: 20 }, { x: 30, y: 40 }], true)).toBe("M10.00 20.00 L30.00 40.00 Z");
  });

  it("점이 없으면 closed여도 빈 문자열", () => {
    expect(pathFor([], true)).toBe("");
  });
});

describe("curvePoints", () => {
  it("점이 3개 미만이면 입력 배열을 그대로 돌려준다", () => {
    const two: Point[] = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    expect(curvePoints(two)).toBe(two);
  });

  it("세그먼트마다 8등분 + 시작점", () => {
    expect(curvePoints(TRIANGLE)).toHaveLength(17);
    expect(curvePoints(SQUARE)).toHaveLength(25);
  });

  it("샘플이 제어점을 정확히 지난다", () => {
    const sampled = curvePoints(TRIANGLE);
    expect(sampled[0]).toEqual({ x: 20, y: 20 });
    expect(sampled[8]).toEqual({ x: 80, y: 20 });
    expect(sampled[16]).toEqual({ x: 80, y: 80 });
  });

  it("세그먼트 중앙의 좌표를 고정한다", () => {
    const sampled = curvePoints(TRIANGLE);
    expect(sampled[4]).toEqual({ x: 50, y: 16.25 });
    expect(sampled[12]).toEqual({ x: 83.75, y: 50 });
  });
});

describe("transformPoint", () => {
  const p: Point = { x: 80, y: 30 };

  it("free는 복사본 인덱스와 무관하게 그대로", () => {
    expect(transformPoint(p, "free", 6, 0)).toEqual({ x: 80, y: 30 });
    expect(transformPoint(p, "free", 6, 1)).toEqual({ x: 80, y: 30 });
  });

  it("mirrorX는 1번 사본의 x를 100에서 뺀다", () => {
    expect(transformPoint(p, "mirrorX", 2, 0)).toEqual({ x: 80, y: 30 });
    expect(transformPoint(p, "mirrorX", 2, 1)).toEqual({ x: 20, y: 30 });
  });

  it("mirrorY는 1번 사본의 y를 100에서 뺀다", () => {
    expect(transformPoint(p, "mirrorY", 2, 0)).toEqual({ x: 80, y: 30 });
    expect(transformPoint(p, "mirrorY", 2, 1)).toEqual({ x: 80, y: 70 });
  });

  it("rotate 0번 사본은 항등", () => {
    expect(transformPoint(p, "rotate", 4, 0)).toEqual({ x: 80, y: 30 });
  });

  it("rotate는 (50,50) 둘레를 화면 시계방향으로 돈다", () => {
    const q = transformPoint({ x: 50, y: 20 }, "rotate", 6, 1);
    expect(q.x).toBeCloseTo(50 + 30 * Math.sin(Math.PI / 3), 10);
    expect(q.y).toBeCloseTo(35, 10);
  });
});

describe("copiesFor", () => {
  it("free 1개 · 거울 2개 · 회전은 지정 수", () => {
    expect(copiesFor("free", 6)).toBe(1);
    expect(copiesFor("mirrorX", 6)).toBe(2);
    expect(copiesFor("mirrorY", 6)).toBe(2);
    expect(copiesFor("rotate", 2)).toBe(2);
    expect(copiesFor("rotate", 6)).toBe(6);
  });
});

describe("strokeCopies", () => {
  it("free는 사본 1개", () => {
    expect(strokeCopies(strokeOf("free", 6, [{ x: 1, y: 2 }]))).toEqual([[{ x: 1, y: 2 }]]);
  });

  it("mirrorX는 원본과 반사본 2개", () => {
    expect(strokeCopies(strokeOf("mirrorX", 6, [{ x: 80, y: 30 }, { x: 90, y: 40 }]))).toEqual([
      [{ x: 80, y: 30 }, { x: 90, y: 40 }],
      [{ x: 20, y: 30 }, { x: 10, y: 40 }]
    ]);
  });

  it("rotate 4겹은 사본 4개이고 0번이 원본", () => {
    const copies = strokeCopies(strokeOf("rotate", 4, [{ x: 80, y: 50 }]));
    expect(copies).toHaveLength(4);
    expect(copies[0]).toEqual([{ x: 80, y: 50 }]);
    expect(copies[1][0].x).toBeCloseTo(50, 10);
    expect(copies[1][0].y).toBeCloseTo(80, 10);
    expect(copies[2][0].x).toBeCloseTo(20, 10);
    expect(copies[2][0].y).toBeCloseTo(50, 10);
    expect(copies[3][0].x).toBeCloseTo(50, 10);
    expect(copies[3][0].y).toBeCloseTo(20, 10);
  });
});
