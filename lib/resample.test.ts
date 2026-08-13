import { describe, expect, test } from "vitest";

import { curvePoints, pointDistance, simplify, SIMPLIFY_TOLERANCE, type Point } from "@/lib/geometry";
import {
  classifyClosure, densify, fromComplex, MAX_DENSE_POINTS, polylineLength, resampleUniform, toComplex
} from "@/lib/resample";

// 반지름 radius 의 원호를 count 개 제어점으로 만든다. degrees=360 이면 마지막 점이 첫 점과 겹친다.
const arcPoints = (degrees: number, radius = 30, count = 24): Point[] =>
  Array.from({ length: count }, (_, index) => {
    const angle = ((degrees * Math.PI) / 180) * (index / (count - 1));
    return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
  });

const gapsOf = (points: Point[], wrap: boolean) => {
  const gaps: number[] = [];
  for (let index = 1; index < points.length; index += 1) gaps.push(pointDistance(points[index - 1], points[index]));
  if (wrap) gaps.push(pointDistance(points[points.length - 1], points[0]));
  return gaps;
};
// 인접 간격의 표준편차 / 평균. 등간격이면 0 에 수렴한다.
const spreadOf = (values: number[]) => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) / mean;
};
// metrics.getMetrics 안의 게임용 닫힘 판정과 글자 그대로 같은 식.
const gameClosed = (points: Point[]) => {
  const shaped = curvePoints(points);
  return polylineLength(shaped) > 18 && pointDistance(shaped[0], shaped[shaped.length - 1]) < 8;
};
const allFinite = (points: Point[]) => points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

describe("toComplex / fromComplex", () => {
  test("캔버스 중심이 원점, 화면 오른쪽이 +re, 화면 위쪽이 +im", () => {
    expect(toComplex({ x: 50, y: 50 })).toEqual({ re: 0, im: 0 });
    expect(toComplex({ x: 80, y: 50 })).toEqual({ re: 30, im: 0 });
    expect(toComplex({ x: 50, y: 20 })).toEqual({ re: 0, im: 30 });
    expect(fromComplex({ re: 0, im: 30 })).toEqual({ x: 50, y: 20 });
  });

  test("왕복하면 원래 점으로 돌아온다", () => {
    let worst = 0;
    for (let x = -10; x <= 110; x += 3.7) {
      for (let y = -10; y <= 110; y += 3.7) {
        const back = fromComplex(toComplex({ x, y }));
        worst = Math.max(worst, Math.abs(back.x - x), Math.abs(back.y - y));
      }
    }
    expect(worst).toBeLessThan(1e-12);
  });
});

