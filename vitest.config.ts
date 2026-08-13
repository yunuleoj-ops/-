// 앱과 테스트가 같은 import 문(`@/lib/...`)을 쓰게 하는 유일한 설정.
// Vitest는 tsconfig의 paths를 스스로 읽지 않는다 — 스펙 §7의 서술은 실측에서 거짓이고,
// 설정 없이 "@/lib/geometry"를 import하면 Cannot find package로 죽는다.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tsconfig.json의 "paths": { "@/*": ["./*"] } 와 같은 뜻이다. 한쪽만 고치면 앱과 테스트가 갈라진다.
const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: root }] },
  // 스펙 §7: 테스트 범위는 lib/ 순수 함수로 엄격히 제한한다. jsdom도 컴포넌트 테스트도 없다.
  test: { include: ["lib/**/*.test.ts"] }
});
