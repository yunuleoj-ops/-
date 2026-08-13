// 이 파일이 지키는 것은 하나다: 어떤 순서로 되돌리기·다시 실행을 눌러도 같은 id 를 가진 획이 둘이 되지 않는다.
// 그 증상이 화면에서는 "Encountered two children with the same key" 로 나타나고 획이 사라지거나 겹친다.
import { describe, expect, it } from "vitest";

import { EMPTY_HISTORY, historyReducer, type History, type HistoryAction } from "@/lib/history";
import type { Point, Stroke } from "@/lib/geometry";

const strokeAt = (id: string, x: number, y: number): Stroke =>
  ({ id, points: [{ x, y }, { x: x + 5, y: y + 5 }], symmetry: "free", rotationCount: 6, closure: "open" });

const run = (start: History, actions: HistoryAction[]) => actions.reduce(historyReducer, start);
const idsOf = (state: History) => state.strokes.map((stroke) => stroke.id);
const hasDuplicate = (state: History) => new Set(idsOf(state)).size !== state.strokes.length;

const THREE = run(EMPTY_HISTORY, [
  { type: "commit", stroke: strokeAt("a", 10, 10) },
  { type: "commit", stroke: strokeAt("b", 30, 30) },
  { type: "commit", stroke: strokeAt("c", 50, 50) }
]);

describe("historyReducer", () => {
  it("커밋은 획을 쌓고 다시 실행 스택을 비운다", () => {
    expect(idsOf(THREE)).toEqual(["a", "b", "c"]);
    expect(THREE.redoStack).toEqual([]);
  });

  it("되돌리기는 마지막 획을 다시 실행 스택으로 옮긴다", () => {
    const state = historyReducer(THREE, { type: "undo" });
    expect(idsOf(state)).toEqual(["a", "b"]);
    expect(state.redoStack.map((stroke) => stroke.id)).toEqual(["c"]);
  });

  it("되돌리기와 다시 실행을 전부 거치면 원래 순서로 돌아온다", () => {
    const state = run(THREE, [{ type: "undo" }, { type: "undo" }, { type: "undo" }, { type: "redo" }, { type: "redo" }, { type: "redo" }]);
    expect(idsOf(state)).toEqual(["a", "b", "c"]);
    expect(state.redoStack).toEqual([]);
    expect(hasDuplicate(state)).toBe(false);
  });

  it("다시 실행을 연달아 보내도 같은 획이 중복되지 않는다", () => {
    // 한 렌더 안에서 버튼을 세 번 누른 상황. 별개 useState 였을 때 여기서 같은 획이 세 번 들어갔다.
    const undone = run(THREE, [{ type: "undo" }, { type: "undo" }, { type: "undo" }]);
    const state = run(undone, [{ type: "redo" }, { type: "redo" }, { type: "redo" }]);
    expect(state.strokes).toHaveLength(3);
    expect(hasDuplicate(state)).toBe(false);
  });

  it("빈 스택에 되돌리기·다시 실행을 보내면 상태가 그대로다", () => {
    expect(historyReducer(EMPTY_HISTORY, { type: "undo" })).toBe(EMPTY_HISTORY);
    expect(historyReducer(EMPTY_HISTORY, { type: "redo" })).toBe(EMPTY_HISTORY);
    expect(historyReducer(THREE, { type: "redo" })).toBe(THREE);
  });

  it("리듀서는 순수하다 — 같은 액션을 두 번 접어도 결과가 같다", () => {
    // StrictMode 는 개발 중 리듀서를 두 번 실행한다. 그때 결과가 달라지면 안 된다.
    const once = historyReducer(THREE, { type: "undo" });
    const twice = historyReducer(THREE, { type: "undo" });
    expect(idsOf(once)).toEqual(idsOf(twice));
    expect(once.redoStack.map((stroke) => stroke.id)).toEqual(twice.redoStack.map((stroke) => stroke.id));
    expect(idsOf(THREE)).toEqual(["a", "b", "c"]);
  });

  it("새 획을 커밋하면 되돌린 획들은 버려진다", () => {
    const state = run(THREE, [{ type: "undo" }, { type: "commit", stroke: strokeAt("d", 70, 70) }]);
    expect(idsOf(state)).toEqual(["a", "b", "d"]);
    expect(state.redoStack).toEqual([]);
  });

  it("지우개는 닿은 획만 지우고 다시 실행 스택을 비운다", () => {
    const target: Point = { x: 31, y: 31 };
    const state = historyReducer(run(THREE, [{ type: "undo" }]), { type: "eraseAt", point: target, radius: 5 });
    expect(idsOf(state)).toEqual(["a"]);
    expect(state.redoStack).toEqual([]);
  });

  it("아무것도 지우지 못한 지우개질은 상태를 건드리지 않는다", () => {
    const undone = run(THREE, [{ type: "undo" }]);
    const state = historyReducer(undone, { type: "eraseAt", point: { x: 95, y: 95 }, radius: 5 });
    expect(state).toBe(undone);
    expect(state.redoStack.map((stroke) => stroke.id)).toEqual(["c"]);
  });

  it("빈 배열 복원은 기존 그림을 덮어쓰지 않는다", () => {
    // E20: 불러오기가 실패해 빈 배열이 와도 이미 그린 것을 지우면 안 된다.
    expect(historyReducer(THREE, { type: "restore", strokes: [] })).toBe(THREE);
  });

  it("전체 지우기는 양쪽 스택을 모두 비운다", () => {
    const state = historyReducer(run(THREE, [{ type: "undo" }]), { type: "clear" });
    expect(state.strokes).toEqual([]);
    expect(state.redoStack).toEqual([]);
  });
});
