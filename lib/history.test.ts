// 이 파일이 지키는 것 둘.
// (1) 되돌리기는 어떤 연산이든 되돌린다 — 지우개도, 전체 지우기도.
// (2) 어떤 순서로 되돌리기·다시 실행을 눌러도 같은 id 를 가진 획이 둘이 되지 않는다.
//     그 증상이 화면에서는 "Encountered two children with the same key" 로 나타난다.
import { describe, expect, it } from "vitest";

import { EMPTY_HISTORY, historyReducer, MAX_HISTORY, MAX_STROKES, type History, type HistoryAction } from "@/lib/history";
import type { Point, Stroke } from "@/lib/geometry";

const strokeAt = (id: string, x: number, y: number): Stroke =>
  ({ id, points: [{ x, y }, { x: x + 5, y: y + 5 }], symmetry: "free", rotationCount: 6, closure: "open" });

const run = (start: History, actions: HistoryAction[]) => actions.reduce(historyReducer, start);
const idsOf = (state: History) => state.present.map((stroke) => stroke.id);
const hasDuplicate = (state: History) => new Set(idsOf(state)).size !== state.present.length;

const THREE = run(EMPTY_HISTORY, [
  { type: "commit", stroke: strokeAt("a", 10, 10) },
  { type: "commit", stroke: strokeAt("b", 30, 30) },
  { type: "commit", stroke: strokeAt("c", 50, 50) }
]);

