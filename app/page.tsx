"use client";

import { CSSProperties, PointerEvent, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { analyzeFitted, fitAll, type CircleAnalysis } from "@/lib/analysis";
import { ATTRIBUTES, ATTRIBUTE_ORDER, gradientFrom, toneOf, type Attribute } from "@/lib/attributes";
import { cardNameOf } from "@/lib/naming";
import { formatAccuracy, formatSummarySentence, structureTex } from "@/lib/formatting";
import { newId, simplify, SIMPLIFY_TOLERANCE, type Stroke, type Symmetry } from "@/lib/geometry";
import { EMPTY_HISTORY, historyReducer } from "@/lib/history";
import { classifyClosure } from "@/lib/resample";
import { encodeShare } from "@/lib/share";
import { hasFormula as canShowFormula } from "@/lib/sheet";
import { loadDraft, saveDraft } from "@/lib/storage";
import ArcanaCard from "@/app/_components/ArcanaCard";
import FormulaSheet from "@/app/_components/FormulaSheet";
import StrokeLayer from "@/app/_components/StrokeLayer";
import { usePulseTurn } from "@/app/_components/usePulseTurn";
import TeX from "@/app/_components/TeX";

export default function Home() {
  const [history, dispatch] = useReducer(historyReducer, EMPTY_HISTORY);
  const { strokes, redoStack } = history;
  const [active, setActive] = useState<Stroke | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [attributes, setAttributes] = useState<Attribute[]>(["light", "fire"]);
  // 사용자가 지은 카드 이름. 비어 있으면 속성이 정해 주는 능력명을 그대로 쓴다.
  const [cardName, setCardName] = useState("");
  const [symmetry, setSymmetry] = useState<Symmetry>("rotate");
  const [rotationCount, setRotationCount] = useState(6);
  const [guides, setGuides] = useState(true);
  const [speed, setSpeed] = useState("normal");
  // 한 바퀴 도는 데 걸리는 시간. 정지는 0이고, 이때 펄스도 함께 멈춘다.
  const cycle = speed === "slow" ? 18 : speed === "fast" ? 4 : speed === "stop" ? 0 : 9;
  const [cardOpen, setCardOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  // 두 오버레이는 상호 배타다. 한쪽을 열면 다른 쪽을 닫는다(§4.3).
  // Task 11 의 카드 뒷면 「전체 식 보기」가 openFormula 를 그대로 호출한다(§4.5).
  const openFormula = () => { setCardOpen(false); setFormulaOpen(true); };
  const openCard = () => { setFormulaOpen(false); setCardOpen(true); };
  const [saved, setSaved] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "working" | "copied" | "failed">("idle");
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);
  // 1단: 변환. 획 배열이 바뀔 때만 돈다. WeakMap 이 이미 적합된 획을 건너뛰므로
  // 커밋당 실비용은 새로 그린 획 1개의 적합이다.
  const spectra = useMemo(() => fitAll(strokes), [strokes]);
  // 2단: 집계. deps가 [strokes, spectra]인데 spectra는 strokes가 바뀔 때만 바뀌므로(바로 위 useMemo),
  // 이 두 번째 경계는 1단이 다시 돌 때마다 함께 다시 돈다 — 독자적으로 재계산을 건너뛰지 않는다.
  // 이 자리의 실제 이득은 전부 위 WeakMap(1단, spectrumCache)에서 나온다. 2단을 따로 떼어 둔 이유는
  // target을 받는 별도 호출(§4.7이 잘라낸 기능)을 언젠가 붙일 수 있게 경계를 열어 두기 위함이고,
  // 항 수 슬라이더는 이 메모를 거치지 않고 FormulaSheet 안에서 truncate로 돈다.
  // 활성 획은 여기 들어오지 않는다 — displayStrokes(렌더용)와 strokes(분석용)를 나눠 두는 진짜 이유가
  // 이 메모 경계다. 그리는 중에 계수가 초당 60회 튀지 않는다.
  const analysis: CircleAnalysis = useMemo(() => analyzeFitted(strokes, spectra), [strokes, spectra]);
  const metrics = analysis.metrics;
  // 유효 획이 0이면(획이 없거나 전부 퇴화) "실패한 0%"가 아니라 "아직 없음"이다 (E4).
  const hasFormula = canShowFormula(analysis);
  const summarySentence = useMemo(() => formatSummarySentence(analysis), [analysis]);
  const structureExpr = useMemo(() => structureTex(analysis), [analysis]);
  const picked = ATTRIBUTE_ORDER.filter((id) => attributes.includes(id));
  const pickedInfos = picked.map((id) => ATTRIBUTES[id]);
  const selectedColors = pickedInfos.map((item) => item.accent);
  const accent = selectedColors[0] ?? ATTRIBUTES.light.accent;
  const accentGradient = gradientFrom(selectedColors);
  const attributeLabel = pickedInfos.map((item) => item.label).join(" · ");
  const attributeGlyphs = pickedInfos.map((item) => item.glyph).join("");
  const description = pickedInfos.map((item) => item.description).join(" ");
  const tone = toneOf(picked);
  const blockerOf = (id: Attribute) => attributes.includes(id) ? undefined : picked.find((chosen) => ATTRIBUTES[chosen].opposite === id);
  const toggleAttribute = (id: Attribute) => setAttributes((current) => {
    if (!current.includes(id)) return current.some((chosen) => ATTRIBUTES[chosen].opposite === id) ? current : [...current, id];
    const next = current.filter((chosen) => chosen !== id);
    return next.length ? next : current;
  });
  const displayStrokes = active ? [...strokes, active] : strokes;
  const pulse = usePulseTurn(strokes.length, cycle);
  // 펄스는 확정된 획에만 붙는다. 그리는 중인 획은 아직 끝점이 없어 "시작에서 끝까지"가 성립하지 않는다.

  // 냉시작 배치 적합만 유휴 시간으로 미룬다. requestIdleCallback 이 없는 브라우저는 setTimeout 으로 떨어진다.
  useEffect(() => {
    // E20: 불러오기가 실패해 빈 배열이 와도 이미 그린 것을 덮어쓰면 안 된다. restore 액션이 빈 배열을
    // 무시하므로(lib/history.ts) 가드가 리듀서 안에 있다. restored.current 만으로는
    // requestIdleCallback 경로에서 첫 갱신이 두 번째 렌더에 와 이 가드를 대신하지 못한다.
    const restore = () => dispatch({ type: "restore", strokes: loadDraft() });
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(restore, { timeout: 200 });
      return () => window.cancelIdleCallback(handle);
    }
    idleTimer.current = setTimeout(restore, 0);
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, []);
  // 첫 커밋에서는 저장하지 않는다. 불러오기 전의 빈 배열이 저장된 그림을 덮어쓰기 때문이다.
  useEffect(() => {
    if (!restored.current) { restored.current = true; return; }
    saveDraft(strokes);
  }, [strokes]);
  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (shareTimer.current) clearTimeout(shareTimer.current);
  }, []);

  const eventPoint = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    // E17: setPointerCapture 때문에 캔버스 밖에서도 좌표가 들어온다. 보이지 않는 곳까지 뻗은 획이
    // 식과 정확도에는 그대로 잡히므로, 화면 밖 여유 10%까지만 남기고 자른다.
    return { x: Math.min(110, Math.max(-10, x)), y: Math.min(110, Math.max(-10, y)) };
  };
  const startStroke = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "eraser") {
      const target = eventPoint(event);
      dispatch({ type: "eraseAt", point: target, radius: 5 });
      return;
    }
    // id는 이벤트 핸들러 안에서만 만든다. 렌더 중에 만들면 서버와 클라이언트가 다른 값을 내 hydration이 깨진다.
    setActive({ id: newId(), points: [eventPoint(event)], symmetry, rotationCount, closure: "open" });
  };
  const addPoint = (event: PointerEvent<SVGSVGElement>) => {
    if (!active || tool === "eraser") return;
    const point = eventPoint(event);
    setActive((current) => current ? { ...current, points: [...current.points, point] } : null);
  };
  const endStroke = () => {
    if (active && active.points.length > 2) {
      const points = simplify(active.points, SIMPLIFY_TOLERANCE);
      // 커밋 시 1회 판정해 동결한다(E7). 매번 다시 재면 임계 근처에서 같은 그림의 식 형태가 흔들린다.
      const closure = classifyClosure(points);
      // E2 입력단: 호길이 1.0 미만은 획이 아니라 탭이다. classifyClosure 가 이미 그 길이를 재고
      // !(L >= POINT_ARC_LENGTH) 일 때 "point" 를 돌려주므로 길이를 두 번 재지 않는다.
      if (closure !== "point") {
        dispatch({ type: "commit", stroke: { ...active, points, closure } });
      }
    }
    setActive(null);
  };
  const undo = () => dispatch({ type: "undo" });
  const redo = () => dispatch({ type: "redo" });
  const saveCard = () => { localStorage.setItem("arcana-card-v1", JSON.stringify({ version: 2, strokes, attributes, name: cardName, metrics, savedAt: new Date().toISOString() })); setSaved(true); };
  // 링크에 마법진이 통째로 들어간다. 네이티브 공유 시트가 있으면 그쪽을, 없으면 클립보드를 쓴다.
  const shareCircle = async () => {
    setShareState("working");
    try {
      const url = `${location.origin}/s/${await encodeShare({ strokes, attributes, name: cardName })}`;
      if (navigator.share) {
        await navigator.share({ title: `마법연산자 · ${title}`, text: `위력 ${metrics.power} · ${metrics.grade}`, url });
        setShareState("idle");
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch (error) {
      // 사용자가 공유 시트를 닫은 것은 실패가 아니다.
      setShareState((error as Error)?.name === "AbortError" ? "idle" : "failed");
    }
    if (shareTimer.current) clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setShareState("idle"), 2200);
  };
  // 카드 이름 하나로 화면·링크·공유 시트가 같은 이름을 부른다.
  const title = cardNameOf(cardName, picked, metrics.rotation);

  return <main className={`arcana ${tone}`} style={{ "--accent": accent, "--accent-gradient": accentGradient, "--speed": `${cycle}s` } as CSSProperties}>
    <header className="site-header"><div className="logo"><span>✦</span> 마법<b>연산자</b></div><div className="student">MAGIC CIRCLE STUDIO <i /> 실시간 분석</div><button className="save-button" onClick={saveCard}>{saved ? "저장됨" : "임시 저장"}</button></header>
    <section className="workspace">
      <section className="stage panel">
        <div className="scan-bar">
          <div className="scan-group attributes">
            <div className="attribute-row">{ATTRIBUTE_ORDER.map((id) => {
            const blocker = blockerOf(id);
            return <button key={id} onClick={() => toggleAttribute(id)} disabled={!!blocker} title={blocker ? `${ATTRIBUTES[blocker].label}과(와) 상극이라 함께 고를 수 없습니다` : ATTRIBUTES[id].description} className={attributes.includes(id) ? "on" : ""} style={{ "--element": ATTRIBUTES[id].accent } as CSSProperties}><span>{ATTRIBUTES[id].glyph}</span>{ATTRIBUTES[id].label}</button>;
            })}</div>
            <div className="ability-card" title={description}><span className="ability-glyphs" aria-hidden="true">{attributeGlyphs}</span><span className="ability-text"><i>{attributeLabel}</i><b>{title}</b></span></div>
          </div>
          <div className="scan-group power" title={`MAGIC POWER ${metrics.power} / 999`}>
            <b>{metrics.power}</b>
            <div className="power-bar"><em style={{ width: `${Math.min(100, metrics.power / 3.2)}%` }} /></div>
            <strong>{metrics.grade}</strong>
          </div>
          <dl className="scan-group stats">
            <div className="stat-terms"><dt>항</dt><dd>{analysis.totalTerms}</dd></div>
            <div><dt>선</dt><dd>{metrics.lines}</dd></div>
            <div><dt>길이</dt><dd>{metrics.length}</dd></div>
            <div><dt>교차</dt><dd>{metrics.intersections}</dd></div>
            <div><dt>닫힘</dt><dd>{metrics.closed}</dd></div>
            <div><dt>좌우</dt><dd>{metrics.horizontal}%</dd></div>
            <div><dt>상하</dt><dd>{metrics.vertical}%</dd></div>
          </dl>
          <button className="finish" disabled={!strokes.length} onClick={openCard}>마법진 완성 <span>→</span></button>
        </div>
        <div className="toolbar">
          <div className="tool-group">
            <button className={tool === "pen" ? "on" : ""} onClick={() => setTool("pen")}>✎ 펜</button>
            <button className={tool === "eraser" ? "on" : ""} onClick={() => setTool("eraser")}>⌫ 지우개</button>
          </div>
          <div className="tool-group">
            <button className="icon" onClick={undo} disabled={!strokes.length} aria-label="되돌리기" title="되돌리기">↶</button>
            <button className="icon" onClick={redo} disabled={!redoStack.length} aria-label="다시 실행" title="다시 실행">↷</button>
            <button onClick={() => { dispatch({ type: "clear" }); setSaved(false); }} disabled={!strokes.length}>전체 지우기</button>
          </div>
          <div className="tool-group">
            {([ ["free", "자유"], ["mirrorX", "좌우"], ["mirrorY", "상하"], ["rotate", "회전"] ] as [Symmetry, string][]).map(([id, label]) => <button key={id} onClick={() => setSymmetry(id)} className={symmetry === id ? "on" : ""}>{label}</button>)}
            <select aria-label="회전 복사 수" value={rotationCount} disabled={symmetry !== "rotate"} onChange={(event) => setRotationCount(Number(event.target.value))}>{[2, 3, 4, 6, 8].map((count) => <option key={count}>{count}</option>)}</select>
            <span>회</span>
          </div>
          <label className="guide-toggle"><input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} /> 보조선</label>
          <label className="speed">애니메이션 <select value={speed} onChange={(event) => setSpeed(event.target.value)}><option value="slow">느림</option><option value="normal">보통</option><option value="fast">빠름</option><option value="stop">정지</option></select></label>
        </div>
        <div className="stage-bar"><span>LIVE CANVAS · AUTOMATIC ANALYSIS</span><span className="drawing-status">{tool === "eraser" ? "ERASER MODE" : "DRAWING MODE"}</span></div>
        <div className="canvas-wrap">
          <div className="particles" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
          <svg className="magic-canvas" viewBox="0 0 100 100" onPointerDown={startStroke} onPointerMove={addPoint} onPointerUp={endStroke} onPointerCancel={endStroke} aria-label="마법진 그리기 캔버스">
            <defs><linearGradient id="arcana-gradient" x1="0" y1="0" x2="1" y2="1">{selectedColors.map((tone, index) => <stop key={`${tone}-${index}`} offset={`${selectedColors.length === 1 ? 0 : (index / (selectedColors.length - 1)) * 100}%`} stopColor={tone} />)}</linearGradient><filter id="magic-glow"><feGaussianBlur stdDeviation="0.65" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
            {guides && <g className="guides"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="31" />{Array.from({ length: 8 }, (_, i) => <line key={i} x1="50" y1="5" x2="50" y2="95" transform={`rotate(${i * 45} 50 50)`} />)}<path d="M50 15L58 41L85 41L63 57L71 85L50 68L29 85L37 57L15 41L42 41Z" /></g>}
            {displayStrokes.map((stroke, index) => <StrokeLayer key={stroke.id} stroke={stroke}
              pulse={pulse.step && index === pulse.index ? { duration: pulse.step, turn: pulse.turn } : null} />)}
            <circle className="core" cx="50" cy="50" r="1.5" />
          </svg>
          <p className="canvas-tip">드래그하여 그리세요 · 대칭 모드에서는 선이 자동 복사됩니다</p>
        </div>
        <div className="stage-footer"><span className="footer-frame">복소 푸리에 · 중심 원점</span><div className="footer-formula"><b className={active ? "pending" : undefined}>{summarySentence}</b>{active && <i>+1 대기</i>}<TeX className="footer-tex" tex={structureExpr} /></div><div className="footer-actions"><button className="open-formula" onClick={openFormula} disabled={!hasFormula} aria-haspopup="dialog" aria-expanded={formulaOpen}>식 보기</button><span className={active ? "footer-accuracy pending" : "footer-accuracy"}>정확도 {formatAccuracy(analysis.accuracy)}</span></div></div>
      </section>

    </section>
    {cardOpen && <ArcanaCard title={title} draftName={cardName} onRename={setCardName}
      attributeLabel={attributeLabel} description={description} cycle={cycle} analysis={analysis} hasFormula={hasFormula}
      action={<button className="share-circle" onClick={shareCircle} disabled={shareState === "working"}>
        {shareState === "copied" ? "링크가 복사되었습니다"
          : shareState === "failed" ? "복사에 실패했습니다"
          : shareState === "working" ? "링크 만드는 중…" : "◈ 마법진 공유하기"}
      </button>}
      onClose={() => setCardOpen(false)} onOpenFormula={openFormula} />}
    {formulaOpen && <FormulaSheet analysis={analysis} onClose={() => setFormulaOpen(false)} />}
  </main>;
}
