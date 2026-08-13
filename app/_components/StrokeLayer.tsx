"use client";

import { memo } from "react";

import { pathFor, STROKE_WIDTH, strokeCopies, type Stroke } from "@/lib/geometry";

// 획 하나와 그 대칭 복사본. 그리는 중에 새 객체가 되는 것은 활성 획뿐이라 확정된 획들은 다시 그리지 않는다.
const StrokeLayer = memo(function StrokeLayer({ stroke }: { stroke: Stroke }) {
  // 닫힘으로 판정된 획은 화면에서도 실제로 닫는다(스펙 §1.2). 정확도의 진리값이 "화면에 그려진 곡선"이므로
  // 캔버스가 열어 두고 모달만 닫으면 오버레이가 원본과 어긋나 그 자리에서 신뢰가 무너진다.
  const closed = stroke.closure === "closed";
  return <>{strokeCopies(stroke).map((points, copy) => (
    <path key={`${stroke.id}-${copy}`} className="draw-stroke" d={pathFor(points, closed)}
      style={{ stroke: "url(#arcana-gradient)", strokeWidth: STROKE_WIDTH }} />
  ))}</>;
});

export default StrokeLayer;
