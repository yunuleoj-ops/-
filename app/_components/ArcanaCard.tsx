"use client";

import { useState } from "react";

import { useOverlayShell } from "@/app/_components/useOverlayShell";
import type { CircleAnalysis } from "@/lib/analysis";
import { formatDecomposition, structureTex } from "@/lib/formatting";
import TeX from "@/app/_components/TeX";

export default function ArcanaCard({
  ability, attributeLabel, attributeGlyphs, description,
  analysis, hasFormula, shareState, onShare, onClose, onOpenFormula
}: {
  ability: string;
  attributeLabel: string;
  attributeGlyphs: string;
  description: string;
  analysis: CircleAnalysis;
  hasFormula: boolean;
  shareState: "idle" | "working" | "copied" | "failed";
  onShare: () => void;
  onClose: () => void;
  onOpenFormula: () => void;
}) {
  // 뒤집힘을 classList.toggle 대신 상태로 든다. 뒷면에 버튼이 생겼으므로 "지금 어느 면인가"를
  // 렌더가 알아야 숨은 면의 포커스를 막을 수 있다.
  const [flipped, setFlipped] = useState(false);
  // Escape 닫기 · 닫기 버튼 포커스 · body 스크롤 잠금을 시트와 같은 훅에서 받는다(§4.6).
  const closeRef = useOverlayShell(onClose);
  const metrics = analysis.metrics;

  return <div className="card-overlay" role="dialog" aria-modal="true" aria-labelledby="arcana-card-title" onClick={onClose}>
    <button className="card-close" ref={closeRef} onClick={onClose} aria-label="닫기">✕</button>
    <article className={flipped ? "magic-card flipped" : "magic-card"}
      onClick={(event) => { event.stopPropagation(); setFlipped((current) => !current); }}>
      <div className="card-face card-front">
        <small>ARCANA CARD</small>
        <h2 id="arcana-card-title">{ability}</h2>
        <div className="mini-circle">{attributeGlyphs}</div>
        <p>{attributeLabel} · {metrics.grade}</p>
        <strong>{metrics.power}</strong>
        <span>MAGIC POWER</span>
        <footer>카드를 클릭해 뒷면 보기</footer>
      </div>
      {/* backface-visibility 는 눈에서만 지우고 Tab 순서에서는 지우지 않는다. inert 가 없으면
          앞면을 보는 동안 Tab 이 보이지 않는 「전체 식 보기」로 들어간다. */}
      <div className="card-face card-back" inert={!flipped}>
        <small>ANALYSIS RECORD</small>
        <h2>{ability}</h2>
        <p>{description}</p>
        <dl>
          <div><dt>속성</dt><dd>{attributeLabel}</dd></div>
          <div><dt>구조식</dt><dd><TeX tex={structureTex(analysis)} /></dd></div>
          <div><dt>분해</dt><dd>{formatDecomposition(analysis)}</dd></div>
          <div><dt>복잡도</dt><dd>{metrics.complexity}</dd></div>
          <div><dt>등급</dt><dd>{metrics.grade}</dd></div>
        </dl>
        {/* 자기 도형의 식을 가장 듣고 싶은 순간은 그리는 도중이 아니라 완성 직후다(§4.5).
            stopPropagation 이 없으면 이 클릭이 카드를 도로 뒤집는다. */}
        <button className="card-open-formula" aria-haspopup="dialog" disabled={!hasFormula}
          onClick={(event) => { event.stopPropagation(); onOpenFormula(); }}>전체 식 보기 →</button>
        <footer>클릭해서 앞면으로 돌아가기</footer>
      </div>
    </article>
    <button className="share-circle" onClick={(event) => { event.stopPropagation(); onShare(); }} disabled={shareState === "working"}>
      {shareState === "copied" ? "링크가 복사되었습니다"
        : shareState === "failed" ? "복사에 실패했습니다"
        : shareState === "working" ? "링크 만드는 중…" : "◈ 마법진 공유하기"}
    </button>
  </div>;
}
