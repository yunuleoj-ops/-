"use client";

import { useEffect, useRef, useState } from "react";

type Format = "plain" | "latex";

// 모달과 공유 카드가 같은 버튼을 쓴다. 어느 쪽을 눌렀는지 기억해 그 버튼에만 결과를 띄운다 —
// 둘 다 "복사됨"이 되면 무엇이 클립보드에 있는지 알 수 없다.
export default function CopyButtons(
  { plain, latex, className, labels }:
  { plain: string; latex: string; className?: string; labels?: { plain: string; latex: string } }
) {
  const text = labels ?? { plain: "평문으로 복사", latex: "LaTeX로 복사" };
  const [copied, setCopied] = useState<{ format: Format; ok: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async (format: Format) => {
    // 복사는 이 버튼의 유일한 목적이다. 실패를 조용히 삼키지 않는다(§4.7).
    try { await navigator.clipboard.writeText(format === "latex" ? latex : plain); setCopied({ format, ok: true }); }
    catch { setCopied({ format, ok: false }); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1800);
  };
  const label = (format: Format, idle: string) =>
    copied?.format !== format ? idle : copied.ok ? "복사됨" : "복사 실패";

  return <div className={className}>
    <button className="sheet-copy" onClick={() => copy("plain")}>{label("plain", text.plain)}</button>
    <button className="sheet-copy" onClick={() => copy("latex")}>{label("latex", text.latex)}</button>
  </div>;
}
