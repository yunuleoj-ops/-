import { describe, expect, test } from "vitest";

import { cardNameOf, MAX_NAME_LENGTH, sanitizeName } from "@/lib/naming";

describe("sanitizeName", () => {
  test("줄바꿈과 폭 0 문자를 걷어내고 공백을 하나로 줄인다", () => {
    expect(sanitizeName("  불의\n\n고리  ")).toBe("불의 고리");
    expect(sanitizeName("빛​의﻿ 검")).toBe("빛의 검");
  });

  test("문자열이 아니면 빈 문자열이다 — 링크는 아무 값이나 실어 올 수 있다", () => {
    expect(sanitizeName(undefined)).toBe("");
    expect(sanitizeName(42)).toBe("");
    expect(sanitizeName({ toString: () => "속임수" })).toBe("");
  });

  test("코드 포인트 단위로 자른다 — 서로게이트 쌍이 반쪽만 남지 않는다", () => {
    const long = "🔥".repeat(MAX_NAME_LENGTH + 6);
    const cut = sanitizeName(long);
    expect([...cut]).toHaveLength(MAX_NAME_LENGTH);
    expect(cut).toBe("🔥".repeat(MAX_NAME_LENGTH));
  });
});

describe("cardNameOf", () => {
  test("이름이 비면 속성이 정해 주는 능력명으로 돌아간다", () => {
    expect(cardNameOf("", ["fire"], 6)).toBe("태양의 불꽃");
    expect(cardNameOf("   ", ["fire"], 6)).toBe("태양의 불꽃");
    expect(cardNameOf(undefined, ["fire"], 6)).toBe("태양의 불꽃");
  });

  test("이름이 있으면 그 이름이 이긴다", () => {
    expect(cardNameOf("나의 첫 마법진", ["fire"], 6)).toBe("나의 첫 마법진");
  });
});
