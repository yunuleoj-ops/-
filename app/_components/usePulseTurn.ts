"use client";

import { useEffect, useState } from "react";

// 파동이 마법진을 한 바퀴 도는 데 걸리는 시간(초). 캔버스·완성 카드·공유 화면이 이 값 하나를 본다 —
// 술식을 보여 주는 곳마다 속도가 다르면 같은 마법진이 화면마다 다른 물건으로 보인다.
export const PULSE_CYCLE = 4;

// 획 하나가 다 빛나면 다음 획으로 차례를 넘긴다.
// CSS animation-delay 로는 안 된다 — delay 는 첫 반복에만 걸리므로 infinite 로 돌리면
// 두 번째 사이클부터 각 획이 제 주기로 겹쳐 결국 전부 동시에 빛난다. 차례는 여기서 센다.
export function usePulseTurn(count: number) {
  // 획이 많아도 눈에 보이도록 한 획당 최소 시간을 보장한다. 그만큼 한 바퀴는 길어진다.
  const step = count > 0 ? Math.max(0.8, PULSE_CYCLE / count) : 0;
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
