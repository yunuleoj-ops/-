import Link from "next/link";
import type { Metadata } from "next";

import { analyze } from "@/lib/analysis";
import { abilityOf, ATTRIBUTES, gradientFrom, toneOf } from "@/lib/attributes";
import { formatAccuracy, formatLatex, formatSummarySentence, structureTex } from "@/lib/formatting";
import { sheetPlainText } from "@/lib/sheet";
import CopyButtons from "@/app/_components/CopyButtons";
import TeX from "@/app/_components/TeX";
import { pathFor, STROKE_WIDTH, strokeCopies } from "@/lib/geometry";
import { getMetrics } from "@/lib/metrics";
import { decodeShare } from "@/lib/share";

type Params = { params: Promise<{ d: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const shared = await decodeShare((await params).d);
  if (!shared) return { title: "마법진을 찾을 수 없습니다 · 마법연산자" };
  const metrics = getMetrics(shared.strokes);
  const ability = abilityOf(shared.attributes, metrics.rotation);
  return {
    title: `${ability} · 위력 ${metrics.power} · 마법연산자`,
    description: `${shared.attributes.map((id) => ATTRIBUTES[id].label).join(" · ")} 속성 · ${metrics.grade} 등급 마법진입니다.`
  };
}

export default async function SharePage({ params }: Params) {
  const shared = await decodeShare((await params).d);

  if (!shared) {
    return <main className="share holy">
      <div className="share-card share-empty">
        <small>ARCANA CARD</small>
        <h1>마법진을 읽을 수 없습니다</h1>
        <p>링크가 잘렸거나 손상된 것 같습니다. 보낸 사람에게 주소 전체를 다시 받아 보세요.</p>
        <Link className="share-cta" href="/">내 마법진 그리러 가기 <span>→</span></Link>
      </div>
    </main>;
  }

  const { strokes, attributes } = shared;
  const metrics = getMetrics(strokes);
  // 받는 쪽도 그린 쪽과 같은 식을 봐야 한다. analyze 는 순수 함수라 서버에서 그대로 돈다.
  const analysis = analyze(strokes);
  const silhouette = analysis.silhouette;
  const tone = toneOf(attributes);
  const infos = attributes.map((id) => ATTRIBUTES[id]);
  const colors = infos.map((info) => info.accent);
  const ability = abilityOf(attributes, metrics.rotation);
  const description = infos.map((info) => info.description).join(" ");

  return <main className={`share ${tone}`} style={{ "--accent": colors[0], "--accent-gradient": gradientFrom(colors) } as React.CSSProperties}>
    <div className="share-card">
      <small>ARCANA CARD</small>
      <h1>{ability}</h1>
      <div className="share-attributes">
        {infos.map((info) => <span key={info.label} style={{ "--element": info.accent } as React.CSSProperties}><i>{info.glyph}</i>{info.label}</span>)}
      </div>

      <svg className="share-circle-art" viewBox="0 0 100 100" role="img" aria-label={`${ability} 마법진`}>
        <defs>
          <linearGradient id="share-gradient" x1="0" y1="0" x2="1" y2="1">
            {colors.map((color, index) => <stop key={`${color}-${index}`} offset={`${colors.length === 1 ? 0 : (index / (colors.length - 1)) * 100}%`} stopColor={color} />)}
          </linearGradient>
        </defs>
        {strokes.flatMap((stroke, index) => strokeCopies(stroke).map((points, copy) =>
          <path key={`${index}-${copy}`} d={pathFor(points, stroke.closure === "closed")} fill="none" strokeLinecap="round" strokeLinejoin="round"
            style={{ stroke: "url(#share-gradient)", strokeWidth: STROKE_WIDTH }} />))}
        <circle cx="50" cy="50" r="1.5" fill="var(--accent)" />
      </svg>

      <div className="share-power">
        <span>MAGIC POWER</span><b>{metrics.power}</b><i>/ 999</i>
        <div><em style={{ width: `${Math.min(100, metrics.power / 3.2)}%` }} /></div>
        <strong>{metrics.grade}</strong>
      </div>

      <dl className="share-stats">
        <div><dt>선의 개수</dt><dd>{metrics.lines}</dd></div>
        <div><dt>교차점</dt><dd>{metrics.intersections}</dd></div>
        <div><dt>좌우 대칭</dt><dd>{metrics.horizontal}%</dd></div>
        <div><dt>상하 대칭</dt><dd>{metrics.vertical}%</dd></div>
      </dl>

      <p className="share-description">{description}</p>
      <div className="share-formula">
        <TeX tex={structureTex(analysis)} block />
        <span className="share-formula-note">{formatSummarySentence(analysis)} · 정확도 {formatAccuracy(analysis.accuracy)}</span>
      </div>
      {silhouette && <code className="share-silhouette">외곽 실루엣 (참고) {silhouette}</code>}
      <CopyButtons className="share-copy" plain={sheetPlainText(analysis)} latex={formatLatex(analysis)} />

      <Link className="share-cta" href="/">나도 마법진 그리기 <span>→</span></Link>
    </div>
  </main>;
}
