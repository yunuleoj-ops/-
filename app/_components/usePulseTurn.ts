"use client";

import { useEffect, useState } from "react";

// 획 하나가 다 빛나면 다음 획으로 차례를 넘긴다.
// CSS animation-delay 로는 안 된다 — delay 는 첫 반복에만 걸리므로 infinite 로 돌리면
// 두 번째 사이클부터 각 획이 제 주기로 겹쳐 결국 전부 동시에 빛난다. 차례는 여기서 센다.
export function usePulseTurn(count: number, cycle: number) {
  // 획이 많아도 눈에 보이도록 한 획당 최소 시간을 보장한다. 그만큼 한 바퀴는 길어진다.
  const step = cycle > 0 && count > 0 ? Math.max(0.8, cycle / count) : 0;
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    if (!step) return;
    setTurn(0);
    const timer = setInterval(() => setTurn((current) => current + 1), step * 1000);
    return () => clearInterval(timer);
  }, [step, count]);

  // turn 은 계속 증가한다. 획이 하나뿐이어도 key 가 바뀌어 애니메이션이 다시 돈다.
  return { step, turn, index: count > 0 ? turn % count : 0 };
}
