"use client";

import { CSSProperties, PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };
type Aspect = "holy" | "dark";
type Element = "water" | "earth" | "fire" | "wind";
type Symmetry = "free" | "mirrorX" | "mirrorY" | "rotate";

const PALETTE = ["#f6c65f", "#91ddff", "#b397ff", "#ef6478", "#f5f0d8"];
const ASPECTS: Record<Aspect, { label: string; accent: string; description: string }> = {
  holy: { label: "신성 마법", accent: "#f6c65f", description: "빛의 입자가 천천히 바깥으로 퍼집니다." },
  dark: { label: "어둠 마법", accent: "#a877e8", description: "어두운 입자가 맥동하며 중심으로 모입니다." }
};
const ELEMENTS: Record<Element, { label: string; glyph: string; accent: string; holy: string; dark: string }> = {
  water: { label: "물", glyph: "◈", accent: "#73c9f5", holy: "성수의 파문", dark: "심해의 속박" },
  earth: { label: "땅", glyph: "◆", accent: "#bca56b", holy: "성역의 토대", dark: "암석의 감옥" },
  fire: { label: "불", glyph: "✦", accent: "#f26b48", holy: "태양의 불꽃", dark: "지옥의 낙인" },
  wind: { label: "바람", glyph: "〰", accent: "#88d6b0", holy: "천공의 날개", dark: "망령의 폭풍" }
};

const pointDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pathFor = (points: Point[]) => points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
const transformPoint = (point: Point, symmetry: Symmetry, count: number, copy: number): Point => {
  if (symmetry === "mirrorX") return copy ? { x: 100 - point.x, y: point.y } : point;
  if (symmetry === "mirrorY") return copy ? { x: point.x, y: 100 - point.y } : point;
  if (symmetry !== "rotate" || copy === 0) return point;
  const angle = (Math.PI * 2 * copy) / count;
  const x = point.x - 50; const y = point.y - 50;
  return { x: 50 + x * Math.cos(angle) - y * Math.sin(angle), y: 50 + x * Math.sin(angle) + y * Math.cos(angle) };
};
const copiesFor = (symmetry: Symmetry, count: number) => symmetry === "rotate" ? count : symmetry === "free" ? 1 : 2;

function getMetrics(strokes: Stroke[], symmetry: Symmetry, rotationCount: number) {
  const lines = strokes.length;
  let length = 0; let corners = 0; let closed = 0;
  strokes.forEach((stroke) => {
    for (let index = 1; index < stroke.points.length; index += 1) length += pointDistance(stroke.points[index - 1], stroke.points[index]);
    if (stroke.points.length > 6 && pointDistance(stroke.points[0], stroke.points[stroke.points.length - 1]) < 8) closed += 1;
    corners += Math.max(0, Math.floor(stroke.points.length / 18) - 1);
  });
  const duplication = copiesFor(symmetry, rotationCount);
  const intersections = Math.max(0, Math.min(28, Math.floor((lines * duplication - 1) * 1.7 + closed * 2)));
  const horizontal = symmetry === "mirrorX" ? 100 : Math.min(88, Math.round(closed * 9 + lines * 3));
  const vertical = symmetry === "mirrorY" ? 100 : Math.min(88, Math.round(closed * 8 + lines * 3));
  const rotation = symmetry === "rotate" ? rotationCount : 1;
  const complexity = Math.min(100, Math.round(lines * 7 + intersections * 2 + closed * 10 + corners * 1.5 + length / 42));
  const power = Math.round(lines * duplication + intersections * 3 + closed * 4 + (symmetry === "mirrorX" ? 10 : 0) + (symmetry === "mirrorY" ? 10 : 0) + (rotation - 1) * 10 + complexity * 2);
  const grade = power >= 260 ? "초월" : power >= 150 ? "고급" : power >= 60 ? "중급" : "초급";
  const formula = `r = ${Math.max(1, Math.min(8, rotation + closed))} + ${Math.max(1, Math.round(complexity / 14))}sin(${Math.max(2, rotation * 2)}θ)`;
  return { lines, length: Math.round(length), intersections, closed, horizontal, vertical, rotation, complexity, power, grade, formula };
}

