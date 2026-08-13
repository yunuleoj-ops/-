// 마법진의 기하. React에 의존하지 않는 순수 함수만 둔다 — 캔버스와 공유 페이지가 같은 코드로 같은 그림을 그린다.

export type Point = { x: number; y: number };
export type Symmetry = "free" | "mirrorX" | "mirrorY" | "rotate";
export type Stroke = { points: Point[]; symmetry: Symmetry; rotationCount: number };

export const STROKE_WIDTH = 0.5;
export const SIMPLIFY_TOLERANCE = 0.35;
export const CURVE_STEPS = 8;

export const pointDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// 선분 start-end 로부터 point 까지의 수직 거리.
const perpendicularDistance = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x; const dy = end.y - start.y;
  if (!dx && !dy) return pointDistance(point, start);
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return pointDistance(point, { x: start.x + clamped * dx, y: start.y + clamped * dy });
};

// Ramer-Douglas-Peucker. 손떨림으로 생긴 점을 걷어내고 형태를 결정하는 점만 남긴다.
export const simplify = (points: Point[], tolerance: number): Point[] => {
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
// closed면 마지막 점 → 첫 점을 직선 현으로 닫는다(Z). 스펙 §1.2: 정확도의 진리값은 화면에
// 그려진 곡선이므로, 닫힘으로 판정된 획은 화면에서도 실제로 닫혀 있어야 분석과 그림이 갈라지지 않는다.
export const pathFor = (points: Point[], closed = false) => {
  if (!points.length) return "";
  const close = closed ? " Z" : "";
  const move = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  if (points.length === 1) return `${move}${close}`;
  if (points.length === 2) return `${move} L${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}${close}`;
  let path = move;
  for (let i = 0; i < points.length - 1; i += 1) {
    const previous = points[i - 1] ?? points[i];
    const start = points[i]; const end = points[i + 1];
    const next = points[i + 2] ?? end;
    const c1x = start.x + (end.x - previous.x) / 6; const c1y = start.y + (end.y - previous.y) / 6;
    const c2x = end.x - (next.x - start.x) / 6; const c2y = end.y - (next.y - start.y) / 6;
    path += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }
  return `${path}${close}`;
};

// 화면에 그려지는 것과 같은 곡선 위에서 점을 다시 뽑는다. 분석은 제어점이 아니라 이 점들을 쓴다.
export const curvePoints = (points: Point[]): Point[] => {
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

export const transformPoint = (point: Point, symmetry: Symmetry, count: number, copy: number): Point => {
  if (symmetry === "mirrorX") return copy ? { x: 100 - point.x, y: point.y } : point;
  if (symmetry === "mirrorY") return copy ? { x: point.x, y: 100 - point.y } : point;
  if (symmetry !== "rotate" || copy === 0) return point;
  const angle = (Math.PI * 2 * copy) / count;
  const x = point.x - 50; const y = point.y - 50;
  return { x: 50 + x * Math.cos(angle) - y * Math.sin(angle), y: 50 + x * Math.sin(angle) + y * Math.cos(angle) };
};

export const copiesFor = (symmetry: Symmetry, count: number) => symmetry === "rotate" ? count : symmetry === "free" ? 1 : 2;

// 대칭 복사본까지 펼친 제어점 목록. 화면과 분석이 갈라지지 않도록 이 함수 하나만 쓴다.
export const strokeCopies = (stroke: Stroke): Point[][] =>
  Array.from({ length: copiesFor(stroke.symmetry, stroke.rotationCount) }, (_, copy) =>
    stroke.points.map((point) => transformPoint(point, stroke.symmetry, stroke.rotationCount, copy)));
