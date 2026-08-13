// 그리기 기록. strokes 와 redoStack 은 언제나 함께 움직이므로 한 상태로 묶는다.
//
// 둘을 별개 useState 로 두면 두 가지가 깨진다.
// (1) updater 안에서 다른 setState 를 부르게 되는데, StrictMode 는 updater 를 두 번 실행하므로
//     되돌리기 한 번에 같은 획이 스택에 두 번 쌓인다.
// (2) 한 렌더 안에서 다시 실행을 연달아 누르면 세 번 다 같은 클로저 값을 읽어 같은 획을 세 번 넣는다.
// 두 증상 모두 "같은 id 를 가진 획이 둘"로 나타나고, 렌더가 중복 key 로 깨진다.
// 리듀서는 순수하므로 두 번 실행해도 같은 결과를 내고, 연달아 보낸 액션도 순서대로 적용된다.

import { pointDistance, type Point, type Stroke } from "@/lib/geometry";

export type History = { strokes: Stroke[]; redoStack: Stroke[] };

export type HistoryAction =
  | { type: "restore"; strokes: Stroke[] }
  | { type: "commit"; stroke: Stroke }
  | { type: "eraseAt"; point: Point; radius: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" };

export const EMPTY_HISTORY: History = { strokes: [], redoStack: [] };

export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case "restore":
      return action.strokes.length ? { strokes: action.strokes, redoStack: [] } : state;
    case "commit":
      return { strokes: [...state.strokes, action.stroke], redoStack: [] };
    case "eraseAt": {
      const next = state.strokes.filter((stroke) =>
        !stroke.points.some((point) => pointDistance(point, action.point) < action.radius));
      // 아무것도 지우지 못했으면 상태를 그대로 둔다. 빈 지우개질이 다시 실행 스택을 날리지 않는다.
      return next.length === state.strokes.length ? state : { strokes: next, redoStack: [] };
    }
    case "undo": {
      if (!state.strokes.length) return state;
      const item = state.strokes[state.strokes.length - 1];
      return { strokes: state.strokes.slice(0, -1), redoStack: [...state.redoStack, item] };
    }
    case "redo": {
      if (!state.redoStack.length) return state;
      const item = state.redoStack[state.redoStack.length - 1];
      return { strokes: [...state.strokes, item], redoStack: state.redoStack.slice(0, -1) };
    }
    case "clear":
      return state.strokes.length || state.redoStack.length ? EMPTY_HISTORY : state;
  }
}
