// T12 마이그레이션 + E11·E12·E13 살균. jsdom 없이 localStorage만 메모리로 흉내 낸다.

import { beforeEach, describe, expect, it } from "vitest";

import { simplify, SIMPLIFY_TOLERANCE } from "@/lib/geometry";
import { loadDraft, saveDraft } from "@/lib/storage";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; }
  }
});

const KEY = "arcana-draft-v1";
const put = (value: unknown) => store.set(KEY, JSON.stringify(value));
const line = [{ x: 10, y: 10 }, { x: 90, y: 90 }];
// 반지름 30 의 완전한 원(제어점 33개, 마지막이 첫 점과 겹친다).
const circle = Array.from({ length: 33 }, (_, index) => {
  const angle = (2 * Math.PI * index) / 32;
  return { x: 50 + 30 * Math.cos(angle), y: 50 - 30 * Math.sin(angle) };
});
// 손떨림이 섞인 레거시 점군. v1에는 simplify를 거치지 않고 저장된 그림이 있다.
const noisy = Array.from({ length: 200 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 200;
  return { x: 50 + 30 * Math.cos(angle) + (index % 2 ? 0.12 : -0.12), y: 50 - 30 * Math.sin(angle) + (index % 3 ? 0.1 : -0.1) };
});

beforeEach(() => store.clear());

describe("loadDraft", () => {
  it("키가 없으면 빈 배열", () => {
    expect(loadDraft()).toEqual([]);
  });

  it("v1 맨 배열에 id와 closure를 채워 넣는다", () => {
    put([{ points: line, symmetry: "mirrorX", rotationCount: 4 }]);
    const [stroke] = loadDraft();
    expect(stroke.id.length).toBeGreaterThan(0);
    expect(stroke.closure).toBe("open");
    expect(stroke.symmetry).toBe("mirrorX");
    expect(stroke.rotationCount).toBe(4);
    expect(stroke.points).toEqual(line);
  });

  it("v1의 결측 symmetry/rotationCount는 rotate/6", () => {
    put([{ points: line }]);
    const [stroke] = loadDraft();
    expect(stroke.symmetry).toBe("rotate");
    expect(stroke.rotationCount).toBe(6);
  });

  it("rotationCount 0은 6으로 올린다", () => {
    put([{ points: line, symmetry: "rotate", rotationCount: 0 }]);
    expect(loadDraft()[0].rotationCount).toBe(6);
  });

  it("v2 봉투를 읽고 기존 id를 유지한다", () => {
    put({ version: 2, strokes: [{ id: "keep-me", points: line, symmetry: "free", rotationCount: 6, closure: "closed" }] });
    const [stroke] = loadDraft();
    expect(stroke.id).toBe("keep-me");
    expect(stroke.closure).toBe("closed");
  });

  it("id 없는 v2 봉투에도 id를 채운다", () => {
    put({ version: 2, strokes: [{ points: line, symmetry: "free", rotationCount: 6, closure: "open" }] });
    expect(loadDraft()[0].id.length).toBeGreaterThan(0);
  });

  it("중복 id는 뒤쪽만 새로 만든다", () => {
    put([{ id: "same", points: line }, { id: "same", points: line }]);
    const [first, second] = loadDraft();
    expect(first.id).toBe("same");
    expect(second.id).not.toBe("same");
  });

  it("점이 2개 미만인 획과 배열 안 null만 버리고 나머지는 살린다", () => {
    put([{ points: [] }, null, { points: [{ x: 1, y: 1 }] }, { points: line }, "쓰레기"]);
    const strokes = loadDraft();
    expect(strokes).toHaveLength(1);
    expect(strokes[0].points).toEqual(line);
  });

  it("좌표가 NaN인 점만 걷어낸다", () => {
    put([{ points: [{ x: 10, y: 10 }, { x: null, y: 3 }, { x: 90, y: 90 }] }]);
    expect(loadDraft()[0].points).toEqual(line);
  });

  it("E13 레거시 노이즈 점군을 로드에서 한 번 정규화한다", () => {
    put([{ points: noisy }]);
    const [stroke] = loadDraft();
    expect(stroke.points.length).toBeLessThan(noisy.length / 4);
    expect(stroke.points).toEqual(simplify(noisy, SIMPLIFY_TOLERANCE));
  });

  it("손상된 JSON이면 빈 배열을 주되 원본을 지우지 않는다", () => {
    store.set(KEY, "{망가진");
    expect(loadDraft()).toEqual([]);
    expect(store.get(KEY)).toBe("{망가진");
  });

  it("closure 가 없는 항목은 좌표에서 판정한다", () => {
    put([{ points: circle, symmetry: "free", rotationCount: 6 }]);
    expect(loadDraft()[0].closure).toBe("closed");
  });

  it("같은 좌표 두 점은 point 로 복원된다", () => {
    put([{ points: [{ x: 40, y: 60 }, { x: 40, y: 60 }] }]);
    expect(loadDraft()[0].closure).toBe("point");
  });
});

describe("saveDraft", () => {
  it("version 2 봉투로 감싼다", () => {
    saveDraft([{ id: "a", points: line, symmetry: "rotate", rotationCount: 6, closure: "open" }]);
    expect(JSON.parse(store.get(KEY)!)).toEqual({
      version: 2,
      strokes: [{ id: "a", points: line, symmetry: "rotate", rotationCount: 6, closure: "open" }]
    });
  });

  it("저장한 것을 그대로 다시 읽는다", () => {
    const strokes = [{ id: "a", points: line, symmetry: "mirrorY" as const, rotationCount: 8, closure: "closed" as const }];
    saveDraft(strokes);
    expect(loadDraft()).toEqual(strokes);
  });

  it("로드 결과는 고정점이다 — 다시 저장해 읽어도 점이 바뀌지 않는다", () => {
    put([{ points: noisy }]);
    const first = loadDraft();
    saveDraft(first);
    expect(loadDraft()).toEqual(first);
  });
});
