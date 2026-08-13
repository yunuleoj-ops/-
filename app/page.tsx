"use client";

import { CSSProperties, PointerEvent, useEffect, useMemo, useRef, useState } from "react";

import { analyzeFitted, fitAll, type CircleAnalysis } from "@/lib/analysis";
import { abilityOf, ATTRIBUTES, ATTRIBUTE_ORDER, gradientFrom, toneOf, type Attribute } from "@/lib/attributes";
import { newId, pointDistance, simplify, SIMPLIFY_TOLERANCE, type Stroke, type Symmetry } from "@/lib/geometry";
import { classifyClosure } from "@/lib/resample";
import { encodeShare } from "@/lib/share";
import { loadDraft, saveDraft } from "@/lib/storage";
import StrokeLayer from "@/app/_components/StrokeLayer";

export default function Home() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [active, setActive] = useState<Stroke | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [attributes, setAttributes] = useState<Attribute[]>(["light", "fire"]);
  const [symmetry, setSymmetry] = useState<Symmetry>("rotate");
  const [rotationCount, setRotationCount] = useState(6);
  const [guides, setGuides] = useState(true);
  const [speed, setSpeed] = useState("normal");
  const [cardOpen, setCardOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "working" | "copied" | "failed">("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);
  // 1단: 변환. 획 배열이 바뀔 때만 돈다. WeakMap 이 이미 적합된 획을 건너뛰므로
  // 커밋당 실비용은 새로 그린 획 1개의 적합이다.
  const spectra = useMemo(() => fitAll(strokes), [strokes]);
  // 2단: 집계. 활성 획은 여기 들어오지 않는다 — displayStrokes(렌더용)와 strokes(분석용)를
  // 나눠 두는 진짜 이유가 이 메모 경계다. 그리는 중에 계수가 초당 60회 튀지 않는다.
  const analysis: CircleAnalysis = useMemo(() => analyzeFitted(strokes, spectra), [strokes, spectra]);
  const metrics = analysis.metrics;
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

  // 냉시작 배치 적합만 유휴 시간으로 미룬다. requestIdleCallback 이 없는 브라우저는 setTimeout 으로 떨어진다.
  useEffect(() => {
    // if (draft.length) 가드는 E20 이다. 로드가 실패해 빈 배열이 와도 setStrokes 를 부르지 않으므로
    // 저장 effect 가 돌아 원본을 덮어쓰는 경로가 생기지 않는다. restored.current 만으로는
    // requestIdleCallback 경로에서 첫 setStrokes 가 두 번째 렌더에 오므로 이 가드를 대신하지 못한다.
    const restore = () => { const draft = loadDraft(); if (draft.length) setStrokes(draft); };
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
    if (copyTimer.current) clearTimeout(copyTimer.current);
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
      setStrokes((current) => {
        const next = current.filter((stroke) => !stroke.points.some((point) => pointDistance(point, target) < 5));
        setRedoStack([]); return next;
      });
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
        setStrokes((current) => [...current, { ...active, points, closure }]);
        setRedoStack([]);
      }
    }
    setActive(null);
  };
  const undo = () => setStrokes((current) => { if (!current.length) return current; const item = current[current.length - 1]; setRedoStack((redo) => [...redo, item]); return current.slice(0, -1); });
  const redo = () => setRedoStack((current) => { if (!current.length) return current; const item = current[current.length - 1]; setStrokes((drawn) => [...drawn, item]); return current.slice(0, -1); });
  const copyFormula = async () => {
    try { await navigator.clipboard.writeText(metrics.formula); } catch { return; }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  };
  const saveCard = () => { localStorage.setItem("arcana-card-v1", JSON.stringify({ version: 2, strokes, attributes, metrics, savedAt: new Date().toISOString() })); setSaved(true); };
  // 링크에 마법진이 통째로 들어간다. 네이티브 공유 시트가 있으면 그쪽을, 없으면 클립보드를 쓴다.
  const shareCircle = async () => {
    setShareState("working");
    try {
      const url = `${location.origin}/s/${await encodeShare({ strokes, attributes })}`;
      if (navigator.share) {
        await navigator.share({ title: `마법연산자 · ${ability}`, text: `위력 ${metrics.power} · ${metrics.grade}`, url });
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
  const ability = abilityOf(picked, metrics.rotation);

  return <main className={`arcana ${tone}`} style={{ "--accent": accent, "--accent-gradient": accentGradient, "--speed": speed === "slow" ? "18s" : speed === "fast" ? "4s" : speed === "stop" ? "0s" : "9s" } as CSSProperties}>
    <header className="site-header"><div className="logo"><span>✦</span> 마법<b>연산자</b></div><div className="student">MAGIC CIRCLE STUDIO <i /> 실시간 분석</div><button className="save-button" onClick={saveCard}>{saved ? "저장됨" : "임시 저장"}</button></header>
    <section className="workspace">
      <aside className="tools panel">
        <div className="panel-title">DRAW TOOLS <span>01</span></div>
        <div className="tool-row"><button className={tool === "pen" ? "on" : ""} onClick={() => setTool("pen")}>✎ 펜</button><button className={tool === "eraser" ? "on" : ""} onClick={() => setTool("eraser")}>⌫ 지우개</button></div>
        <div className="tool-row"><button onClick={undo} disabled={!strokes.length}>↶ 실행 취소</button><button onClick={redo} disabled={!redoStack.length}>↷ 다시 실행</button></div>
        <button className="wipe" onClick={() => { setStrokes([]); setRedoStack([]); setSaved(false); }}>전체 지우기</button>
        <div className="panel-title split">SYMMETRY <span>02</span></div>
        <div className="symmetry-modes">
          {([ ["free", "자유"], ["mirrorX", "좌우"], ["mirrorY", "상하"], ["rotate", "회전"] ] as [Symmetry, string][]).map(([id, label]) => <button key={id} onClick={() => setSymmetry(id)} className={symmetry === id ? "on" : ""}>{label}</button>)}
        </div>
        <div className="rotation"><span>회전 복사</span><select value={rotationCount} disabled={symmetry !== "rotate"} onChange={(event) => setRotationCount(Number(event.target.value))}>{[2, 3, 4, 6, 8].map((count) => <option key={count}>{count}</option>)}</select><span>회</span></div>
        <label className="guide-toggle"><input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} /> 보조선 표시</label>
      </aside>

      <section className="stage panel">
        <div className="stage-bar"><span>LIVE CANVAS · AUTOMATIC ANALYSIS</span><span className="drawing-status">{tool === "eraser" ? "ERASER MODE" : "DRAWING MODE"}</span></div>
        <div className="canvas-wrap">
          <div className="particles" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
          <svg className="magic-canvas" viewBox="0 0 100 100" onPointerDown={startStroke} onPointerMove={addPoint} onPointerUp={endStroke} onPointerCancel={endStroke} aria-label="마법진 그리기 캔버스">
            <defs><linearGradient id="arcana-gradient" x1="0" y1="0" x2="1" y2="1">{selectedColors.map((tone, index) => <stop key={`${tone}-${index}`} offset={`${selectedColors.length === 1 ? 0 : (index / (selectedColors.length - 1)) * 100}%`} stopColor={tone} />)}</linearGradient><filter id="magic-glow"><feGaussianBlur stdDeviation="0.65" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
            {guides && <g className="guides"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="31" />{Array.from({ length: 8 }, (_, i) => <line key={i} x1="50" y1="5" x2="50" y2="95" transform={`rotate(${i * 45} 50 50)`} />)}<path d="M50 15L58 41L85 41L63 57L71 85L50 68L29 85L37 57L15 41L42 41Z" /></g>}
            {displayStrokes.map((stroke) => <StrokeLayer key={stroke.id} stroke={stroke} />)}
            <circle className="core" cx="50" cy="50" r="1.5" />
          </svg>
          <p className="canvas-tip">드래그하여 그리세요 · 대칭 모드에서는 선이 자동 복사됩니다</p>
        </div>
        <div className="stage-footer"><span>극좌표식 · 원점 (0,0)</span><code>{metrics.formula}</code><button className="copy-formula" onClick={copyFormula} disabled={!strokes.length}>{copied ? "복사됨" : "복사"}</button><span>정확도 {metrics.accuracy}%</span></div>
      </section>

      <aside className="analysis panel">
        <div className="panel-title">ARCANA SCAN <span>03</span></div>
        <div className="element-title">ATTRIBUTE AFFINITY <span>상극은 함께 고를 수 없습니다</span></div>
        <div className="element-switch">{ATTRIBUTE_ORDER.map((id) => {
          const blocker = blockerOf(id);
          return <button key={id} onClick={() => toggleAttribute(id)} disabled={!!blocker} title={blocker ? `${ATTRIBUTES[blocker].label}과(와) 상극` : undefined} className={attributes.includes(id) ? "on" : ""} style={{ "--element": ATTRIBUTES[id].accent } as CSSProperties}><span>{ATTRIBUTES[id].glyph}</span>{ATTRIBUTES[id].label}<i>{blocker ? `${ATTRIBUTES[blocker].label} 상극` : ""}</i></button>;
        })}</div>
        <div className="power"><span>MAGIC POWER</span><b>{metrics.power}</b><i> / 999</i><div><em style={{ width: `${Math.min(100, metrics.power / 3.2)}%` }} /></div><strong>{metrics.grade}</strong></div>
        <div className="stat-grid"><div><span>선의 개수</span><b>{metrics.lines}</b></div><div><span>선의 길이</span><b>{metrics.length}</b></div><div><span>교차점</span><b>{metrics.intersections}</b></div><div><span>닫힌 공간</span><b>{metrics.closed}</b></div><div><span>좌우 대칭</span><b>{metrics.horizontal}%</b></div><div><span>상하 대칭</span><b>{metrics.vertical}%</b></div></div>
        <div className="effect"><span>자동 능력 효과 · {attributeLabel}</span><b>{ability}</b><p>{description}</p></div>
        <label className="speed">애니메이션 <select value={speed} onChange={(event) => setSpeed(event.target.value)}><option value="slow">느림</option><option value="normal">보통</option><option value="fast">빠름</option><option value="stop">정지</option></select></label>
        <button className="finish" disabled={!strokes.length} onClick={() => setCardOpen(true)}>마법진 완성 <span>→</span></button>
      </aside>
    </section>
    {cardOpen && <div className="card-overlay" onClick={() => setCardOpen(false)}><article className="magic-card" onClick={(event) => { event.stopPropagation(); event.currentTarget.classList.toggle("flipped"); }}><div className="card-face card-front"><small>ARCANA CARD</small><h2>{ability}</h2><div className="mini-circle">{attributeGlyphs}</div><p>{attributeLabel} · {metrics.grade}</p><strong>{metrics.power}</strong><span>MAGIC POWER</span><footer>카드를 클릭해 뒷면 보기</footer></div><div className="card-face card-back"><small>ANALYSIS RECORD</small><h2>{ability}</h2><p>{description}</p><dl><div><dt>속성</dt><dd>{attributeLabel}</dd></div><div><dt>극좌표식</dt><dd>{metrics.formula}</dd></div><div><dt>복잡도</dt><dd>{metrics.complexity}</dd></div><div><dt>등급</dt><dd>{metrics.grade}</dd></div></dl><footer>클릭해서 앞면으로 돌아가기</footer></div></article><button className="share-circle" onClick={(event) => { event.stopPropagation(); shareCircle(); }} disabled={shareState === "working"}>{shareState === "copied" ? "링크가 복사되었습니다" : shareState === "failed" ? "복사에 실패했습니다" : shareState === "working" ? "링크 만드는 중…" : "◈ 마법진 공유하기"}</button></div>}
  </main>;
}