describe("historyReducer", () => {
  it("커밋은 획을 쌓고 다시 실행을 비운다", () => {
    expect(idsOf(THREE)).toEqual(["a", "b", "c"]);
    expect(THREE.future).toEqual([]);
    expect(THREE.past).toHaveLength(3);
  });

  it("되돌리기는 직전 그림으로 돌아간다", () => {
    const state = historyReducer(THREE, { type: "undo" });
    expect(idsOf(state)).toEqual(["a", "b"]);
    expect(state.future).toHaveLength(1);
  });

  it("되돌리기와 다시 실행을 전부 거치면 원래 순서로 돌아온다", () => {
    const state = run(THREE, [{ type: "undo" }, { type: "undo" }, { type: "undo" }, { type: "redo" }, { type: "redo" }, { type: "redo" }]);
    expect(idsOf(state)).toEqual(["a", "b", "c"]);
    expect(state.future).toEqual([]);
    expect(hasDuplicate(state)).toBe(false);
  });

  it("다시 실행을 연달아 보내도 같은 획이 중복되지 않는다", () => {
    // 한 렌더 안에서 버튼을 세 번 누른 상황. 별개 useState 였을 때 여기서 같은 획이 세 번 들어갔다.
    const undone = run(THREE, [{ type: "undo" }, { type: "undo" }, { type: "undo" }]);
    const state = run(undone, [{ type: "redo" }, { type: "redo" }, { type: "redo" }]);
    expect(state.present).toHaveLength(3);
    expect(hasDuplicate(state)).toBe(false);
  });

  it("빈 기록에 되돌리기·다시 실행을 보내면 상태가 그대로다", () => {
    expect(historyReducer(EMPTY_HISTORY, { type: "undo" })).toBe(EMPTY_HISTORY);
    expect(historyReducer(EMPTY_HISTORY, { type: "redo" })).toBe(EMPTY_HISTORY);
    expect(historyReducer(THREE, { type: "redo" })).toBe(THREE);
  });

  it("리듀서는 순수하다 — 같은 액션을 두 번 접어도 결과가 같다", () => {
    // StrictMode 는 개발 중 리듀서를 두 번 실행한다. 그때 결과가 달라지면 안 된다.
    const once = historyReducer(THREE, { type: "undo" });
    const twice = historyReducer(THREE, { type: "undo" });
    expect(idsOf(once)).toEqual(idsOf(twice));
    expect(once.future.map((snapshot) => snapshot.map((stroke) => stroke.id)))
      .toEqual(twice.future.map((snapshot) => snapshot.map((stroke) => stroke.id)));
    expect(idsOf(THREE)).toEqual(["a", "b", "c"]);
  });

  it("새 획을 커밋하면 되돌린 그림들은 버려진다", () => {
    const state = run(THREE, [{ type: "undo" }, { type: "commit", stroke: strokeAt("d", 70, 70) }]);
    expect(idsOf(state)).toEqual(["a", "b", "d"]);
    expect(state.future).toEqual([]);
  });

  it("지우개는 닿은 획만 지운다", () => {
    const state = historyReducer(THREE, { type: "eraseAt", point: { x: 31, y: 31 }, radius: 5 });
    expect(idsOf(state)).toEqual(["a", "c"]);
  });

  it("지우개로 지운 획은 되돌리기로 돌아온다", () => {
    const erased = historyReducer(THREE, { type: "eraseAt", point: { x: 31, y: 31 }, radius: 5 });
    const back = historyReducer(erased, { type: "undo" });
    expect(idsOf(back)).toEqual(["a", "b", "c"]);
    // 다시 실행하면 지운 상태로 돌아간다.
    expect(idsOf(historyReducer(back, { type: "redo" }))).toEqual(["a", "c"]);
  });

  it("아무것도 지우지 못한 지우개질은 상태를 건드리지 않는다", () => {
    const state = historyReducer(THREE, { type: "eraseAt", point: { x: 95, y: 95 }, radius: 5 });
    expect(state).toBe(THREE);
  });

  it("전체 지우기도 되돌릴 수 있다", () => {
    const cleared = historyReducer(THREE, { type: "clear" });
    expect(cleared.present).toEqual([]);
    expect(idsOf(historyReducer(cleared, { type: "undo" }))).toEqual(["a", "b", "c"]);
  });

  it("빈 그림에 전체 지우기를 보내면 상태가 그대로다", () => {
    expect(historyReducer(EMPTY_HISTORY, { type: "clear" })).toBe(EMPTY_HISTORY);
  });

  it("빈 배열 복원은 기존 그림을 덮어쓰지 않는다", () => {
    // E20: 불러오기가 실패해 빈 배열이 와도 이미 그린 것을 지우면 안 된다.
    expect(historyReducer(THREE, { type: "restore", strokes: [] })).toBe(THREE);
  });

  it("복원은 기록을 새로 시작한다 — 불러오기 이전으로 돌아갈 자리는 없다", () => {
    const state = historyReducer(THREE, { type: "restore", strokes: [strokeAt("z", 10, 10)] });
    expect(state).toEqual({ past: [], present: [strokeAt("z", 10, 10)], future: [] });
  });

  it(`획은 ${MAX_STROKES}개까지만 들어간다`, () => {
    const full = run(EMPTY_HISTORY, Array.from({ length: MAX_STROKES + 4 }, (_, index) =>
      ({ type: "commit", stroke: strokeAt("s" + index, index * 3, index * 3) }) as HistoryAction));
    expect(full.present).toHaveLength(MAX_STROKES);
    // 제한에 걸린 커밋은 기록도 남기지 않는다 — 되돌리기가 아무 일도 없는 칸을 밟으면 안 된다.
    expect(full.past).toHaveLength(MAX_STROKES);
  });

  it("제한을 넘긴 그림에서도 다시 실행은 막지 않는다", () => {
    // 공유 링크나 예전 드래프트로 들어온 그림. 여기서 다시 실행을 막으면 지우개를 되돌릴 수 없다.
    const many = Array.from({ length: MAX_STROKES + 3 }, (_, index) => strokeAt("s" + index, index * 3, index * 3));
    const loaded = historyReducer(EMPTY_HISTORY, { type: "restore", strokes: many });
    const erased = historyReducer(loaded, { type: "eraseAt", point: { x: 6, y: 6 }, radius: 5 });
    expect(erased.present.length).toBeLessThan(many.length);
    const back = historyReducer(erased, { type: "undo" });
    expect(back.present).toHaveLength(many.length);
    expect(historyReducer(back, { type: "redo" }).present).toEqual(erased.present);
  });

  it(`기록은 ${MAX_HISTORY}칸까지만 쌓인다`, () => {
    // 그리고 지우기를 번갈아 반복한 상황. 획 수 제한과 무관하게 기록만 계속 늘어난다.
    const actions = Array.from({ length: MAX_HISTORY + 20 }, (_, index) =>
      [{ type: "commit", stroke: strokeAt("h" + index, 10, 10) }, { type: "clear" }] as HistoryAction[]).flat();
    const many = run(EMPTY_HISTORY, actions);
    expect(many.past).toHaveLength(MAX_HISTORY);
    // 가장 오래된 칸부터 버린다 — 방금 한 일은 언제나 되돌릴 수 있다.
    expect(historyReducer(many, { type: "undo" }).present.map((stroke) => stroke.id))
      .toEqual(["h" + (MAX_HISTORY + 19)]);
  });
});
