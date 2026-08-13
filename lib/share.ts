// 마법진을 링크 하나에 통째로 담는다. 서버가 없어도 공유가 되고, 링크가 곧 데이터라 만료되지 않는다.
//
// 좌표를 0.1 단위 정수로 양자화하고 획 안에서 델타를 취한 뒤 gzip을 걸면 원본 JSON의 약 1/17로 줄어든다.
// (실측: 54획 977제어점 기준 47,677 B → base64url 2,756자)

import { ATTRIBUTE_ORDER, sanitizeAttributes, type Attribute } from "@/lib/attributes";
import type { Point, Stroke, Symmetry } from "@/lib/geometry";

const FORMAT = 1;
const SYMMETRY_CODES: Symmetry[] = ["free", "mirrorX", "mirrorY", "rotate"];

// 링크는 남이 보내는 값이다. 터무니없이 큰 입력으로 브라우저를 멈추게 하지 않도록 상한을 둔다.
const MAX_STROKES = 500;
const MAX_POINTS_PER_STROKE = 2000;

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000; // 인자 스프레드가 스택을 넘지 않는 크기로 잘라 넣는다.
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const gzip = async (text: string) =>
  new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());

const gunzip = async (bytes: Uint8Array) =>
  new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).text();

export type SharePayload = { strokes: Stroke[]; attributes: Attribute[] };

export async function encodeShare({ strokes, attributes }: SharePayload): Promise<string> {
  const packed = strokes.map((stroke) => {
    let previousX = 0; let previousY = 0;
    const coordinates: number[] = [];
    stroke.points.forEach((point) => {
      const x = Math.round(point.x * 10); const y = Math.round(point.y * 10);
      coordinates.push(x - previousX, y - previousY);
      previousX = x; previousY = y;
    });
    return [Math.max(0, SYMMETRY_CODES.indexOf(stroke.symmetry)), stroke.rotationCount, ...coordinates];
  });
  const attributeCodes = attributes.map((id) => ATTRIBUTE_ORDER.indexOf(id)).filter((code) => code >= 0);
  return toBase64Url(await gzip(JSON.stringify([FORMAT, attributeCodes, packed])));
}

// 어떤 입력에도 예외를 던지지 않는다. 읽을 수 없으면 null이고, 호출부는 그것만 처리하면 된다.
export async function decodeShare(text: string | undefined | null): Promise<SharePayload | null> {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(await gunzip(fromBase64Url(text)));
    if (!Array.isArray(parsed) || parsed[0] !== FORMAT) return null;
    const [, rawAttributes, rawStrokes] = parsed as [number, unknown, unknown];
    if (!Array.isArray(rawStrokes)) return null;

    const strokes: Stroke[] = [];
    for (const entry of rawStrokes.slice(0, MAX_STROKES)) {
      if (!Array.isArray(entry) || entry.length < 4) continue;
      const symmetry = SYMMETRY_CODES[entry[0] as number];
      const rotationCount = Number(entry[1]);
      if (!symmetry || !Number.isFinite(rotationCount)) continue;
      const coordinates = entry.slice(2).map(Number);
      if (coordinates.length % 2 !== 0 || coordinates.some((value) => !Number.isFinite(value))) continue;

      const points: Point[] = [];
      let x = 0; let y = 0;
      for (let index = 0; index + 1 < coordinates.length && points.length < MAX_POINTS_PER_STROKE; index += 2) {
        x += coordinates[index]; y += coordinates[index + 1];
        // 캔버스 밖 좌표는 잘라낸다. 양자화 단위가 0.1이므로 10으로 나눠 되돌린다.
        points.push({ x: Math.min(100, Math.max(0, x / 10)), y: Math.min(100, Math.max(0, y / 10)) });
      }
      if (points.length < 2) continue;
      strokes.push({ points, symmetry, rotationCount: Math.min(12, Math.max(1, Math.round(rotationCount))) });
    }
    if (!strokes.length) return null;

    const attributeIds = Array.isArray(rawAttributes)
      ? rawAttributes.map((code) => ATTRIBUTE_ORDER[Number(code)]).filter(Boolean)
      : [];
    return { strokes, attributes: sanitizeAttributes(attributeIds) };
  } catch {
    return null;
  }
}
