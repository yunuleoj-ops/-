"use client";

import { CSSProperties, PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };
type Stroke = { points: Point[]; symmetry: Symmetry; rotationCount: number };
type Aspect = "holy" | "dark";
type Element = "water" | "earth" | "fire" | "wind";
type Symmetry = "free" | "mirrorX" | "mirrorY" | "rotate";

const STROKE_WIDTH = 0.5;
const ASPECTS: Record<Aspect, { label: string; accent: string; description: string }> = {
  holy: { label: "신성 마법", accent: "#f6c65f", description: "빛의 입자가 천천히 바깥으로 퍼집니다." },
  dark: { label: "어둠 마법", accent: "#a877e8", description: "어두운 입자가 맥동하며 중심으로 모입니다." }
};
const ELEMENTS: Record<Element, { label: string; glyph: string; accent: string; holy: string; dark: string }> = {
  water: { label: "물", glyph: "◈", accent: "#2f9cff", holy: "성수의 파문", dark: "심해의 속박" },
  earth: { label: "땅", glyph: "◆", accent: "#9b6b3d", holy: "성역의 토대", dark: "암석의 감옥" },
  fire: { label: "불", glyph: "✦", accent: "#ff4d3d", holy: "태양의 불꽃", dark: "지옥의 낙인" },
  wind: { label: "바람", glyph: "〰", accent: "#9be86b", holy: "천공의 날개", dark: "망령의 폭풍" }
};
const toggleFrom = <T extends string,>(items: T[], item: T, fallback: T) => {
  const next = items.includes(item) ? items.filter((current) => current !== item) : [...items, item];
  return next.length ? next : [fallback];
};
const gradientFrom = (colors: string[]) => colors.length > 1 ? `linear-gradient(135deg, ${colors.join(", ")})` : colors[0];

const pointDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const SIMPLIFY_TOLERANCE = 0.35;
const CURVE_STEPS = 8;

// 선분 start-end 로부터 point 까지의 수직 거리.
const perpendicularDistance = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x; const dy = end.y - start.y;
  if (!dx && !dy) return pointDistance(point, start);
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return pointDistance(point, { x: start.x + clamped * dx, y: start.y + clamped * dy });
};

// Ramer-Douglas-Peucker. 손떨림으로 생긴 점을 걷어내고 형태를 결정하는 점만 남긴다.
const simplify = (points: Point[], tolerance: number): Point[] => {
  if (points.length < 3) return points;
  const first = points[0]; const last = points[points.length - 1];
  let index = 0; let largest = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > largest) { largest = distance; index = i; }
  }
  if (largest <= tolerance) return [first, last];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
};

