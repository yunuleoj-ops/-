"use client";

import { useMemo, useRef, useState } from "react";

import { useOverlayShell } from "@/app/_components/useOverlayShell";
import type { CircleAnalysis } from "@/lib/analysis";
import { formatAccuracy, formatLatex, strokeExprTex } from "@/lib/formatting";
import CopyButtons from "@/app/_components/CopyButtons";
import TeX from "@/app/_components/TeX";
import { STROKE_WIDTH } from "@/lib/geometry";
import {
  accuracyOf, achievedTarget, baseRows, coefficientRows, FRAME_LINE, isCapped, legendTexLines, maxTermCount, operatorLabel,
  originalPaths, reachedTarget, reconstructedPaths, sheetPlainText, strokeNumber, termCountOf, termsAtCap
} from "@/lib/sheet";

export default function FormulaSheet({ analysis, onClose }: { analysis: CircleAnalysis; onClose: () => void }) {
  const maxTerms = maxTermCount(analysis);
  // 시트는 열릴 때만 마운트되므로 초기값이 곧 "자동 결정된 항 수"다. 동기화 effect가 필요 없다.
  const [cap, setCap] = useState(Math.max(1, maxTerms));
  const [focus, setFocus] = useState<number | null>(null);
  const closeRef = useOverlayShell(onClose);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  const originals = useMemo(() => originalPaths(analysis), [analysis]);
  // 슬라이더를 움직여도 변환은 다시 돌지 않는다. truncate + reconstruct 만 재실행된다(§5.3).
  const reconstructed = useMemo(() => reconstructedPaths(analysis, cap), [analysis, cap]);
  const legend = useMemo(() => legendTexLines(analysis), [analysis]);
  // 판정은 lib/sheet.achievedTarget 하나뿐이다(I3) — TARGET_ACCURACY를 여기서 다시 선언하면
  // 적합기가 목표를 옮길 때 이 배지만 조용히 어긋난다. accuracy 는 number | null 이고
  // null(유효 획 0)은 달성이 아니라 "없음"이다(E4) — achievedTarget이 그 구분을 대신 짊어진다.
  const achieved = achievedTarget(analysis);
  const worst = analysis.worst;

  const jumpTo = (index: number) => {
    setFocus(index);
    itemRefs.current[index]?.scrollIntoView({ block: "center", behavior: "smooth" });
  };


  // sheet-close는 .formula-sheet(스크롤되는 컨테이너) 밖, .card-overlay(고정) 안에 둔다 — ArcanaCard의
  // .card-close와 같은 패턴이다(#14). 스크롤 컨테이너 안에 absolute로 두면 시트를 내릴 때 버튼이 같이
  // 스크롤되어 화면 밖으로 사라진다. sticky는 레이아웃이 깨져 이미 시도했다가 되돌렸다.
  return <div className="card-overlay" onClick={onClose}>
    <button className="sheet-close" ref={closeRef} onClick={onClose} aria-label="닫기">✕</button>
    <section className="formula-sheet" role="dialog" aria-modal="true" aria-labelledby="formula-sheet-title" onClick={(event) => event.stopPropagation()}>
      <header className="sheet-head">
        <small>FOURIER DECOMPOSITION</small>
        <h2 id="formula-sheet-title">마법진의 식</h2>
        <p className="sheet-headline">
          <b>{analysis.totalTerms}</b>항으로 재현
          <span className={achieved ? "sheet-badge" : "sheet-badge miss"}>{formatAccuracy(analysis.accuracy)}{achieved ? " ✓" : ""}</span>
        </p>
        {worst && <button className="sheet-worst" onClick={() => jumpTo(worst.index)}>최저 획 {strokeNumber(worst.index)} · {formatAccuracy(worst.accuracy)}</button>}
      </header>

      <figure className="sheet-overlay">
        <svg viewBox="0 0 100 100" aria-label="원본 획 위에 재구성 곡선을 겹쳐 그린 그림">
          {originals.map((path) => <path key={`o-${path.key}`} className="sheet-original" d={path.d} style={{ strokeWidth: STROKE_WIDTH }} />)}
          {reconstructed.map((path) => <path key={`r-${path.key}`} className="sheet-recon" d={path.d} style={{ strokeWidth: STROKE_WIDTH }} />)}
        </svg>
        <figcaption>원본 획 위에 식이 그린 곡선을 겹쳤습니다</figcaption>
      </figure>

      {maxTerms > 0
        ? <div className="sheet-slider">
            <label htmlFor="sheet-terms">항 수</label>
            <span>1</span>
            <input id="sheet-terms" type="range" min={1} max={maxTerms} step={1} value={cap} onChange={(event) => setCap(Number(event.target.value))} />
            <span>{maxTerms}</span>
            <b>획당 최대 {cap}항 · 합계 {termsAtCap(analysis, cap)}항</b>
          </div>
        : <p className="sheet-slider empty">직선만으로 이루어진 마법진이라 항이 필요 없습니다</p>}

      <div className="sheet-legend"><span className="legend-frame">{FRAME_LINE}</span>{legend.map((line) => <TeX key={line} tex={line} />)}</div>

      <div className="sheet-body">
        <div className="sheet-map">
          <svg viewBox="0 0 100 100" className={focus === null ? undefined : "focused"} aria-hidden="true">
            {originals.map((path) => <path key={path.key} className={focus === path.strokeIndex ? "map-path on" : "map-path"} d={path.d} style={{ strokeWidth: STROKE_WIDTH }} />)}
          </svg>
        </div>
        <ol className="sheet-list">
          {analysis.strokes.map((item, index) => {
            const rows = coefficientRows(item.spectrum);
            const value = accuracyOf(item);
            const reached = reachedTarget(item);
            return <li key={item.stroke.id} ref={(node) => { itemRefs.current[index] = node; }}
              className={focus === index ? "sheet-item on" : "sheet-item"} tabIndex={0}
              onMouseEnter={() => setFocus(index)} onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(index)} onBlur={() => setFocus(null)}
              onClick={() => setFocus((current) => current === index ? null : index)}>
              <p className="sheet-item-head">
                획 {strokeNumber(index)}
                <i>{operatorLabel(item.operator)}</i>
                <i>{termCountOf(item.spectrum)}항</i>
                <em className={reached ? undefined : "miss"}>{formatAccuracy(value)}{reached ? " ✓" : ""}</em>
              </p>
              <TeX className="sheet-expr" tex={strokeExprTex(item, index)} />
              {isCapped(item) && <p className="sheet-note">이 획은 너무 복잡해서 여기까지 적었습니다</p>}
              {rows.length > 0 && <details className="sheet-coef">
                <summary onClick={(event) => event.stopPropagation()}>계수 {rows.length}개 보기 <i>고급</i></summary>
                <table className="sheet-table">
                  <thead><tr><th scope="col">n</th><th scope="col">|c_n|</th><th scope="col">arg c_n</th><th scope="col" /></tr></thead>
                  <tbody>
                    {baseRows(item.spectrum).map((row) => <tr key={row.label} className="base">
                      <th scope="row">{row.label}</th><td>{row.magnitude.toFixed(2)}</td><td>{row.phase.toFixed(2)}</td><td />
                    </tr>)}
                    {rows.map((row) => <tr key={row.n}>
                      <th scope="row">{row.n}</th><td>{row.magnitude.toFixed(2)}</td><td>{row.phase.toFixed(2)}</td>
                      <td><i style={{ width: `${Math.round(row.ratio * 100)}%` }} /></td>
                    </tr>)}
                  </tbody>
                </table>
              </details>}
            </li>;
          })}
        </ol>
      </div>

      {analysis.silhouette && <p className="sheet-silhouette"><span>외곽 실루엣 (참고)</span><code>{analysis.silhouette}</code></p>}

      <footer className="sheet-actions">
        <CopyButtons className="sheet-copy-group" plain={sheetPlainText(analysis)} latex={formatLatex(analysis)} />
      </footer>
    </section>
  </div>;
}
