"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import ArcanaCard from "@/app/_components/ArcanaCard";
import ArcanaDefs from "@/app/_components/ArcanaDefs";
import FormulaSheet from "@/app/_components/FormulaSheet";
import { analyze } from "@/lib/analysis";
import { ATTRIBUTES, type Attribute } from "@/lib/attributes";
import type { Stroke } from "@/lib/geometry";
import { cardNameOf } from "@/lib/naming";
import { hasFormula } from "@/lib/sheet";

// 공유 링크로 들어온 사람은 그린 사람이 본 것과 같은 카드를 본다 — 앞뒤 뒤집기도, 전체 식 보기도,
// 파동 속도도 그대로다. 다른 점 셋: 이름을 고칠 수 없고, 닫을 화면이 없어 ✕ 가 없고,
// 아래 버튼이 「나도 마법진 그리기」다.

export default function SharedCard({ strokes, attributes, name }: {
  strokes: Stroke[];
  attributes: Attribute[];
  name: string;
}) {
  // 받는 쪽도 그린 쪽과 같은 식을 봐야 한다. analyze 는 순수 함수라 서버 렌더에서도 같은 값이 나온다.
  const analysis = useMemo(() => analyze(strokes), [strokes]);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const infos = attributes.map((id) => ATTRIBUTES[id]);
  const title = cardNameOf(name, attributes, analysis.metrics.rotation);

  // 여기엔 캔버스가 없다. 색과 빛을 정의하는 곳도 캔버스뿐이라, 이 화면에서는 이 숨은 svg 가 그 자리를
  // 대신한다 — 없으면 시트의 획이 그라디언트를 잃고 단색으로 떨어져 그린 사람이 본 색과 달라진다.
  return <>
    <svg className="arcana-defs" aria-hidden="true"><ArcanaDefs colors={infos.map((info) => info.accent)} /></svg>
    {/* 두 오버레이는 캔버스에서와 같이 상호 배타다. 시트를 닫으면 카드로 돌아온다. */}
    {formulaOpen
      ? <FormulaSheet analysis={analysis} onClose={() => setFormulaOpen(false)} />
      : <ArcanaCard title={title}
          attributeLabel={infos.map((info) => info.label).join(" · ")}
          description={infos.map((info) => info.description).join(" ")}
          analysis={analysis} hasFormula={hasFormula(analysis)}
          action={<Link className="share-circle" href="/">◈ 나도 마법진 그리기</Link>}
          onOpenFormula={() => setFormulaOpen(true)} />}
  </>;
}
