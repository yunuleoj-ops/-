"use client";

import { memo, type CSSProperties } from "react";

import { pathFor, STROKE_WIDTH, strokeCopies, type Stroke } from "@/lib/geometry";

export type Pulse = { duration: number } | null;

// 획 하나와 그 대칭 복사본. 그리는 중에 새 객체가 되는 것은 활성 획뿐이라 확정된 획들은 다시 그리지 않는다.
const StrokeLayer = memo(function StrokeLayer({ stroke, pulse }: { stroke: Stroke; pulse?: Pulse }) {
  // 닫힘으로 판정된 획은 화면에서도 실제로 닫는다(스펙 §1.2). 정확도의 진리값이 "화면에 그려진 곡선"이므로
  // 캔버스가 열어 두고 모달만 닫으면 오버레이가 원본과 어긋나 그 자리에서 신뢰가 무너진다.
  const closed = stroke.closure === "closed";
  return <>{strokeCopies(stroke).map((points, copy) => {
    const d = pathFor(points, closed);
    return <g key={`${stroke.id}-${copy}`}>
      <path className="draw-stroke" d={d} style={{ stroke: "url(#arcana-gradient)", strokeWidth: STROKE_WIDTH }} />
      {/* pathLength=100 으로 정규화하면 획 길이와 무관하게 같은 비율의 빛 조각이 같은 속도로 지난다. */}
      {pulse && <path className="stroke-pulse" d={d} pathLength={100}
        style={{ animationDuration: `${pulse.duration}s` } as CSSProperties} />}
    </g>;
  })}</>;
});

export default StrokeLayer;
