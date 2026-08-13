import katex from "katex";

// KaTeX 는 렌더 중 DOM 을 만지지 않고 문자열만 돌려주므로 서버에서도 그대로 돈다.
// 넘기는 LaTeX 는 전부 lib/formatting.ts 가 만든 것이라 사용자 입력이 섞이지 않는다.
// throwOnError:false 로 두는 이유는 수식 하나가 잘못돼도 화면 전체가 죽지 않게 하기 위해서다 —
// 그 경우 KaTeX 가 붉은 원문을 그려 주므로 조용히 사라지지 않는다.
export default function TeX({ tex, block = false, className }: { tex: string; block?: boolean; className?: string }) {
  const html = katex.renderToString(tex, { throwOnError: false, displayMode: block, output: "html", strict: false });
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