describe("classifyClosure", () => {
  test("350° 호는 닫힘, 345°/320° 호는 열림", () => {
    expect(classifyClosure(arcPoints(360))).toBe("closed");
    expect(classifyClosure(arcPoints(350))).toBe("closed");
    expect(classifyClosure(arcPoints(345))).toBe("open");
    expect(classifyClosure(arcPoints(320))).toBe("open");
    expect(classifyClosure(arcPoints(180))).toBe("open");
  });

  test("퇴화 획은 NaN 없이 point", () => {
    expect(classifyClosure(Array.from({ length: 12 }, () => ({ x: 40, y: 60 })))).toBe("point");
    expect(classifyClosure([])).toBe("point");
    expect(classifyClosure([{ x: 10, y: 10 }])).toBe("point");
    expect(classifyClosure([{ x: 50, y: 50 }, { x: 50.4, y: 50 }])).toBe("point");
    expect(classifyClosure([{ x: NaN, y: 50 }, { x: 80, y: 50 }])).toBe("point");
    expect(classifyClosure([{ x: 50, y: 50 }, { x: 51, y: 50 }])).toBe("open");
  });

  test("긴 직선은 열림", () => {
    expect(classifyClosure([{ x: 20, y: 50 }, { x: 80, y: 50 }])).toBe("open");
  });

  test("분석용 닫힘은 게임용 닫힘의 진부분집합", () => {
    let violations = 0;
    let gameOnly = 0;
    for (let radius = 5; radius <= 45; radius += 5) {
      for (let degrees = 90; degrees <= 360; degrees += 1) {
        const points = arcPoints(degrees, radius);
        const analysis = classifyClosure(points) === "closed";
        const game = gameClosed(points);
        if (analysis && !game) violations += 1;
        if (game && !analysis) gameOnly += 1;
      }
    }
    expect(violations).toBe(0);
    expect(gameOnly).toBe(176);
    expect(classifyClosure(arcPoints(345))).toBe("open");
    expect(gameClosed(arcPoints(345))).toBe(true);
  });

  // endStroke 는 simplify 로 점을 걷어낸 뒤에 판정을 동결한다(스펙 §3). 그 순서에서 판정이 뒤집히면
  // 사용자는 원을 그렸는데 앱은 열린 획으로 적합하고, 그 증상은 "항이 1개가 아니라 5개"로만 나타난다.
  test("endStroke 파이프라인: simplify 를 거쳐도 판정이 뒤집히지 않는다", () => {
    const drawn = arcPoints(360, 30, 64);
    const simplified = simplify(drawn, SIMPLIFY_TOLERANCE);
    expect(simplified.length).toBe(32);
    expect(classifyClosure(drawn)).toBe("closed");
    expect(classifyClosure(simplified)).toBe("closed");

    // 손떨림 원: 반지름에 0.25 단위 고주파 리플을 얹은 240 점. RDP 가 18 점까지 줄여도 닫힘이다.
    const shaky = Array.from({ length: 240 }, (_, index) => {
      const angle = (2 * Math.PI * index) / 239;
      const radius = 30 + 0.25 * Math.sin(index * 12.9898);
      return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
    });
    expect(simplify(shaky, SIMPLIFY_TOLERANCE).length).toBe(18);
    expect(classifyClosure(simplify(shaky, SIMPLIFY_TOLERANCE))).toBe("closed");

    // 열린 호는 simplify 가 한 점도 못 줄여도 그대로 열림이어야 한다.
    expect(classifyClosure(simplify(arcPoints(345), SIMPLIFY_TOLERANCE))).toBe("open");
  });
});

describe("densify", () => {
  test("렌더와 같은 곡선을 더 촘촘히 훑는다", () => {
    const points = arcPoints(350);
    const { poly, length } = densify(points, false);
    const renderedLength = polylineLength(curvePoints(points));
    expect(poly[0]).toEqual(points[0]);
    expect(pointDistance(poly[poly.length - 1], points[points.length - 1])).toBeLessThan(1e-12);
    expect(length).toBeGreaterThanOrEqual(renderedLength);
    expect(length - renderedLength).toBeLessThan(0.05);
    expect(Math.max(...gapsOf(poly, false))).toBeLessThan(0.3);
  });

  test("닫힘이면 마지막 제어점에서 첫 제어점으로 돌아오는 직선 현이 붙는다", () => {
    const points = arcPoints(350);
    const open = densify(points, false);
    const closed = densify(points, true);
    const chord = pointDistance(points[points.length - 1], points[0]);
    // 현의 길이만큼만 늘어난다 = 닫는 구간이 직선이라는 뜻이다. 이웃을 순환으로 감으면 이 등식이 깨진다.
    expect(closed.length - open.length).toBeCloseTo(chord, 9);
    expect(pointDistance(closed.poly[closed.poly.length - 1], points[0])).toBeLessThan(1e-12);
    // 열림 구간의 좌표는 closed 여부와 무관하게 글자 그대로 같다.
    expect(closed.poly.slice(0, open.poly.length)).toEqual(open.poly);
  });

  test("퇴화 입력에서 길이 0 을 돌려주고 NaN 을 만들지 않는다", () => {
    const same = Array.from({ length: 12 }, () => ({ x: 40, y: 60 }));
    const degenerate = densify(same, false);
    expect(degenerate.length).toBe(0);
    expect(allFinite(degenerate.poly)).toBe(true);
    expect(densify([], false)).toEqual({ poly: [], length: 0 });
    expect(densify([{ x: 3, y: 4 }], false)).toEqual({ poly: [{ x: 3, y: 4 }], length: 0 });
  });

  test("1차 평가가 4096 점을 넘으면 간격을 다시 잡는다", () => {
    const zigzag = Array.from({ length: 81 }, (_, index) => ({ x: index % 2 ? 88 : 12, y: 6 + (index * 88) / 80 }));
    let firstPass = 1;
    for (let index = 0; index < zigzag.length - 1; index += 1) {
      firstPass += Math.min(64, Math.max(4, Math.ceil(pointDistance(zigzag[index], zigzag[index + 1]) / 0.25)));
    }
    expect(firstPass).toBeGreaterThan(MAX_DENSE_POINTS);
    const { poly } = densify(zigzag, false);
    expect(poly.length).toBeLessThan(firstPass);
    // 세그먼트마다 ceil 하므로 정확히 4096 은 아니고 세그먼트 수만큼 넘칠 수 있다.
    expect(poly.length).toBeLessThanOrEqual(MAX_DENSE_POINTS + zigzag.length);
  });
});

