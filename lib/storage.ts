// 드래프트 저장. 키는 "arcana-draft-v1" 그대로 두고 페이로드만 봉투로 감싼다.
// 키를 올리면 기존 사용자의 그림이 전부 사라진다 — 그리기 앱에서 그건 마이그레이션이 아니라 데이터 손실이다.

import { newId, simplify, SIMPLIFY_TOLERANCE, type Closure, type Point, type Stroke, type Symmetry } from "@/lib/geometry";
import { classifyClosure } from "@/lib/resample";

const DRAFT_KEY = "arcana-draft-v1";
const DRAFT_VERSION = 2;
const SYMMETRIES: Symmetry[] = ["free", "mirrorX", "mirrorY", "rotate"];
const CLOSURES: Closure[] = ["closed", "open", "point"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const revivePoints = (value: unknown): Point[] => {
  if (!Array.isArray(value)) return [];
  const points: Point[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const x = typeof raw.x === "number" ? raw.x : NaN; const y = typeof raw.y === "number" ? raw.y : NaN;
    // NaN 좌표 하나가 path 전체를 조용히 지운다. 저장 형식에서 미리 걷어낸다.
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    // page.tsx의 eventPoint와 같은 [-10,110] 클램프(E17)를 여기서도 거울처럼 건다(#3). 손상된 draft가
    // x=1e9 같은 값을 심으면 클램프 없이는 metrics.length·normS가 그 값 그대로 부풀어 오른다.
    points.push({ x: Math.min(110, Math.max(-10, x)), y: Math.min(110, Math.max(-10, y)) });
  }
  return points;
};

// 획 하나가 깨져도 나머지는 살린다. 통째로 버리면 그건 복구가 아니라 데이터 손실이다.
const reviveStroke = (raw: unknown, taken: Set<string>): Stroke | null => {
  if (!isRecord(raw)) return null;
  const cleaned = revivePoints(raw.points);
  if (cleaned.length < 2) return null;
  // E13: 출처와 무관하게 저장 형식을 정규화한다. v1에는 simplify를 거치지 않은 노이즈 점군이 남아 있고,
  // 그대로 두면 광대역 스펙트럼이 되어 원 하나가 40항으로 분해된다. simplify는 멱등이라 v2 재로드는 무해하다.
  const points = simplify(cleaned, SIMPLIFY_TOLERANCE);
  const id = typeof raw.id === "string" && raw.id.length > 0 && !taken.has(raw.id) ? raw.id : newId();
  taken.add(id);
  // v1 드래프트는 전부 툴바 기본값(회전 6)으로 그려졌다. "free"로 낮추면 복사본이 사라져 그림 자체가 바뀐다.
  const symmetry = SYMMETRIES.find((item) => item === raw.symmetry) ?? "rotate";
  // E11: rotationCount 0/누락은 각도 2π·k/0 = Infinity → NaN 좌표 → path 소멸로 이어진다.
  const rotationCount = Math.min(8, Math.max(2, Math.round(Number(raw.rotationCount)) || 6));
  // 저장된 동결값이 있으면 그대로 쓴다(E7). 없는 v1 항목만 좌표에서 판정한다 — simplify 를 거친 최종 좌표에서.
  const closure = CLOSURES.find((item) => item === raw.closure) ?? classifyClosure(points);
  return { id, points, symmetry, rotationCount, closure };
};

export const loadDraft = (): Stroke[] => {
  let raw: string | null = null;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch { return []; }
  if (!raw) return [];
  let parsed: unknown;
  // 읽기에 실패해도 원본을 지우지 않는다. 지우는 순간 복구 경로가 사라진다.
  try { parsed = JSON.parse(raw); } catch { return []; }
  // 배열이면 v1(맨 배열), 객체면 v2(봉투). 배열 대 객체는 공짜로 얻는 완벽한 판별자다.
  const list = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.strokes) ? parsed.strokes : null;
  if (!list) return [];
  const taken = new Set<string>();
  const strokes: Stroke[] = [];
  for (const entry of list) {
    const stroke = reviveStroke(entry, taken);
    if (stroke) strokes.push(stroke);
  }
  return strokes;
};

export const saveDraft = (strokes: Stroke[]): void => {
  // 사파리 프라이빗 모드와 용량 초과는 setItem에서 던진다. 저장이 실패해도 화면의 그림은 살아 있어야 한다.
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: DRAFT_VERSION, strokes })); } catch { /* 저장 실패는 조용히 넘긴다 */ }
};
