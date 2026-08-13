import { ImageResponse } from "next/og";

import { ATTRIBUTES, toneOf } from "@/lib/attributes";
import { pathFor, strokeCopies } from "@/lib/geometry";
import { getMetrics } from "@/lib/metrics";
import { decodeShare } from "@/lib/share";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "마법연산자에서 만든 마법진";

// Satori에는 웹폰트가 없다. 한글과 기호 글리프는 두부로 나오므로 이미지 안 글자는 ASCII만 쓰고,
// 속성은 글리프 대신 고유색 원으로 나타낸다.
const GRADE_LABEL: Record<string, string> = {
  "초월": "TRANSCENDENT", "고급": "ADVANCED", "중급": "INTERMEDIATE", "초급": "NOVICE"
};

// 마법진은 Satori가 직접 그릴 수 없으므로 SVG를 만들어 data URI 이미지로 넘긴다.
function circleDataUri(paths: string[], colors: string[]) {
  const stops = colors.map((color, index) =>
    `<stop offset="${colors.length === 1 ? 0 : (index / (colors.length - 1)) * 100}%" stop-color="${color}"/>`).join("");
  const body = paths.map((d) => `<path d="${d}" fill="none" stroke="url(#g)" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="470" height="470">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>`
    + `${body}<circle cx="50" cy="50" r="1.4" fill="${colors[0]}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default async function OgImage({ params }: { params: Promise<{ d: string }> }) {
  const shared = await decodeShare((await params).d);

  if (!shared) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0e1213", color: "#c9b16b", fontSize: 44, letterSpacing: 6 }}>
        ARCANA CARD
      </div>, size);
  }

  const metrics = getMetrics(shared.strokes);
  const colors = shared.attributes.map((id) => ATTRIBUTES[id].accent);
  const paths = shared.strokes.flatMap((stroke) => strokeCopies(stroke).map((points) => pathFor(points)));
  const backdrop = toneOf(shared.attributes) === "dark"
    ? "radial-gradient(circle at 30% 40%, #30213a 0%, #1a1422 45%, #0d0a11 100%)"
    : "radial-gradient(circle at 30% 40%, #35473f 0%, #1b2726 45%, #0d1112 100%)";

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: backdrop, color: "#f2e8d2", padding: 60 }}>
      <img src={circleDataUri(paths, colors)} width={470} height={470} alt="" />

      <div style={{ display: "flex", flexDirection: "column", marginLeft: 70, flex: 1 }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 8, color: "#c9b16b" }}>ARCANA CARD</div>

        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 22 }}>
          <div style={{ display: "flex", fontSize: 150, lineHeight: 1, fontWeight: 700, color: colors[0] }}>{String(metrics.power)}</div>
          <div style={{ display: "flex", fontSize: 30, marginLeft: 16, marginBottom: 22, color: "#9aa39a" }}>/ 999</div>
        </div>
        <div style={{ display: "flex", fontSize: 21, letterSpacing: 6, color: "#9aa39a", marginTop: 6 }}>MAGIC POWER</div>

        <div style={{ display: "flex", marginTop: 22, height: 8, width: 470, background: "#ffffff22" }}>
          <div style={{ display: "flex", width: Math.max(4, Math.min(470, (metrics.power / 999) * 470)), background: colors[0] }} />
        </div>

        <div style={{ display: "flex", fontSize: 36, marginTop: 26, letterSpacing: 4 }}>{GRADE_LABEL[metrics.grade] ?? "ARCANA"}</div>

        <div style={{ display: "flex", marginTop: 34 }}>
          {colors.map((color, index) => (
            <div key={index} style={{ display: "flex", width: 54, height: 54, marginRight: 14, borderRadius: 27, background: color, opacity: 0.9 }} />
          ))}
        </div>

        <div style={{ display: "flex", fontSize: 23, marginTop: 34, color: "#9aa39a", letterSpacing: 3 }}>
          {`${metrics.lines} STROKE${metrics.lines === 1 ? "" : "S"} / ${metrics.intersections} CROSSING${metrics.intersections === 1 ? "" : "S"}`}
        </div>
      </div>
    </div>, size);
}