// Catmull-Rom 스플라인을 큐빅 베지어로 옮긴다. 제어점을 지나는 곡선이라 그린 모양이 유지된다.
const pathFor = (points: Point[]) => {
  if (!points.length) return "";
  const move = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  if (points.length === 1) return move;
  if (points.length === 2) return `${move} L${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  let path = move;
  for (let i = 0; i < points.length - 1; i += 1) {
    const previous = points[i - 1] ?? points[i];
    const start = points[i]; const end = points[i + 1];
    const next = points[i + 2] ?? end;
    const c1x = start.x + (end.x - previous.x) / 6; const c1y = start.y + (end.y - previous.y) / 6;
    const c2x = end.x - (next.x - start.x) / 6; const c2y = end.y - (next.y - start.y) / 6;
    path += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }
  return path;
};

// 화면에 그려지는 것과 같은 곡선 위에서 점을 다시 뽑는다. 분석은 제어점이 아니라 이 점들을 쓴다.
const curvePoints = (points: Point[]): Point[] => {
  if (points.length < 3) return points;
  const sampled: Point[] = [points[0]];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i]; const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS; const t2 = t * t; const t3 = t2 * t;
      sampled.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      });
    }
  }
  return sampled;
};
const transformPoint = (point: Point, symmetry: Symmetry, count: number, copy: number): Point => {
  if (symmetry === "mirrorX") return copy ? { x: 100 - point.x, y: point.y } : point;
  if (symmetry === "mirrorY") return copy ? { x: point.x, y: 100 - point.y } : point;
  if (symmetry !== "rotate" || copy === 0) return point;
  const angle = (Math.PI * 2 * copy) / count;
  const x = point.x - 50; const y = point.y - 50;
  return { x: 50 + x * Math.cos(angle) - y * Math.sin(angle), y: 50 + x * Math.sin(angle) + y * Math.cos(angle) };
};
const copiesFor = (symmetry: Symmetry, count: number) => symmetry === "rotate" ? count : symmetry === "free" ? 1 : 2;

const ANGLE_BINS = 180;
const MAX_HARMONIC = 24;
const MAX_TERMS = 4;

// 캔버스 중심을 원점 (0, 0)으로 옮기고 y축을 수학 좌표계 방향으로 뒤집은 뒤, 각도 구간별 평균 반지름을 구한다.
function radialProfile(strokes: Stroke[]) {
  const sums = new Array<number>(ANGLE_BINS).fill(0);
  const hits = new Array<number>(ANGLE_BINS).fill(0);
  strokes.forEach((stroke) => {
    const shaped = curvePoints(stroke.points);
    for (let copy = 0; copy < copiesFor(stroke.symmetry, stroke.rotationCount); copy += 1) {
      shaped.forEach((point) => {
        const placed = transformPoint(point, stroke.symmetry, stroke.rotationCount, copy);
        const x = placed.x - 50; const y = 50 - placed.y;
        const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
        const bin = Math.min(ANGLE_BINS - 1, Math.floor((angle / (Math.PI * 2)) * ANGLE_BINS));
        sums[bin] += Math.hypot(x, y); hits[bin] += 1;
      });
    }
  });
  if (!hits.some((hit) => hit > 0)) return null;
  const raw = sums.map((sum, bin) => hits[bin] ? sum / hits[bin] : NaN);
  return raw.map((value, bin) => {
    if (!Number.isNaN(value)) return value;
    let back = 1; let forward = 1;
    while (Number.isNaN(raw[(bin - back + ANGLE_BINS) % ANGLE_BINS])) back += 1;
    while (Number.isNaN(raw[(bin + forward) % ANGLE_BINS])) forward += 1;
    const before = raw[(bin - back + ANGLE_BINS) % ANGLE_BINS];
    const after = raw[(bin + forward) % ANGLE_BINS];
    return (before * forward + after * back) / (back + forward);
  });
}

// r(θ)를 푸리에 급수로 전개해 진폭이 큰 항만 남긴다.
function polarFormula(strokes: Stroke[]) {
  const profile = radialProfile(strokes);
  if (!profile) return { formula: "r(θ) = —", accuracy: 0 };
  const mean = profile.reduce((sum, value) => sum + value, 0) / ANGLE_BINS;
  const harmonics = [];
  for (let k = 1; k <= MAX_HARMONIC; k += 1) {
    let cosine = 0; let sine = 0;
    profile.forEach((value, bin) => {
      const angle = (Math.PI * 2 * bin) / ANGLE_BINS;
      cosine += value * Math.cos(k * angle); sine += value * Math.sin(k * angle);
    });
    harmonics.push({ k, amplitude: Math.hypot(cosine, sine) * (2 / ANGLE_BINS), phase: Math.atan2(sine, cosine) });
  }
  const terms = harmonics.filter((harmonic) => harmonic.amplitude >= 0.05)
    .sort((a, b) => b.amplitude - a.amplitude).slice(0, MAX_TERMS).sort((a, b) => a.k - b.k);
  const approximate = (angle: number) => mean + terms.reduce((sum, term) => sum + term.amplitude * Math.cos(term.k * angle - term.phase), 0);
  const error = profile.reduce((sum, value, bin) => sum + Math.abs(value - approximate((Math.PI * 2 * bin) / ANGLE_BINS)), 0) / ANGLE_BINS;
  const accuracy = mean > 0 ? Math.max(0, Math.min(100, Math.round((1 - error / mean) * 100))) : 0;
  const text = terms.map((term) => `${term.amplitude.toFixed(1)}cos(${term.k}θ ${term.phase >= 0 ? "−" : "+"} ${Math.abs(term.phase).toFixed(2)})`).join(" + ");
  return { formula: `r(θ) = ${mean.toFixed(1)}${terms.length ? ` + ${text}` : ""}`, accuracy };
}

function getMetrics(strokes: Stroke[]) {
  const lines = strokes.length;
  let length = 0; let corners = 0; let closed = 0; let copies = 0;
  strokes.forEach((stroke) => {
    const shaped = curvePoints(stroke.points);
    let drawn = 0;
    for (let index = 1; index < shaped.length; index += 1) drawn += pointDistance(shaped[index - 1], shaped[index]);
    length += drawn;
    if (drawn > 18 && pointDistance(shaped[0], shaped[shaped.length - 1]) < 8) closed += 1;
    // 제어점에서 진행 방향이 45도 넘게 꺾이면 꼭짓점으로 센다.
    for (let index = 1; index < stroke.points.length - 1; index += 1) {
      const before = Math.atan2(stroke.points[index].y - stroke.points[index - 1].y, stroke.points[index].x - stroke.points[index - 1].x);
      const after = Math.atan2(stroke.points[index + 1].y - stroke.points[index].y, stroke.points[index + 1].x - stroke.points[index].x);
      let turn = Math.abs(after - before);
      if (turn > Math.PI) turn = Math.PI * 2 - turn;
      if (turn > Math.PI / 4) corners += 1;
    }
    copies += copiesFor(stroke.symmetry, stroke.rotationCount);
  });
  const mirroredX = strokes.some((stroke) => stroke.symmetry === "mirrorX");
  const mirroredY = strokes.some((stroke) => stroke.symmetry === "mirrorY");
  const rotation = strokes.reduce((most, stroke) => stroke.symmetry === "rotate" ? Math.max(most, stroke.rotationCount) : most, 1);
  const intersections = Math.max(0, Math.min(28, Math.floor((copies - 1) * 1.7 + closed * 2)));
  const horizontal = mirroredX ? 100 : Math.min(88, Math.round(closed * 9 + lines * 3));
  const vertical = mirroredY ? 100 : Math.min(88, Math.round(closed * 8 + lines * 3));
  const complexity = Math.min(100, Math.round(lines * 7 + intersections * 2 + closed * 10 + corners * 1.5 + length / 42));
  const power = Math.round(copies + intersections * 3 + closed * 4 + (mirroredX ? 10 : 0) + (mirroredY ? 10 : 0) + (rotation - 1) * 10 + complexity * 2);
  const grade = power >= 260 ? "초월" : power >= 150 ? "고급" : power >= 60 ? "중급" : "초급";
  const { formula, accuracy } = polarFormula(strokes);
  return { lines, length: Math.round(length), intersections, closed, horizontal, vertical, rotation, complexity, power, grade, formula, accuracy };
}

export default function Home() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [active, setActive] = useState<Stroke | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [aspects, setAspects] = useState<Aspect[]>(["holy"]);
  const [elements, setElements] = useState<Element[]>(["fire"]);
  const [symmetry, setSymmetry] = useState<Symmetry>("rotate");
  const [rotationCount, setRotationCount] = useState(6);
  const [guides, setGuides] = useState(true);
  const [speed, setSpeed] = useState("normal");
  const [cardOpen, setCardOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);
  const metrics = useMemo(() => getMetrics(strokes), [strokes]);
  const aspectInfos = aspects.map((id) => ASPECTS[id]);
  const elementInfos = elements.map((id) => ELEMENTS[id]);
  const selectedColors = [...aspectInfos.map((item) => item.accent), ...elementInfos.map((item) => item.accent)];
  const accent = selectedColors[0] ?? ASPECTS.holy.accent;
  const accentGradient = gradientFrom(selectedColors);
  const aspectLabel = aspectInfos.map((item) => item.label).join(" · ");
  const elementLabel = elementInfos.map((item) => item.label).join(" · ");
  const elementGlyphs = elementInfos.map((item) => item.glyph).join("");
  const description = aspectInfos.map((item) => item.description).join(" ");
  const displayStrokes = active ? [...strokes, active] : strokes;

  useEffect(() => {
    const draft = localStorage.getItem("arcana-draft-v1");
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as Partial<Stroke>[];
        setStrokes(parsed.map((stroke) => ({ points: stroke.points ?? [], symmetry: stroke.symmetry ?? "rotate", rotationCount: stroke.rotationCount ?? 6 })));
      } catch { localStorage.removeItem("arcana-draft-v1"); }
    }
  }, []);
  // 첫 커밋에서는 저장하지 않는다. 불러오기 전의 빈 배열이 저장된 그림을 덮어쓰기 때문이다.
  useEffect(() => {
    if (!restored.current) { restored.current = true; return; }
    localStorage.setItem("arcana-draft-v1", JSON.stringify(strokes));
  }, [strokes]);
  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

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
    setActive({ points: [eventPoint(event)], symmetry, rotationCount });
  };
  const addPoint = (event: PointerEvent<SVGSVGElement>) => {
    if (!active || tool === "eraser") return;
    const point = eventPoint(event);
    setActive((current) => current ? { ...current, points: [...current.points, point] } : null);
  };
  const endStroke = () => {
    if (active && active.points.length > 2) {
      const shaped = { ...active, points: simplify(active.points, SIMPLIFY_TOLERANCE) };
      setStrokes((current) => [...current, shaped]); setRedoStack([]);
    }
    setActive(null);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => undefined, 100);
  };
  const undo = () => setStrokes((current) => { if (!current.length) return current; const item = current[current.length - 1]; setRedoStack((redo) => [...redo, item]); return current.slice(0, -1); });
  const redo = () => setRedoStack((current) => { if (!current.length) return current; const item = current[current.length - 1]; setStrokes((drawn) => [...drawn, item]); return current.slice(0, -1); });
  const copyFormula = async () => {
    try { await navigator.clipboard.writeText(metrics.formula); } catch { return; }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  };
  const saveCard = () => { localStorage.setItem("arcana-card-v1", JSON.stringify({ strokes, aspects, elements, metrics, savedAt: new Date().toISOString() })); setSaved(true); };
  const ability = elements.includes("earth") && metrics.rotation >= 6
    ? (aspects.includes("holy") ? "육각 성벽" : "암석의 감옥")
    : elementInfos.map((elementInfo) => aspects.map((aspect) => elementInfo[aspect]).join(" · ")).join(" · ");

  return <main className={`arcana ${aspects.includes("dark") && !aspects.includes("holy") ? "dark" : "holy"}`} style={{ "--accent": accent, "--accent-gradient": accentGradient, "--speed": speed === "slow" ? "18s" : speed === "fast" ? "4s" : speed === "stop" ? "0s" : "9s" } as CSSProperties}>
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
            {displayStrokes.flatMap((stroke, index) => Array.from({ length: copiesFor(stroke.symmetry, stroke.rotationCount) }, (_, copy) => <path key={`${index}-${copy}`} className="draw-stroke" d={pathFor(stroke.points.map((point) => transformPoint(point, stroke.symmetry, stroke.rotationCount, copy)))} style={{ stroke: "url(#arcana-gradient)", strokeWidth: STROKE_WIDTH }} />))}
            <circle className="core" cx="50" cy="50" r="1.5" />
          </svg>
          <p className="canvas-tip">드래그하여 그리세요 · 대칭 모드에서는 선이 자동 복사됩니다</p>
        </div>
        <div className="stage-footer"><span>극좌표식 · 원점 (0,0)</span><code>{metrics.formula}</code><button className="copy-formula" onClick={copyFormula} disabled={!strokes.length}>{copied ? "복사됨" : "복사"}</button><span>정확도 {metrics.accuracy}%</span></div>
      </section>

      <aside className="analysis panel">
        <div className="panel-title">ARCANA SCAN <span>03</span></div>
        <div className="aspect-switch">{(["holy", "dark"] as Aspect[]).map((id) => <button key={id} onClick={() => setAspects((current) => toggleFrom(current, id, "holy"))} className={aspects.includes(id) ? "on" : ""} style={{ "--element": ASPECTS[id].accent } as CSSProperties}><span>{id === "holy" ? "✧" : "☾"}</span>{ASPECTS[id].label}</button>)}</div>
        <div className="element-title">ELEMENTAL AFFINITY</div>
        <div className="element-switch">{(Object.keys(ELEMENTS) as Element[]).map((id) => <button key={id} onClick={() => setElements((current) => toggleFrom(current, id, "fire"))} className={elements.includes(id) ? "on" : ""} style={{ "--element": ELEMENTS[id].accent } as CSSProperties}><span>{ELEMENTS[id].glyph}</span>{ELEMENTS[id].label}</button>)}</div>
        <div className="power"><span>MAGIC POWER</span><b>{metrics.power}</b><i> / 999</i><div><em style={{ width: `${Math.min(100, metrics.power / 3.2)}%` }} /></div><strong>{metrics.grade}</strong></div>
        <div className="stat-grid"><div><span>선의 개수</span><b>{metrics.lines}</b></div><div><span>선의 길이</span><b>{metrics.length}</b></div><div><span>교차점</span><b>{metrics.intersections}</b></div><div><span>닫힌 공간</span><b>{metrics.closed}</b></div><div><span>좌우 대칭</span><b>{metrics.horizontal}%</b></div><div><span>상하 대칭</span><b>{metrics.vertical}%</b></div></div>
        <div className="effect"><span>자동 능력 효과 · {aspectLabel} · {elementLabel}</span><b>{ability}</b><p>{description}</p></div>
        <label className="speed">애니메이션 <select value={speed} onChange={(event) => setSpeed(event.target.value)}><option value="slow">느림</option><option value="normal">보통</option><option value="fast">빠름</option><option value="stop">정지</option></select></label>
        <button className="finish" disabled={!strokes.length} onClick={() => setCardOpen(true)}>마법진 완성 <span>→</span></button>
      </aside>
    </section>
    {cardOpen && <div className="card-overlay" onClick={() => setCardOpen(false)}><article className="magic-card" onClick={(event) => { event.stopPropagation(); event.currentTarget.classList.toggle("flipped"); }}><div className="card-face card-front"><small>ARCANA CARD</small><h2>{ability}</h2><div className="mini-circle">{elementGlyphs}</div><p>{aspectLabel} · {elementLabel} · {metrics.grade}</p><strong>{metrics.power}</strong><span>MAGIC POWER</span><footer>카드를 클릭해 뒷면 보기</footer></div><div className="card-face card-back"><small>ANALYSIS RECORD</small><h2>{ability}</h2><p>{description}</p><dl><div><dt>속성</dt><dd>{aspectLabel} · {elementLabel}</dd></div><div><dt>극좌표식</dt><dd>{metrics.formula}</dd></div><div><dt>복잡도</dt><dd>{metrics.complexity}</dd></div><div><dt>등급</dt><dd>{metrics.grade}</dd></div></dl><footer>클릭해서 앞면으로 돌아가기</footer></div></article></div>}
  </main>;
}
