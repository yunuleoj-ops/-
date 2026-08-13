"use client";

import { useState, type ReactNode } from "react";

import { useOverlayShell } from "@/app/_components/useOverlayShell";
import type { CircleAnalysis } from "@/lib/analysis";
import { formatDecomposition, structureTex } from "@/lib/formatting";
import { STROKE_WIDTH } from "@/lib/geometry";
import { MAX_NAME_LENGTH } from "@/lib/naming";
import { originalPaths } from "@/lib/sheet";
import { usePulseTurn } from "@/app/_components/usePulseTurn";
import TeX from "@/app/_components/TeX";

export default function ArcanaCard({
  title, draftName, onRename, attributeLabel, description,
  analysis, hasFormula, action, onClose, onOpenFormula
}: {
  // 화면에 찍히는 이름. 사용자가 지은 이름이 없으면 속성이 정해 준 능력명이다(lib/naming.cardNameOf).
  title: string;
  // 입력창에 그대로 들어가는 원문. 자동 이름은 placeholder 로만 비친다.
  draftName?: string;
  // 없으면 읽기 전용이다 — 공유 링크로 들어온 사람이 남의 카드 이름을 고칠 수는 없다.
  onRename?: (value: string) => void;
  attributeLabel: string;
  description: string;
  analysis: CircleAnalysis;
  hasFormula: boolean;
  // 카드 아래 한 자리. 그린 사람에게는 「공유하기」, 받은 사람에게는 「나도 마법진 그리기」다.
  action: ReactNode;
  // 없으면 닫지 않는 카드다(공유 화면). 뒤에 돌아갈 화면이 없을 때 ✕ 는 막다른 길이다.
  onClose?: () => void;
  onOpenFormula: () => void;
}) {
  // 뒤집힘을 classList.toggle 대신 상태로 든다. 뒷면에 버튼이 생겼으므로 "지금 어느 면인가"를
  // 렌더가 알아야 숨은 면의 포커스를 막을 수 있다.
  const [flipped, setFlipped] = useState(false);
  // Escape 닫기 · 닫기 버튼 포커스 · body 스크롤 잠금을 시트와 같은 훅에서 받는다(§4.6).
  const closeRef = useOverlayShell(onClose);
  const metrics = analysis.metrics;
  const paths = originalPaths(analysis);
  // 캔버스와 같은 규칙으로 한 획씩 차례로 빛난다.
  const pulse = usePulseTurn(analysis.strokes.length);

  return <div className="card-overlay card-stage" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    {onClose && <button className="card-close" ref={closeRef} onClick={onClose} aria-label="닫기">✕</button>}
    <article className={flipped ? "magic-card flipped" : "magic-card"}
      onClick={(event) => { event.stopPropagation(); setFlipped((current) => !current); }}>
      <div className="card-face card-front">
        <small>ARCANA CARD</small>
        {/* 이름은 카드의 얼굴이라 앞면에서 바로 고친다. stopPropagation 이 없으면 글자를 찍는 클릭마다 카드가 뒤집힌다. */}
        {onRename
          ? <input className="card-name" value={draftName ?? ""} placeholder={title} maxLength={MAX_NAME_LENGTH}
              aria-label="카드 이름" title="카드 이름을 직접 지을 수 있습니다"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onRename(event.target.value)} />
          : <h2>{title}</h2>}
        <div className="mini-circle">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            {paths.map((path) => <path key={path.key} className="card-path" d={path.d} style={{ strokeWidth: STROKE_WIDTH }} />)}
            {pulse.step > 0 && paths.filter((path) => path.strokeIndex === pulse.index).map((path) =>
              <path key={`pulse-${path.key}-${pulse.turn}`} className="stroke-pulse" d={path.d} pathLength={100}
                style={{ animationDuration: `${pulse.step}s` }} />)}
          </svg>
        </div>
        <p>{attributeLabel} · {metrics.grade}</p>
        <strong>{metrics.power}</strong>
        <span>MAGIC POWER</span>
        {/* 점선만으로는 이름을 고칠 수 있다는 걸 아무도 모른다. 고칠 수 있을 때만 한마디 붙인다. */}
        <footer>{onRename ? "이름을 눌러 바꾸기 · 카드를 클릭해 뒷면 보기" : "카드를 클릭해 뒷면 보기"}</footer>
      </div>
      {/* backface-visibility 는 눈에서만 지우고 Tab 순서에서는 지우지 않는다. inert 가 없으면
          앞면을 보는 동안 Tab 이 보이지 않는 「전체 식 보기」로 들어간다. */}
      <div className="card-face card-back" inert={!flipped}>
        <small>ANALYSIS RECORD</small>
        <h2>{title}</h2>
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
    {/* 오버레이 클릭이 곧 닫기이므로, 아래 버튼의 클릭이 거기까지 올라가면 누르는 순간 카드가 사라진다. */}
    <div className="card-action" onClick={(event) => event.stopPropagation()}>{action}</div>
  </div>;
}
