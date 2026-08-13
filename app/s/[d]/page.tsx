import Link from "next/link";
import type { Metadata } from "next";

import SharedCard from "@/app/s/[d]/SharedCard";
import { ATTRIBUTES, gradientFrom, toneOf } from "@/lib/attributes";
import { getMetrics } from "@/lib/metrics";
import { cardNameOf } from "@/lib/naming";
import { decodeShare } from "@/lib/share";

type Params = { params: Promise<{ d: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const shared = await decodeShare((await params).d);
  if (!shared) return { title: "마법진을 찾을 수 없습니다 · 마법연산자" };
  const metrics = getMetrics(shared.strokes);
  const title = cardNameOf(shared.name, shared.attributes, metrics.rotation);
  return {
    title: `${title} · 위력 ${metrics.power} · 마법연산자`,
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

  const { strokes, attributes, name } = shared;
  // 색과 톤은 서버에서 정한다 — 카드가 열리기 전 첫 페인트부터 속성 색이 맞는다.
  const colors = attributes.map((id) => ATTRIBUTES[id].accent);

  return <main className={`share ${toneOf(attributes)}`}
    style={{ "--accent": colors[0], "--accent-gradient": gradientFrom(colors), "--speed": "9s" } as React.CSSProperties}>
    <SharedCard strokes={strokes} attributes={attributes} name={name ?? ""} />
  </main>;
}
