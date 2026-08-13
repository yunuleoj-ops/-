"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import ArcanaCard from "@/app/_components/ArcanaCard";
import FormulaSheet from "@/app/_components/FormulaSheet";
import { analyze } from "@/lib/analysis";
import { ATTRIBUTES, type Attribute } from "@/lib/attributes";
import type { Stroke } from "@/lib/geometry";
import { cardNameOf } from "@/lib/naming";
import { hasFormula } from "@/lib/sheet";

// 공유 링크로 들어온 사람은 그린 사람이 본 것과 같은 카드를 본다 — 앞뒤 뒤집기도, 전체 식 보기도 그대로다.
// 다른 점 셋: 이름을 고칠 수 없고, 닫을 화면이 없어 ✕ 가 없고, 아래 버튼이 「나도 마법진 그리기」다.
const CYCLE = 9; // 캔버스의 "보통" 속도. 공유 화면에는 속도 선택이 없다.

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

  // 두 오버레이는 캔버스에서와 같이 상호 배타다. 시트를 닫으면 카드로 돌아온다.
  if (formulaOpen) return <FormulaSheet analysis={analysis} onClose={() => setFormulaOpen(false)} />;

  return <ArcanaCard title={title}
    attributeLabel={infos.map((info) => info.label).join(" · ")}
    description={infos.map((info) => info.description).join(" ")}
    cycle={CYCLE} analysis={analysis} hasFormula={hasFormula(analysis)}
    action={<Link className="share-circle" href="/">◈ 나도 마법진 그리기</Link>}
    onOpenFormula={() => setFormulaOpen(true)} />;
}
