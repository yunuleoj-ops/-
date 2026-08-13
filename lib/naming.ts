// 카드 이름. 자동으로 붙는 능력명(lib/attributes.abilityOf) 위에 사용자가 직접 지은 이름을 덮는다.
// 이름은 이 서비스에서 사용자가 쓰고 남이 읽는 유일한 자유 텍스트라, 링크에 실리기 전에 여기서 한 번 다듬는다.

import { abilityOf, type Attribute } from "@/lib/attributes";

// 카드 앞면 한 줄에 들어가는 길이. 입력의 maxLength 와 링크 해석기가 같은 값을 본다.
export const MAX_NAME_LENGTH = 24;

// 제어문자(Cc)는 공백으로 바꾸고 서식문자(Cf)는 지운다. 줄바꿈 하나로 카드 레이아웃이 무너지고,
// 폭 0 문자는 "같아 보이는 다른 이름"을 만든다 — 그 자리를 공백으로 채우면 없던 띄어쓰기가 생긴다.
// U+2028·U+2029 는 아래 \s 정리가 함께 가져간다.
const CONTROL = /\p{Cc}/gu;
const FORMAT = /\p{Cf}/gu;

export const sanitizeName = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(CONTROL, " ").replace(FORMAT, "").replace(/\s+/g, " ").trim();
  // 코드 포인트로 자른다. slice 로 자르면 서로게이트 쌍이 반쪽만 남아 깨진 글자가 된다.
  return [...cleaned].slice(0, MAX_NAME_LENGTH).join("").trim();
};

// 사용자가 이름을 지웠으면 속성이 정해 주는 이름으로 돌아간다 — 이름 없는 카드는 만들지 않는다.
export const cardNameOf = (custom: string | undefined, picked: Attribute[], rotation: number): string =>
  sanitizeName(custom) || abilityOf(picked, rotation);
