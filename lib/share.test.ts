import { describe, expect, test } from "vitest";

import type { Point, Stroke } from "@/lib/geometry";
import { decodeShare, encodeShare } from "@/lib/share";

const arcPoints = (degrees: number, radius = 30, count = 24): Point[] =>
  Array.from({ length: count }, (_, index) => {
    const angle = ((degrees * Math.PI) / 180) * (index / (count - 1));
    return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
  });

const strokeOf = (points: Point[]): Stroke =>
  ({ id: "fixture", points, symmetry: "free", rotationCount: 6, closure: "open" });

describe("공유 링크의 카드 이름", () => {
  const strokes = [strokeOf(arcPoints(360, 30, 33))];

  test("사용자가 지은 이름이 왕복한다", async () => {
    const decoded = await decodeShare(await encodeShare({ strokes, attributes: ["light"], name: "나의 첫 마법진" }));
    expect(decoded?.name).toBe("나의 첫 마법진");
  });

  test("이름을 붙이지 않으면 빈 문자열로 돌아오고 링크도 길어지지 않는다", async () => {
    const withoutName = await encodeShare({ strokes, attributes: ["light"] });
    const withEmptyName = await encodeShare({ strokes, attributes: ["light"], name: "   " });
    expect(withEmptyName).toBe(withoutName);
    expect((await decodeShare(withoutName))?.name).toBe("");
  });

  test("이름은 받는 쪽에서도 다듬는다 — 보낸 쪽 정리를 믿지 않는다", async () => {
    const encoded = await encodeShare({ strokes, attributes: ["light"], name: "긴".repeat(80) });
    expect([...(await decodeShare(encoded))?.name ?? ""].length).toBe(24);
  });
});

describe("decodeShare 의 closure", () => {
  test("링크로 받은 원은 closed, 직선은 open, 한 점은 point 로 복원된다", async () => {
    const strokes = [
      strokeOf(arcPoints(360, 30, 33)),
      strokeOf([{ x: 20, y: 50 }, { x: 80, y: 50 }]),
      strokeOf([{ x: 40, y: 60 }, { x: 40, y: 60 }])
    ];
    const decoded = await decodeShare(await encodeShare({ strokes, attributes: ["light"] }));
    expect(decoded?.strokes.map((stroke) => stroke.closure)).toEqual(["closed", "open", "point"]);
  });

  test("0.1 단위 양자화를 거쳐도 경계 근처 획의 판정이 유지된다", async () => {
    const encoded = await encodeShare({ strokes: [strokeOf(arcPoints(350))], attributes: ["light"] });
    const decoded = await decodeShare(encoded);
    expect(decoded?.strokes[0].closure).toBe("closed");
  });
});
