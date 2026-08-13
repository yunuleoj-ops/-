"use client";

import { useEffect, useRef, type RefObject } from "react";

// 모듈 스코프 카운터로 잠근다. .magic-card 와 .formula-sheet 는 상호 배타지만
// 닫힘/열림이 한 커밋 안에서 겹치면 저장/복원 순서가 뒤집혀 스크롤이 영구 잠긴다(§4.6).
// Task 11 이 .card-overlay 를 이 훅으로 옮기면 그 경로가 실제로 생긴다.
let locks = 0;

// onClose 가 없는 오버레이도 있다 — 공유 화면의 카드는 뒤에 돌아갈 화면이 없어 닫지 않는다.
// 그때는 Escape 도 닫기 버튼도 없고, 스크롤 잠금만 남는다.
export function useOverlayShell(onClose?: () => void): RefObject<HTMLButtonElement | null> {
  const focusRef = useRef<HTMLButtonElement>(null);
  const latest = useRef(onClose);
  useEffect(() => { latest.current = onClose; }, [onClose]);
  // 의존성이 비어 있어야 한다. onClose 를 넣으면 부모가 렌더될 때마다 포커스를 다시 뺏는다.
  useEffect(() => {
    focusRef.current?.focus();
    if (locks === 0) document.body.style.overflow = "hidden";
    locks += 1;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") latest.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      locks -= 1;
      if (locks === 0) document.body.style.overflow = "";
    };
  }, []);
  return focusRef;
}
