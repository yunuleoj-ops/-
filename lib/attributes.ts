// 여섯 속성과 상극 규칙. 캔버스와 공유 카드가 같은 이름·같은 색을 쓰도록 한 곳에 모아 둔다.

export type Attribute = "fire" | "wind" | "light" | "water" | "earth" | "dark";
export type Tone = "holy" | "dark";

// 상극은 opposite로 서로를 가리킨다. 세 쌍이므로 동시에 고를 수 있는 속성은 최대 세 개다.
export const ATTRIBUTES: Record<Attribute, {
  label: string; glyph: string; accent: string; opposite: Attribute;
  description: string; holy: string; dark: string;
}> = {
  fire: { label: "불", glyph: "✦", accent: "#ff4d3d", opposite: "water", description: "불꽃이 바깥으로 번집니다.", holy: "태양의 불꽃", dark: "지옥의 낙인" },
  wind: { label: "바람", glyph: "〰", accent: "#9be86b", opposite: "earth", description: "기류가 마법진을 휘감습니다.", holy: "천공의 날개", dark: "망령의 폭풍" },
  light: { label: "빛", glyph: "✧", accent: "#f6c65f", opposite: "dark", description: "빛의 입자가 천천히 바깥으로 퍼집니다.", holy: "여명의 계시", dark: "여명의 계시" },
  water: { label: "물", glyph: "◈", accent: "#2f9cff", opposite: "fire", description: "물결이 고요하게 맴돕니다.", holy: "성수의 파문", dark: "심해의 속박" },
  earth: { label: "땅", glyph: "◆", accent: "#9b6b3d", opposite: "wind", description: "대지의 기운이 아래로 가라앉습니다.", holy: "성역의 토대", dark: "암석의 감옥" },
  dark: { label: "어둠", glyph: "☾", accent: "#a877e8", opposite: "light", description: "어두운 입자가 맥동하며 중심으로 모입니다.", holy: "심연의 잠식", dark: "심연의 잠식" }
};

// 3열 배치에서 상극끼리 세로로 마주 보도록 늘어놓는다.
export const ATTRIBUTE_ORDER: Attribute[] = ["fire", "wind", "light", "water", "earth", "dark"];
export const ELEMENTAL: Attribute[] = ["fire", "wind", "water", "earth"];

export const isAttribute = (value: unknown): value is Attribute =>
  typeof value === "string" && value in ATTRIBUTES;

// 화면 순서대로 정렬하고 상극이 함께 들어온 경우 뒤에 온 쪽을 버린다. 공유 링크처럼 외부에서 온 값에 쓴다.
export const sanitizeAttributes = (values: unknown): Attribute[] => {
  const list = Array.isArray(values) ? values.filter(isAttribute) : [];
  const kept: Attribute[] = [];
  list.forEach((id) => {
    if (kept.includes(id)) return;
    if (kept.some((chosen) => ATTRIBUTES[chosen].opposite === id)) return;
    kept.push(id);
  });
  const ordered = ATTRIBUTE_ORDER.filter((id) => kept.includes(id));
  return ordered.length ? ordered : ["light"];
};

// 빛과 어둠은 상극이라 동시에 켜질 수 없으므로 어둠 여부만으로 톤이 정해진다.
export const toneOf = (picked: Attribute[]): Tone => picked.includes("dark") ? "dark" : "holy";

// 능력명은 원소 속성에서 뽑고, 빛/어둠만 골랐다면 그 자신의 이름을 쓴다.
export const abilityOf = (picked: Attribute[], rotation: number) => {
  const tone = toneOf(picked);
  const named = picked.filter((id) => ELEMENTAL.includes(id));
  if (named.includes("earth") && rotation >= 6) return tone === "holy" ? "육각 성벽" : "암석의 감옥";
  return (named.length ? named : picked).map((id) => ATTRIBUTES[id][tone]).join(" · ");
};

export const gradientFrom = (colors: string[]) =>
  colors.length > 1 ? `linear-gradient(135deg, ${colors.join(", ")})` : colors[0];