describe("resampleUniform", () => {
  test("닫힘: 표본 P 개, 끝점 중복 없음, 호길이 등간격", () => {
    const { poly, length } = densify(arcPoints(360, 30, 33), true);
    const samples = resampleUniform(poly, length, 256, true);
    expect(samples.length).toBe(256);
    expect(allFinite(samples)).toBe(true);
    const gaps = gapsOf(samples, true);
    expect(gaps.length).toBe(256);
    expect(spreadOf(gaps)).toBeLessThan(1e-3);
    expect(gaps.reduce((sum, gap) => sum + gap, 0) / 256).toBeCloseTo(length / 256, 3);
  });

  test("열림: 표본 P+1 개, 양 끝 포함", () => {
    const { poly, length } = densify(arcPoints(350), false);
    const samples = resampleUniform(poly, length, 128, false);
    expect(samples.length).toBe(129);
    expect(pointDistance(samples[0], poly[0])).toBeLessThan(1e-12);
    expect(pointDistance(samples[128], poly[poly.length - 1])).toBeLessThan(1e-9);
    expect(spreadOf(gapsOf(samples, false))).toBeLessThan(1e-3);
  });

  test("직선은 정확히 등간격", () => {
    const { poly, length } = densify([{ x: 20, y: 50 }, { x: 80, y: 50 }], false);
    expect(length).toBe(60);
    const gaps = gapsOf(resampleUniform(poly, length, 128, false), false);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-12);
    expect(gaps[0]).toBeCloseTo(60 / 128, 12);
  });

  test("퇴화 폴리라인도 NaN 을 만들지 않는다", () => {
    const { poly, length } = densify(Array.from({ length: 12 }, () => ({ x: 40, y: 60 })), false);
    const samples = resampleUniform(poly, length, 128, false);
    expect(samples.length).toBe(129);
    expect(samples.every((point) => point.x === 40 && point.y === 60)).toBe(true);
    expect(resampleUniform([], 0, 128, false)).toEqual([]);
  });

  test("실전 경로: 350° 호는 닫힘 판정이므로 닫힌 현까지 포함해 등간격", () => {
    const points = arcPoints(350);
    expect(classifyClosure(points)).toBe("closed");
    const { poly, length } = densify(points, true);
    expect(length).toBeCloseTo(188.4492, 3);
    const samples = resampleUniform(poly, length, 378, true);
    expect(samples.length).toBe(378);
    expect(spreadOf(gapsOf(samples, true))).toBeLessThan(1e-3);
  });
});