export default function Home() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [active, setActive] = useState<Stroke | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(PALETTE[0]);
  const [width, setWidth] = useState(1.1);
  const [aspect, setAspect] = useState<Aspect>("holy");
  const [element, setElement] = useState<Element>("fire");
  const [symmetry, setSymmetry] = useState<Symmetry>("rotate");
  const [rotationCount, setRotationCount] = useState(6);
  const [guides, setGuides] = useState(true);
  const [speed, setSpeed] = useState("normal");
  const [cardOpen, setCardOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metrics = useMemo(() => getMetrics(strokes, symmetry, rotationCount), [strokes, symmetry, rotationCount]);
  const theme = ASPECTS[aspect];
  const elementInfo = ELEMENTS[element];
  const displayStrokes = active ? [...strokes, active] : strokes;

  useEffect(() => {
    const draft = localStorage.getItem("arcana-draft-v1");
    if (draft) { try { setStrokes(JSON.parse(draft)); } catch { localStorage.removeItem("arcana-draft-v1"); } }
  }, []);
  useEffect(() => { localStorage.setItem("arcana-draft-v1", JSON.stringify(strokes)); }, [strokes]);
  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  const eventPoint = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 };
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
    setActive({ points: [eventPoint(event)], color, width });
  };
  const addPoint = (event: PointerEvent<SVGSVGElement>) => {
    if (!active || tool === "eraser") return;
    const point = eventPoint(event);
    setActive((current) => current ? { ...current, points: [...current.points, point] } : null);
  };
  const endStroke = () => {
    if (active && active.points.length > 2) { setStrokes((current) => [...current, active]); setRedoStack([]); }
    setActive(null);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => undefined, 100);
  };
  const undo = () => setStrokes((current) => { if (!current.length) return current; const item = current[current.length - 1]; setRedoStack((redo) => [...redo, item]); return current.slice(0, -1); });
  const redo = () => setRedoStack((current) => { if (!current.length) return current; const item = current[current.length - 1]; setStrokes((drawn) => [...drawn, item]); return current.slice(0, -1); });
  const saveCard = () => { localStorage.setItem("arcana-card-v1", JSON.stringify({ strokes, aspect, metrics, savedAt: new Date().toISOString() })); setSaved(true); };
  const ability = metrics.rotation >= 6 && element === "earth" ? (aspect === "holy" ? "육각 성벽" : "암석의 감옥") : elementInfo[aspect];

  return <main className={`arcana ${aspect}`} style={{ "--accent": elementInfo.accent, "--speed": speed === "slow" ? "18s" : speed === "fast" ? "4s" : speed === "stop" ? "0s" : "9s" } as CSSProperties}>
    <header className="site-header"><div className="logo"><span>✦</span> ARCANA <b>LAB</b></div><div className="student">MAGIC CIRCLE STUDIO <i /> 실시간 분석</div><button className="save-button" onClick={saveCard}>{saved ? "저장됨" : "임시 저장"}</button></header>
    <section className="workspace">
      <aside className="tools panel">
        <div className="panel-title">DRAW TOOLS <span>01</span></div>
        <div className="tool-row"><button className={tool === "pen" ? "on" : ""} onClick={() => setTool("pen")}>✎ 펜</button><button className={tool === "eraser" ? "on" : ""} onClick={() => setTool("eraser")}>⌫ 지우개</button></div>
        <div className="tool-row"><button onClick={undo} disabled={!strokes.length}>↶ 실행 취소</button><button onClick={redo} disabled={!redoStack.length}>↷ 다시 실행</button></div>
        <label className="slider-label">선 굵기 <b>{width.toFixed(1)}</b><input type="range" min="0.4" max="3" step="0.1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
        <div className="colors">{PALETTE.map((tone) => <button key={tone} aria-label="선 색상" onClick={() => setColor(tone)} className={color === tone ? "selected" : ""} style={{ background: tone }} />)}</div>
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
            <defs><filter id="magic-glow"><feGaussianBlur stdDeviation="0.65" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
            {guides && <g className="guides"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="31" />{Array.from({ length: 8 }, (_, i) => <line key={i} x1="50" y1="5" x2="50" y2="95" transform={`rotate(${i * 45} 50 50)`} />)}<path d="M50 15L58 41L85 41L63 57L71 85L50 68L29 85L37 57L15 41L42 41Z" /></g>}
            {displayStrokes.flatMap((stroke, index) => Array.from({ length: copiesFor(symmetry, rotationCount) }, (_, copy) => <path key={`${index}-${copy}`} className="draw-stroke" d={pathFor(stroke.points.map((point) => transformPoint(point, symmetry, rotationCount, copy)))} style={{ stroke: stroke.color, strokeWidth: stroke.width }} />))}
            <circle className="core" cx="50" cy="50" r="1.5" />
          </svg>
          <p className="canvas-tip">드래그하여 그리세요 · 대칭 모드에서는 선이 자동 복사됩니다</p>
        </div>
        <div className="stage-footer"><span>근사식</span><code>{metrics.formula}</code><span>입력 후 0.1초마다 분석</span></div>
      </section>

      <aside className="analysis panel">
        <div className="panel-title">ARCANA SCAN <span>03</span></div>
        <div className="aspect-switch">{(["holy", "dark"] as Aspect[]).map((id) => <button key={id} onClick={() => setAspect(id)} className={aspect === id ? "on" : ""}><span>{id === "holy" ? "✧" : "☾"}</span>{ASPECTS[id].label}</button>)}</div>
        <div className="element-title">ELEMENTAL AFFINITY</div>
        <div className="element-switch">{(Object.keys(ELEMENTS) as Element[]).map((id) => <button key={id} onClick={() => setElement(id)} className={element === id ? "on" : ""} style={{ "--element": ELEMENTS[id].accent } as CSSProperties}><span>{ELEMENTS[id].glyph}</span>{ELEMENTS[id].label}</button>)}</div>
        <div className="power"><span>MAGIC POWER</span><b>{metrics.power}</b><i> / 999</i><div><em style={{ width: `${Math.min(100, metrics.power / 3.2)}%` }} /></div><strong>{metrics.grade}</strong></div>
        <div className="stat-grid"><div><span>선의 개수</span><b>{metrics.lines}</b></div><div><span>선의 길이</span><b>{metrics.length}</b></div><div><span>교차점</span><b>{metrics.intersections}</b></div><div><span>닫힌 공간</span><b>{metrics.closed}</b></div><div><span>좌우 대칭</span><b>{metrics.horizontal}%</b></div><div><span>상하 대칭</span><b>{metrics.vertical}%</b></div></div>
        <div className="effect"><span>자동 능력 효과 · {elementInfo.label}</span><b>{ability}</b><p>{theme.description}</p></div>
        <label className="speed">애니메이션 <select value={speed} onChange={(event) => setSpeed(event.target.value)}><option value="slow">느림</option><option value="normal">보통</option><option value="fast">빠름</option><option value="stop">정지</option></select></label>
        <button className="finish" disabled={!strokes.length} onClick={() => setCardOpen(true)}>마법진 완성 <span>→</span></button>
      </aside>
    </section>
    {cardOpen && <div className="card-overlay" onClick={() => setCardOpen(false)}><article className="magic-card" onClick={(event) => { event.stopPropagation(); event.currentTarget.classList.toggle("flipped"); }}><div className="card-face card-front"><small>ARCANA CARD</small><h2>{ability}</h2><div className="mini-circle">{elementInfo.glyph}</div><p>{theme.label} · {elementInfo.label} · {metrics.grade}</p><strong>{metrics.power}</strong><span>MAGIC POWER</span><footer>카드를 클릭해 뒷면 보기</footer></div><div className="card-face card-back"><small>ANALYSIS RECORD</small><h2>{ability}</h2><p>{theme.description}</p><dl><div><dt>속성</dt><dd>{theme.label} · {elementInfo.label}</dd></div><div><dt>근사 수학식</dt><dd>{metrics.formula}</dd></div><div><dt>복잡도</dt><dd>{metrics.complexity}</dd></div><div><dt>등급</dt><dd>{metrics.grade}</dd></div></dl><footer>클릭해서 앞면으로 돌아가기</footer></div></article></div>}
  </main>;
}
