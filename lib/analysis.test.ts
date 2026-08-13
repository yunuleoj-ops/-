import { describe, expect, it } from "vitest";

import { analyze, analyzeFitted, fitAll } from "@/lib/analysis";
import type { Point, Stroke, Symmetry } from "@/lib/geometry";
import { classifyClosure } from "@/lib/resample";

let seq = 0;
const stroke = (points: Point[], symmetry: Symmetry = "free", rotationCount = 6): Stroke =>
  ({ id: `fixture-${seq += 1}`, points, symmetry, rotationCount, closure: classifyClosure(points) });

// 반지름 30, 제어점 36개. curvePoints 길이 183.2458, 끝점 간격 5.2293 ≤ min(8, 0.03·183.2458) = 5.4974
// 이므로 closed 로 분류된다. 적합 결과는 1항(n = −1, |c₁| = 29.99564, 정확도 0.9994869)이고,
// 1항에 머무는 근거는 국소 꺾임 보정의 absFloor 조건이다: maxError 0.1033 < ABS_FLOOR 0.15.
const CIRCLE: Point[] = Array.from({ length: 36 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 36;
  return { x: 50 + 30 * Math.cos(angle), y: 50 + 30 * Math.sin(angle) };
});
const LINE: Point[] = [{ x: 50, y: 80 }, { x: 50, y: 50 }, { x: 50, y: 20 }];
const DOT: Point[] = [{ x: 30, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 30 }];

describe("analyze", () => {
  it("획이 없으면 집계 자체를 건너뛰고 정확도는 0이 아니라 null (E4)", () => {
    const result = analyze([]);
    expect(result.strokes).toEqual([]);
    expect(result.totalTerms).toBe(0);
    expect(result.accuracy).toBeNull();
    expect(result.worst).toBeNull();
    expect(result.uniformSymmetry).toBeNull();
    expect(result.silhouette).toBe("r(θ) = —");
    expect(result.metrics.power).toBe(0);
  });

  it("원 한 획은 1항 · 획이 하나면 worst 는 null", () => {
    const result = analyze([stroke(CIRCLE)]);
    expect(result.strokes[0].spectrum.kind).toBe("closed");
    expect(result.strokes[0].operator).toEqual({ kind: "identity", count: 1 });
    expect(result.totalTerms).toBe(1);
    expect(result.accuracy).toBeGreaterThan(0.999);   // 실측 0.9994868625969441
    expect(result.worst).toBeNull();
    expect(result.uniformSymmetry).toEqual({ symmetry: "free", count: 1 });
  });

  it("직선 한 획은 0항 · 정확도 정확히 1", () => {
    const result = analyze([stroke(LINE)]);
    expect(result.strokes[0].spectrum.kind).toBe("open");
    expect(result.totalTerms).toBe(0);
    expect(result.accuracy).toBe(1);
  });

  it("전체 정확도는 획별 stats 의 호길이 가중 평균이다", () => {
    const list = [stroke(CIRCLE), stroke(LINE)];
    const result = analyze(list);
    let weight = 0; let weighted = 0;
    result.strokes.forEach((item) => {
      if (item.spectrum.kind === "point") return;
      weight += item.spectrum.stats.arcLength;
      weighted += item.spectrum.stats.arcLength * item.spectrum.stats.accuracy;
    });
    // 실측 0.9996107698039299 = (188.4782·0.9994869 + 60·1)/248.4782
    expect(result.accuracy).toBeCloseTo(weighted / weight, 12);
    expect(result.totalTerms).toBe(1);
    expect(result.worst).not.toBeNull();
    expect(result.worst!.index).toBe(0);
    expect(result.worst!.accuracy).toBeLessThan(result.accuracy!);
  });

  it("퇴화 획은 호길이 0이라 가중치가 자동으로 0이 된다 (E2)", () => {
    const circle = stroke(CIRCLE); const line = stroke(LINE);
    const withDot = analyze([circle, line, stroke(DOT)]);
    const without = analyze([circle, line]);
    expect(withDot.strokes).toHaveLength(3);
    const degenerate = withDot.strokes[2].spectrum;
    // point 의 length 는 "호길이"다. 이 픽스처는 세 점이 같은 자리라 호길이가 0인 것이지,
    // point 가 항상 0을 뜻하는 것이 아니다 — kind 와 length 를 따로 단언한다.
    expect(degenerate.kind).toBe("point");
    if (degenerate.kind === "point") expect(degenerate.length).toBe(0);
    expect(withDot.accuracy).toBe(without.accuracy);
    expect(withDot.totalTerms).toBe(without.totalTerms);
    expect(withDot.worst).toEqual(without.worst);
  });

  it("대칭 복사본 수를 가중치에 곱하지 않는다 — 등거리변환이라 추가 오차가 0이다", () => {
    const plain = analyze([stroke(CIRCLE), stroke(LINE)]);
    const copied = analyze([stroke(CIRCLE, "rotate", 8), stroke(LINE, "rotate", 8)]);
    expect(copied.accuracy).toBe(plain.accuracy);
    // operator.count 는 회전 수가 아니라 복사본 수다. 반사는 rotationCount 와 무관하게 2다.
    expect(copied.strokes[0].operator).toEqual({ kind: "rotate", count: 8 });
    expect(analyze([stroke(LINE, "mirrorX", 6)]).strokes[0].operator).toEqual({ kind: "mirrorX", count: 2 });
  });

  it("uniformSymmetry 는 전 획이 같을 때만 값을 갖는다", () => {
    expect(analyze([stroke(CIRCLE, "rotate", 6), stroke(LINE, "mirrorX")]).uniformSymmetry).toBeNull();
    expect(analyze([stroke(CIRCLE, "rotate", 6), stroke(LINE, "rotate", 8)]).uniformSymmetry).toBeNull();
    // 반사에서 rotationCount 는 복사본 수에 관여하지 않으므로 달라도 같은 연산자다.
    expect(analyze([stroke(CIRCLE, "mirrorX", 6), stroke(LINE, "mirrorX", 8)]).uniformSymmetry)
      .toEqual({ symmetry: "mirrorX", count: 2 });
  });

  it("WeakMap 캐시는 undo/redo 로 배열만 바뀌어도 같은 스펙트럼 객체를 준다", () => {
    const circle = stroke(CIRCLE); const line = stroke(LINE);
    const first = fitAll([circle, line]);
    const swapped = fitAll([line, circle]);
    expect(swapped[0]).toBe(first[1]);
    expect(swapped[1]).toBe(first[0]);
    // options 를 넘긴 호출은 캐시를 우회한다. 옵션을 키에 섞으면 "참조 == 기하" 등식이 깨진다.
    expect(fitAll([circle], { maxTerms: 1 })[0]).not.toBe(first[0]);
  });

  it("analyzeFitted 는 이미 적합된 스펙트럼을 그대로 쓴다 — page.tsx 의 2단 경계", () => {
    const list = [stroke(CIRCLE), stroke(LINE)];
    expect(analyzeFitted(list, fitAll(list))).toEqual(analyze(list));
  });

  it("analyzeFitted 는 strokes 와 spectra 의 길이가 어긋나면 즉시 던진다 (M3)", () => {
    // 위치로 짝짓는 계약이라, 길이가 다르면 조용히 undefined.kind 로 죽는 대신 여기서 먼저 잘라 밝힌다.
    const list = [stroke(CIRCLE), stroke(LINE)];
    expect(() => analyzeFitted(list, fitAll(list).slice(0, 1))).toThrow();
    expect(() => analyzeFitted(list, [...fitAll(list), ...fitAll([stroke(CIRCLE)])])).toThrow();
  });
});
