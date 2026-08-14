// 그리기 기록. 되돌릴 대상은 "마지막 획"이 아니라 "그림의 상태"다.
//
// 획을 빼고 넣는 방식으로는 지우개(가운데 획이 사라진다)와 전체 지우기를 되돌릴 수 없다.
// 상태를 통째로 스냅샷으로 남기면 어떤 연산이든 같은 방법으로 되돌아간다.
//
// 상태를 한 덩어리로 묶는 이유는 그대로다. past/present/future 를 별개 useState 로 두면
// (1) updater 안에서 다른 setState 를 부르게 되고 StrictMode 가 updater 를 두 번 실행해 같은 획이 두 번 쌓이며,
// (2) 한 렌더 안에서 다시 실행을 연달아 누르면 세 번 다 같은 클로저 값을 읽어 같은 획을 세 번 넣는다.
// 두 증상 모두 "같은 id 를 가진 획이 둘"로 나타나고 렌더가 중복 key 로 깨진다.
// 리듀서는 순수하므로 두 번 실행해도 같은 결과를 내고, 연달아 보낸 액션도 순서대로 적용된다.

import { pointDistance, strokeLength, type Point, type Stroke } from "@/lib/geometry";

// 한 마법진에 담을 수 있는 획의 수. 리듀서가 지키므로 화면 어디에서 그리든 규칙은 하나다.
export const MAX_STROKES = 13;
// 그리고 그 획들이 쓸 수 있는 총 길이 — 잉크 예산이다.
export const MAX_LENGTH = 777;

// 지금까지 쓴 길이. 획은 13개까지라 커밋마다 다시 재도 값싸다.
export const usedLength = (strokes: Stroke[]): number =>
  strokes.reduce((sum, stroke) => sum + strokeLength(stroke.points), 0);
// 되돌리기 깊이. 획 객체는 만들어진 뒤 변하지 않아 스냅샷은 참조 배열이지만, 무한히 쌓을 이유도 없다.
export const MAX_HISTORY = 50;

export type History = { past: Stroke[][]; present: Stroke[]; future: Stroke[][] };

export type HistoryAction =
  | { type: "restore"; strokes: Stroke[] }
  | { type: "commit"; stroke: Stroke }
  | { type: "eraseAt"; point: Point; radius: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" };

export const EMPTY_HISTORY: History = { past: [], present: [], future: [] };

// 상태를 바꾸는 모든 연산이 지나는 한 곳. 새 그림을 past 에 밀어 넣고 future 를 버린다 —
// 되돌린 뒤 다른 길로 가면 되돌렸던 미래는 더 이상 이 그림의 미래가 아니다.
const step = (state: History, present: Stroke[]): History => ({
  past: [...state.past, state.present].slice(-MAX_HISTORY),
  present,
  future: []
});

export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case "restore":
      // 불러오기 이전으로 되돌아갈 자리는 없다. 기록을 새로 시작한다.
      return action.strokes.length ? { past: [], present: action.strokes, future: [] } : state;
    case "commit":
      // 제한을 넘으면 조용히 무시한다. 화면은 "13/13"과 "777/777"로 이미 이유를 말하고 있다.
      // 예산은 "그리기 시작할 수 있는가"만 본다. 이미 그은 획을 길다고 없애면 그건 제한이 아니라 데이터 손실이다.
      return state.present.length >= MAX_STROKES || usedLength(state.present) >= MAX_LENGTH
        ? state
        : step(state, [...state.present, action.stroke]);
    case "eraseAt": {
      const next = state.present.filter((stroke) =>
        !stroke.points.some((point) => pointDistance(point, action.point) < action.radius));
      // 아무것도 지우지 못했으면 상태를 그대로 둔다. 빈 지우개질이 되돌리기 한 칸을 먹지 않는다.
      return next.length === state.present.length ? state : step(state, next);
    }
    case "undo": {
      if (!state.past.length) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [...state.future, state.present]
      };
    }
    case "redo": {
      if (!state.future.length) return state;
      // 제한을 검사하지 않는다. 다시 실행은 이미 존재했던 상태로 돌아가는 것이라,
      // 여기서 막으면 13획을 넘긴 그림에서 지우개를 되돌릴 수 없다.
      return {
        past: [...state.past, state.present].slice(-MAX_HISTORY),
        present: state.future[state.future.length - 1],
        future: state.future.slice(0, -1)
      };
    }
    case "clear":
      return state.present.length ? step(state, []) : state;
  }
}
