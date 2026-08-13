// 마법진의 색과 빛. id 로 참조하는 물건이라 문서에 한 번만 정의한다 — 두 번 정의하면 어느 쪽이
// 이기는지 문서 순서가 정하고, 한 번도 정의하지 않으면(공유 화면에는 캔버스가 없다) 참조가 풀려
// 획이 단색으로 떨어진다. 같은 마법진이 화면마다 다른 색으로 보이는 원인이 그것이다.

export const GRADIENT_ID = "arcana-gradient";
export const GLOW_ID = "magic-glow";

export default function ArcanaDefs({ colors }: { colors: string[] }) {
  return <defs>
    <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
      {colors.map((color, index) => <stop key={`${color}-${index}`}
        offset={`${colors.length === 1 ? 0 : (index / (colors.length - 1)) * 100}%`} stopColor={color} />)}
    </linearGradient>
    <filter id={GLOW_ID}>
      <feGaussianBlur stdDeviation="0.65" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>;
}
