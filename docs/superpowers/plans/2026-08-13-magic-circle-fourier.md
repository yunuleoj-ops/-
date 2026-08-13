# 마법진 획별 복소 푸리에 분해 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 그린 마법진의 각 획을 복소 푸리에 급수로 분해하고, 대칭을 계수 위 연산자로 표현해, 도형을 임의 정확도로 재현하는 수학식을 화면에 보여준다.

**Architecture:** 획을 호길이로 균등 재샘플한 뒤 닫힌 획은 복소 지수급수로, 열린 획은 현(chord)을 분리하고 잔차를 사인급수로 전개한다. 항은 진폭 상위부터 파스발 꼬리 에너지가 목표에 닿을 때까지 그리디로 고른다. 회전·반사 복사본은 다시 적합하지 않고 계수에 위상을 곱하거나 켤레를 취해 유도한다. 결과는 푸터의 요약 문장과 「식 보기」 모달의 재구성 오버레이로 표시한다.

**Tech Stack:** TypeScript (strict), React 19, Next.js 15 App Router, Vitest (신규 도입, `lib/` 순수 함수 전용). 런타임 의존성 추가 없음. FFT 없음, Web Worker 없음.

**Spec:** [docs/superpowers/specs/2026-08-13-magic-circle-fourier-design.md](../specs/2026-08-13-magic-circle-fourier-design.md)

## Global Constraints

모든 태스크의 요구사항에 아래가 암묵적으로 포함된다. 값은 스펙에서 그대로 옮긴 것이며 임의로 바꾸지 않는다.

**좌표계** — `z = conj(p − 50 − 50i) = (x − 50) + i(50 − y)`. 분석 진입 시 단 한 번 적용하고, 이후 모든 계수·연산자·수식은 원점 중심 수학 좌표에서만 정의된다.

**획 분류** (커밋 시 1회 판정 후 `Stroke.closure`에 동결, 재계산에서 재판정 없음)
- `L < 1.0` → `"point"`
- `L > 18` 그리고 `g ≤ min(8, max(1.5, 0.03·L))` → `"closed"`
- 그 외 → `"open"`

분석용 임계는 게임용 임계(`L > 18 ∧ g < 8`)의 **진부분집합**이다. `getMetrics`의 `closed` 판정과 `power`·`grade` 공식은 이 작업에서 **한 글자도 바꾸지 않는다** — 같은 그림의 MAGIC POWER와 등급이 움직이면 안 된다.

**상한값**

| 값 | 확정 |
|---|---|
| 밀집 폴리라인 간격 | 0.25단위, `|D| ≤ 4096` |
| 표본 수 P | `clamp(round(2L), 128, 512)`, 짝수 |
| 후보 대역 K_max | `min(floor(P/4), 64)` |
| 유지 항 상한 T_max | 24 |
| 오버레이 재구성 점수 Q | `clamp(8·max|n|, 64, 512)` |
| 전역 항 예산 | 없음 |
| 획 수 상한 | 없음(계측만) |
| Web Worker | 없음 (동기 작업 50ms 초과가 도입 기준선) |

**정지 조건** (셋 중 하나 충족 시 종료)
1. `e_A ≤ (1 − 0.99)·S`
2. `e_A ≤ 0.15` 캔버스 단위
3. `|A| = T_max = 24`

`c₀`(닫힘)와 `z₀`·`Δ`(열림)는 무조건 포함하고 항 수에 세지 않는다. **최소 항 하한을 두지 않는다** — 직선이 0항이어야 하기 때문이다.

**정확도 분모** — 앱 전체에 하나만 존재한다: `S = sqrt(mean_k |z_k − mean(z)|²)` (표본의 중심 대비 RMS 거리). bbox 대각선(회전 비불변), 획 길이(길이 보상), 원점 거리(중심 통과 시 폭발)는 전부 기각됐다.

**대칭 연산자** — 복사본을 다시 적합하지 않는다.
- 회전 `C_m`: `ω = e^(2πi/m)`, 복사본 `k`는 `ω^k` 곱
- 반사: `mirrorX`(세로축)는 `M z = −z̄`, `mirrorY`(가로축)는 `M z = z̄`
- 닫힘 계수: 회전 `c_n ↦ ω^k c_n` / 반사 `c_n ↦ e^(2iφ)·conj(c_{−n})` ← **인덱스가 −n으로 뒤집힌다**
- 열림 계수: 회전 `(z₀,Δ,b_n) ↦ ω^k·(…)` / 반사 `(z₀,Δ,b_n) ↦ e^(2iφ)·(conj z₀, conj Δ, conj b_n)` ← 사인은 실수 기저라 인덱스 뒤집힘 없음

**정확도 표기** — 앱 전체에서 정확도를 문자열로 만드는 함수는 `lib/formatting.ts`의 `formatAccuracy(accuracy: number | null): string` **하나뿐**이다. 소수점 한 자리, 99.9% 클램프, `null`이면 `"—"`. `polarFormula.accuracy`는 **UI 어디에도 노출하지 않는다**.

**금지 문구** — 정준화를 채택하지 않으므로 시작점·방향에 따라 계수가 달라진다. **"같은 모양이면 같은 식"이라는 문구를 UI와 문서 어디에도 쓰지 않는다.**

**테스트** — Vitest, `lib/**/*.test.ts`만. jsdom 없음, testing-library 없음, 컴포넌트 테스트 없음. 별칭은 `vitest.config.ts`의 `resolve.alias`로 건다 (스펙 §7의 "tsconfig paths를 그대로 읽는다"는 서술은 실측에서 거짓이었다).

**검증 명령** — 타입 검사는 `npx tsc --noEmit`. **`npm run build`를 돌리지 마라** — dev 서버와 `.next`를 공유해 프로덕션 산출물이 dev 청크를 덮어쓰면 앱이 죽는다.

**커밋** — 저장소 관례에 따라 짧은 영문 한 줄 (`add fourier design spec`, `6 attributes with opposite pairs`). 커밋 전 `git fetch`로 원격 변경을 확인한다.

## 태스크 의존 순서

```
Task 1 (Vitest + pathFor closed)
  └ Task 2 (id·closure·storage·StrokeLayer·입력단 살균)
      └ Task 3 (resample + closure 동결 배선)   ← 이게 빠지면 닫힘 경로가 앱에서 죽는다
          ├ Task 4 (닫힘 DFT + 항 선택 + 공유 구조)
          │   ├ Task 5 (열림 DST-I + open 분기)  ← 이게 빠지면 오버레이가 빈 화면
          │   └ Task 6 (applyOperator)
          └ Task 7 (polar 분리 + analysis + useMemo 2단)
              └ Task 8 (formatting)
                  └ Task 9 (푸터)
                      └ Task 10 (FormulaSheet 모달)
                          └ Task 11 (ArcanaCard 카드 뒷면 + 진입 경로)
```

## 이번 범위 밖

스펙 §6이 인접 결함으로 나열했으나 이 계획에서 다루지 않는 것 — 별도 이슈로 남긴다.

- **E18** 지우개가 제어점 거리로 판정한다(점-선분 거리가 아니다). 곡선 중간을 지우려 해도 안 지워지는 경우가 있다.
- **E19** `simplify`의 재귀 깊이에 상한이 없다. 극단적으로 긴 획에서 스택 위험.
- **Q1 위력 편입** 항 수를 `power` 공식에 넣는 것은 v2. 이번에는 analysis 패널에 **표시만** 한다.
- **에피사이클 애니메이션** v2. `Spectrum`이 이미 필요한 정보를 담고 있고 정준화를 하지 않으므로 나중에 붙여도 계수가 바뀌지 않는다.

---

### Task 1: Vitest 도입, 기하 회귀 안전망, `pathFor`의 닫힘 인자

**Files:**
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/geometry.test.ts`
- Create: `/Users/yoma/projects/jamcoding/jangyunu/vitest.config.ts` (D-H)
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/geometry.ts` — `pathFor`에만 손댄다(36~51번 줄). 다른 함수는 한 글자도 바꾸지 않는다 (D-A)
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/package.json` — `scripts` 블록(6~11번 줄)에 `"test"` 추가. `devDependencies` 블록은 `npm i -D vitest`가 `dependencies`(12~20번 줄) 뒤에 직접 써넣는다. `package-lock.json`도 같이 갱신된다
- Test: `/Users/yoma/projects/jamcoding/jangyunu/lib/geometry.test.ts`

**Interfaces:**

*Consumes* — 현재 `lib/geometry.ts`(커밋 `9780947` 시점)의 공개 표면:
```ts
type Point = { x: number; y: number }
type Symmetry = "free" | "mirrorX" | "mirrorY" | "rotate"
type Stroke = { points: Point[]; symmetry: Symmetry; rotationCount: number }   // 아직 id/closure 없음
pathFor(points: Point[]): string
curvePoints(points: Point[]): Point[]
transformPoint(point: Point, symmetry: Symmetry, count: number, copy: number): Point
copiesFor(symmetry: Symmetry, count: number): number
strokeCopies(stroke: Stroke): Point[][]
```

*Produces* — 뒤 태스크가 의존하는 것:

1. **`npm test` → `vitest run`** (테스트 러너 진입점). 이후 모든 태스크의 red/green 확인 명령이 이것 하나다. `vitest`(watch)가 아니라 `vitest run`인 이유: 계획 실행이 비대화형이라 watch 모드는 종료하지 않는다.

2. **`devDependencies: { "vitest": "^4.1.10" }`** (실측 설치 버전 `vitest@4.1.10`).

3. **`vitest.config.ts` — 이 태스크에서 만들고, 뒤 태스크는 다시 만들지 않는다** (D-H, 리뷰 1-H·4-E). `resolve.alias`로 `@/` → 프로젝트 루트를 걸어 **앱과 테스트가 같은 import 문(`@/lib/...`)을 쓴다.** 스펙 §7의 "Vitest가 tsconfig의 `paths`를 그대로 읽는다"는 서술은 **실측에서 거짓**이다 — 설정 없이 `import { pathFor } from "@/lib/geometry"`를 실행하면:
   ```
    FAIL  lib/alias-probe.test.ts [ lib/alias-probe.test.ts ]
   Error: Cannot find package '@/lib/geometry' imported from .../lib/alias-probe.test.ts
   ```
   그래서 별칭을 설정 파일에 명시한다. 이 태스크 **자신의 테스트도 `@/lib/geometry`로 import한다**(별칭이 실제로 동작한다는 증거가 Step 4의 green이다). Task 2·3은 설정 파일을 "이미 있음"으로 전제하고, Task 9도 상대 경로를 쓰지 않는다. `test.include: ["lib/**/*.test.ts"]`로 범위를 `lib/` 순수 함수에 못 박는다(스펙 §7의 "jsdom 없음, 컴포넌트 테스트 없음"을 설정으로 강제).

4. **`pathFor(points: Point[], closed = false): string`** (D-A). `closed`면 반환 문자열 **끝에 ` Z`**를 붙인다(빈 배열은 `closed`여도 `""`). 인자를 주지 않은 호출은 **바이트 단위로 기존과 동일**하다 — Step 8에서 20000회 무작위 입력으로 증명한다. 스펙 §1.2의 "정확도의 진리값은 화면에 그려진 곡선"과 "닫힘 획은 렌더에서도 실제로 닫는다"에 따라 **두 번째 인자를 넘겨야 하는 호출부는 다음 넷**이다(현재는 전부 1인자):
   - `app/page.tsx:149` — 캔버스 렌더 루프. Task 2가 `StrokeLayer`로 추출하면서 `pathFor(points, stroke.closure === "closed")`로 바꾼다
   - `app/s/[d]/page.tsx:59` — 공유 페이지 렌더 루프
   - `app/s/[d]/opengraph-image.tsx:41` — OG 이미지. `strokeCopies(stroke).map((points) => pathFor(points, stroke.closure === "closed"))`
   - 모달 오버레이의 `originalPaths` — Task 10
   
   `Stroke.closure` 필드는 Task 2가 도입하므로 **캔버스·공유 페이지·OG 이미지 세 곳은 Task 2의 커밋에서 함께 바꾼다.** 값이 실제로 참이 되는 것은 Task 3이 `classifyClosure` 동결을 배선한 뒤다(D-J).

5. **`lib/geometry.test.ts`의 `strokeOf` 헬퍼** — 이 파일에 존재하는 **유일한 `Stroke` 리터럴**이다:
   ```ts
   const strokeOf = (symmetry: Symmetry, rotationCount: number, points: Point[]): Stroke => ({ points, symmetry, rotationCount });
   ```
   **Task 2가 반드시 해야 할 일(리뷰 1-I):** `Stroke`에 `id: string`과 `closure: Closure`를 추가하는 순간 이 한 줄이 타입 오류가 된다. `tsconfig.json`의 `include`가 `**/*.ts`이므로 `lib/geometry.test.ts`도 **타입 검사 대상**이다 — Task 2가 `strokeOf`를 고치기 전에는 `npx tsc --noEmit`에 **`lib/geometry.test.ts`의 오류가 추가로 뜬다.** Task 2는 반환 객체에 `id: "s1"`, `closure: "open"`을 더하고 `npm test`로 **23개 통과**를 재확인한다(19개가 아니다 — 이 태스크가 `pathFor` 테스트 4개를 더 만든다).

6. 뒤 태스크가 재사용할 픽스처 상수: `TRIANGLE = [{20,20},{80,20},{80,80}]`, `SQUARE = TRIANGLE + {20,80}`.

7. **`npm test` 첫머리에 Vite 경고 배너가 뜬다** — 무해하고 종료 코드는 0이다:
   ```
   (!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, ...
     - ESM syntax in a file loaded as CommonJS (vitest.config.ts:3:1). ...
   ```
   `package.json`에 `"type": "module"`이 없어서 Vite가 설정 파일을 CJS로 읽기 때문이다. `"type": "module"`을 넣으면 Next.js 쪽이 영향을 받으므로 **넣지 않는다.** 뒤 태스크의 기대 출력에서는 이 세 줄을 생략한다.

*이 태스크의 red/green*: 앞부분(Step 1~5)은 구현이 없다 — red는 "러너가 없다", green은 "러너가 붙고 현재 출력이 고정됐다"이고, 안전망이 실제로 회귀를 잡는다는 증명은 Step 5의 의도적 파손으로 한다. 뒷부분(Step 6~8)만 진짜 TDD다(`closed` 인자).

---

- [ ] **Step 1: 회귀 테스트 파일 작성 (스냅샷 19개)**

`/Users/yoma/projects/jamcoding/jangyunu/lib/geometry.test.ts` 를 새로 만든다. 모든 기대값은 현재 구현을 실제 실행해 얻은 출력이다(추정값 없음).

```ts
// 리팩터가 화면에 그려지는 결과를 바꾸지 않았는지 확인하는 회귀 테스트.
// 값은 현재 구현의 실제 출력이며, 여기가 깨지면 그림이 달라진 것이다.
import { describe, expect, it } from "vitest";

import { copiesFor, curvePoints, pathFor, strokeCopies, transformPoint, type Point, type Stroke, type Symmetry } from "@/lib/geometry";

const TRIANGLE: Point[] = [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }];
const SQUARE: Point[] = [...TRIANGLE, { x: 20, y: 80 }];
// Task 2에서 Stroke에 id/closure가 붙으면 이 한 줄만 고치면 된다.
const strokeOf = (symmetry: Symmetry, rotationCount: number, points: Point[]): Stroke => ({ points, symmetry, rotationCount });

describe("pathFor", () => {
  it("점이 없으면 빈 문자열", () => {
    expect(pathFor([])).toBe("");
  });

  it("1점은 M 명령 하나", () => {
    expect(pathFor([{ x: 10, y: 20 }])).toBe("M10.00 20.00");
  });

  it("2점은 직선 L", () => {
    expect(pathFor([{ x: 10, y: 20 }, { x: 30, y: 40 }])).toBe("M10.00 20.00 L30.00 40.00");
  });

  it("3점은 큐빅 베지어 2개", () => {
    expect(pathFor(TRIANGLE)).toBe("M20.00 20.00 C30.00 20.00 70.00 10.00 80.00 20.00 C90.00 30.00 80.00 70.00 80.00 80.00");
  });

  it("4점은 큐빅 베지어 3개", () => {
    expect(pathFor(SQUARE)).toBe("M20.00 20.00 C30.00 20.00 70.00 10.00 80.00 20.00 C90.00 30.00 90.00 70.00 80.00 80.00 C70.00 90.00 30.00 80.00 20.00 80.00");
  });

  it("좌표는 소수 둘째 자리로 고정한다", () => {
    expect(pathFor([{ x: 1 / 3, y: 2 / 3 }, { x: 99.999, y: 0.005 }])).toBe("M0.33 0.67 L100.00 0.01");
  });
});

describe("curvePoints", () => {
  it("점이 3개 미만이면 입력 배열을 그대로 돌려준다", () => {
    const two: Point[] = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    expect(curvePoints(two)).toBe(two);
  });

  it("세그먼트마다 8등분 + 시작점", () => {
    expect(curvePoints(TRIANGLE)).toHaveLength(17);
    expect(curvePoints(SQUARE)).toHaveLength(25);
  });

  it("샘플이 제어점을 정확히 지난다", () => {
    const sampled = curvePoints(TRIANGLE);
    expect(sampled[0]).toEqual({ x: 20, y: 20 });
    expect(sampled[8]).toEqual({ x: 80, y: 20 });
    expect(sampled[16]).toEqual({ x: 80, y: 80 });
  });

  it("세그먼트 중앙의 좌표를 고정한다", () => {
    const sampled = curvePoints(TRIANGLE);
    expect(sampled[4]).toEqual({ x: 50, y: 16.25 });
    expect(sampled[12]).toEqual({ x: 83.75, y: 50 });
  });
});

describe("transformPoint", () => {
  const p: Point = { x: 80, y: 30 };

  it("free는 복사본 인덱스와 무관하게 그대로", () => {
    expect(transformPoint(p, "free", 6, 0)).toEqual({ x: 80, y: 30 });
    expect(transformPoint(p, "free", 6, 1)).toEqual({ x: 80, y: 30 });
  });

  it("mirrorX는 1번 사본의 x를 100에서 뺀다", () => {
    expect(transformPoint(p, "mirrorX", 2, 0)).toEqual({ x: 80, y: 30 });
    expect(transformPoint(p, "mirrorX", 2, 1)).toEqual({ x: 20, y: 30 });
  });

  it("mirrorY는 1번 사본의 y를 100에서 뺀다", () => {
    expect(transformPoint(p, "mirrorY", 2, 0)).toEqual({ x: 80, y: 30 });
    expect(transformPoint(p, "mirrorY", 2, 1)).toEqual({ x: 80, y: 70 });
  });

  it("rotate 0번 사본은 항등", () => {
    expect(transformPoint(p, "rotate", 4, 0)).toEqual({ x: 80, y: 30 });
  });

  it("rotate는 (50,50) 둘레를 화면 시계방향으로 돈다", () => {
    const q = transformPoint({ x: 50, y: 20 }, "rotate", 6, 1);
    expect(q.x).toBeCloseTo(50 + 30 * Math.sin(Math.PI / 3), 10);
    expect(q.y).toBeCloseTo(35, 10);
  });
});

describe("copiesFor", () => {
  it("free 1개 · 거울 2개 · 회전은 지정 수", () => {
    expect(copiesFor("free", 6)).toBe(1);
    expect(copiesFor("mirrorX", 6)).toBe(2);
    expect(copiesFor("mirrorY", 6)).toBe(2);
    expect(copiesFor("rotate", 2)).toBe(2);
    expect(copiesFor("rotate", 6)).toBe(6);
  });
});

describe("strokeCopies", () => {
  it("free는 사본 1개", () => {
    expect(strokeCopies(strokeOf("free", 6, [{ x: 1, y: 2 }]))).toEqual([[{ x: 1, y: 2 }]]);
  });

  it("mirrorX는 원본과 반사본 2개", () => {
    expect(strokeCopies(strokeOf("mirrorX", 6, [{ x: 80, y: 30 }, { x: 90, y: 40 }]))).toEqual([
      [{ x: 80, y: 30 }, { x: 90, y: 40 }],
      [{ x: 20, y: 30 }, { x: 10, y: 40 }]
    ]);
  });

  it("rotate 4겹은 사본 4개이고 0번이 원본", () => {
    const copies = strokeCopies(strokeOf("rotate", 4, [{ x: 80, y: 50 }]));
    expect(copies).toHaveLength(4);
    expect(copies[0]).toEqual([{ x: 80, y: 50 }]);
    expect(copies[1][0].x).toBeCloseTo(50, 10);
    expect(copies[1][0].y).toBeCloseTo(80, 10);
    expect(copies[2][0].x).toBeCloseTo(20, 10);
    expect(copies[2][0].y).toBeCloseTo(50, 10);
    expect(copies[3][0].x).toBeCloseTo(50, 10);
    expect(copies[3][0].y).toBeCloseTo(20, 10);
  });
});
```

세 가지 선택의 근거(임의로 바꾸지 마라):
- `mirrorX`/`mirrorY`/`free`/`rotate copy 0`는 부동소수 연산이 전혀 없어 `toEqual`로 **정확 비교**가 가능하다. 회전 사본만 `toBeCloseTo(…, 10)`을 쓴다 — 실측에서 `rotate 4겹` 2번 사본이 `20.000000000000004`로 나온다.
- `curvePoints`가 3점 미만에서 **입력 배열을 그대로(같은 참조로) 반환**한다는 것을 `toBe`로 고정한다. 복사본을 반환하도록 리팩터하면 여기서 잡힌다.
- `pathFor` 마지막 케이스는 `toFixed(2)` 반올림 자체를 고정한다(`0.005 → "0.01"`, `99.999 → "100.00"`).

- [ ] **Step 2: red 확인 — 러너가 없다**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npm test
```

예상 출력(종료 코드 1, 실측):
```
npm error Missing script: "test"
npm error
npm error To see a list of scripts, run:
npm error   npm run
npm error A complete log of this run can be found in: /Users/yoma/.npm/_logs/....log
```

- [ ] **Step 3: Vitest 설치 · `vitest.config.ts` · npm 스크립트**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npm i -D vitest
```
(실측: `vitest@4.1.10`이 설치되고 `package.json`에 `"devDependencies": { "vitest": "^4.1.10" }`가 생긴다.)

`/Users/yoma/projects/jamcoding/jangyunu/vitest.config.ts` 를 새로 만든다:

```ts
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
```

`fileURLToPath(new URL("./", …))`는 `/…/jangyunu/`처럼 슬래시로 끝나므로 `find`를 `/^@\//`(슬래시 포함)로 두어 `@/lib/geometry` → `/…/jangyunu/lib/geometry`가 되게 한다. 객체 형태(`alias: { "@": root }`)를 쓰면 경로에 `//`가 끼어든다.

그다음 `package.json`의 `scripts` 블록(6~11번 줄)을 다음으로 바꾼다:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
```

- [ ] **Step 4: green 확인 — 19개 통과 + 별칭 해석 증명**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npm test
```

예상 출력(종료 코드 0, 실측):
```
> arcana-drafter@0.1.0 test
> vitest run

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:3:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.10 /Users/yoma/projects/jamcoding/jangyunu


 Test Files  1 passed (1)
      Tests  19 passed (19)
   Start at  ...
   Duration  ~0.1s (transform ..., setup 0ms, import ..., tests ~4ms, environment 0ms)
```

`(!)` 세 줄은 Produces 7의 무해한 경고다. `19 passed`가 아니면 멈춘다. `Cannot find package '@/lib/geometry'`가 보이면 `vitest.config.ts`의 `find`/`replacement`를 다시 본다 — 이 줄이 안 나오는 것 자체가 별칭이 살아 있다는 증거다.

- [ ] **Step 5: 안전망이 실제로 회귀를 잡는지 증명 (의도적 파손 → 원복)**

`lib/geometry.ts` 9번 줄을 일시적으로 바꾼다:

```ts
export const CURVE_STEPS = 6;
```

```
cd /Users/yoma/projects/jamcoding/jangyunu && npm test
```

예상 출력(종료 코드 1, 실측 — 정확히 3개가 깨진다):
```
 ❯ lib/geometry.test.ts (19 tests | 3 failed) 8ms
     × 세그먼트마다 8등분 + 시작점 3ms
     × 샘플이 제어점을 정확히 지난다 1ms
     × 세그먼트 중앙의 좌표를 고정한다 0ms

 FAIL  lib/geometry.test.ts > curvePoints > 세그먼트마다 8등분 + 시작점
AssertionError: expected [ { x: 20, y: 20 }, …(12) ] to have a length of 17 but got 13

 FAIL  lib/geometry.test.ts > curvePoints > 샘플이 제어점을 정확히 지난다
AssertionError: expected { x: 84.44444444444444, …(1) } to deeply equal { x: 80, y: 20 }

 FAIL  lib/geometry.test.ts > curvePoints > 세그먼트 중앙의 좌표를 고정한다
AssertionError: expected { x: 62.22222222222222, …(1) } to deeply equal { x: 50, y: 16.25 }

 Test Files  1 failed (1)
      Tests  3 failed | 16 passed (19)
```

확인했으면 즉시 원복한다. 이 시점의 `lib/geometry.ts`는 아직 HEAD와 같아야 하므로 `git checkout`으로 되돌릴 수 있다(Step 7에서 처음으로 진짜 수정이 들어간다):

```
cd /Users/yoma/projects/jamcoding/jangyunu && git checkout -- lib/geometry.ts && git diff --stat lib/geometry.ts && npm test
```

`git diff --stat`이 빈 출력이고 다시 `Tests  19 passed (19)`가 나와야 한다.

- [ ] **Step 6: red — `pathFor(points, closed)` 테스트 4개 추가**

`lib/geometry.test.ts`의 `describe("pathFor", …)` 안, `"좌표는 소수 둘째 자리로 고정한다"` 블록 **바로 다음**에 네 개를 덧붙인다. 기존 6개는 한 글자도 건드리지 않는다 — 그 6개가 "기본 경로 불변"의 증인이기 때문이다(D-A).

```ts
  it("closed면 끝에 Z를 붙여 실제로 닫는다", () => {
    expect(pathFor(TRIANGLE, true)).toBe("M20.00 20.00 C30.00 20.00 70.00 10.00 80.00 20.00 C90.00 30.00 80.00 70.00 80.00 80.00 Z");
  });

  it("closed 기본값은 false이고 명시해도 열린 출력과 한 글자도 다르지 않다", () => {
    expect(pathFor(TRIANGLE, false)).toBe(pathFor(TRIANGLE));
    expect(pathFor(SQUARE, false)).toBe(pathFor(SQUARE));
  });

  it("2점 직선도 닫을 수 있다", () => {
    expect(pathFor([{ x: 10, y: 20 }, { x: 30, y: 40 }], true)).toBe("M10.00 20.00 L30.00 40.00 Z");
  });

  it("점이 없으면 closed여도 빈 문자열", () => {
    expect(pathFor([], true)).toBe("");
  });
```

```
cd /Users/yoma/projects/jamcoding/jangyunu && npm test
```

예상 출력(종료 코드 1, 실측 — 두 번째 인자가 무시되므로 2개가 깨진다):
```
 ❯ lib/geometry.test.ts (23 tests | 2 failed) 7ms
     × closed면 끝에 Z를 붙여 실제로 닫는다 3ms
     × 2점 직선도 닫을 수 있다 1ms

 FAIL  lib/geometry.test.ts > pathFor > closed면 끝에 Z를 붙여 실제로 닫는다
AssertionError: expected 'M20.00 20.00 C30.00 20.00 70.00 10.00…' to be 'M20.00 20.00 C30.00 20.00 70.00 10.00…' // Object.is equality

Expected: "M20.00 20.00 C30.00 20.00 70.00 10.00 80.00 20.00 C90.00 30.00 80.00 70.00 80.00 80.00 Z"
Received: "M20.00 20.00 C30.00 20.00 70.00 10.00 80.00 20.00 C90.00 30.00 80.00 70.00 80.00 80.00"

 FAIL  lib/geometry.test.ts > pathFor > 2점 직선도 닫을 수 있다
AssertionError: expected 'M10.00 20.00 L30.00 40.00' to be 'M10.00 20.00 L30.00 40.00 Z' // Object.is equality

 Test Files  1 failed (1)
      Tests  2 failed | 21 passed (23)
```

타입 쪽 red도 같이 확인한다:

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit
```

예상 출력(종료 코드 2, 실측 — 2인자 호출이 5군데다):
```
lib/geometry.test.ts(38,30): error TS2554: Expected 1 arguments, but got 2.
lib/geometry.test.ts(42,30): error TS2554: Expected 1 arguments, but got 2.
lib/geometry.test.ts(43,28): error TS2554: Expected 1 arguments, but got 2.
lib/geometry.test.ts(47,58): error TS2554: Expected 1 arguments, but got 2.
lib/geometry.test.ts(51,24): error TS2554: Expected 1 arguments, but got 2.
```

- [ ] **Step 7: green — `pathFor`에 `closed` 인자 구현**

`lib/geometry.ts`의 35~51번 줄(`pathFor` 전체)을 다음으로 바꾼다. 루프 본문은 그대로이고 바뀌는 것은 시그니처·`close` 상수·세 개의 return 뿐이다:

```ts
// Catmull-Rom 스플라인을 큐빅 베지어로 옮긴다. 제어점을 지나는 곡선이라 그린 모양이 유지된다.
// closed면 마지막 점 → 첫 점을 직선 현으로 닫는다(Z). 스펙 §1.2: 정확도의 진리값은 화면에
// 그려진 곡선이므로, 닫힘으로 판정된 획은 화면에서도 실제로 닫혀 있어야 분석과 그림이 갈라지지 않는다.
export const pathFor = (points: Point[], closed = false) => {
  if (!points.length) return "";
  const close = closed ? " Z" : "";
  const move = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  if (points.length === 1) return `${move}${close}`;
  if (points.length === 2) return `${move} L${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}${close}`;
  let path = move;
  for (let i = 0; i < points.length - 1; i += 1) {
    const previous = points[i - 1] ?? points[i];
    const start = points[i]; const end = points[i + 1];
    const next = points[i + 2] ?? end;
    const c1x = start.x + (end.x - previous.x) / 6; const c1y = start.y + (end.y - previous.y) / 6;
    const c2x = end.x - (next.x - start.x) / 6; const c2y = end.y - (next.y - start.y) / 6;
    path += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }
  return `${path}${close}`;
};
```

```
cd /Users/yoma/projects/jamcoding/jangyunu && npm test
```

예상 출력(종료 코드 0, 실측):
```
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

- [ ] **Step 8: 기존 6개 스냅샷 불변 증명 (D-A)**

두 가지로 증명한다. 첫째, 손대지 않은 `pathFor` 스냅샷 6개가 그대로 통과한다:

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run -t "pathFor"
```

예상 출력(실측):
```
 Test Files  1 passed (1)
      Tests  10 passed | 13 skipped (23)
```

10개 = 원래 6개 + 새 4개다. 6개의 기대 문자열은 **HEAD의 1인자 구현에서 그대로 받아 적은 값**이고 이 태스크에서 한 글자도 고치지 않았으므로, 통과 = 기본 경로가 안 바뀌었다는 뜻이다.

둘째, 스냅샷이 고정하지 못한 입력까지 훑어 바이트 동일성을 확인한다. **스크래치패드에서만** 돌린다(프로젝트에 파일을 만들지 않는다):

```
cd /private/tmp/claude-501/-Users-yoma-projects-jamcoding-jangyunu/3f4104c7-fa88-4f58-9015-533d06633e7b/scratchpad && mkdir -p pathfor-probe && (cd /Users/yoma/projects/jamcoding/jangyunu && git show HEAD:lib/geometry.ts) > pathfor-probe/geometry.head.ts
```

`pathfor-probe/probe.mts`:

```ts
import { pathFor as before } from "./geometry.head.ts";
import { pathFor as after } from "/Users/yoma/projects/jamcoding/jangyunu/lib/geometry.ts";

let mismatch = "";
for (let trial = 0; trial < 20000 && !mismatch; trial += 1) {
  const points = Array.from({ length: trial % 7 }, () => ({ x: Math.random() * 120 - 10, y: Math.random() * 120 - 10 }));
  const a = before(points);
  const b = after(points);
  if (a !== b) mismatch = `${a}\n${b}`;
}
console.log(mismatch ? `MISMATCH\n${mismatch}` : "identical: 20000/20000");
```

```
cd /private/tmp/claude-501/-Users-yoma-projects-jamcoding-jangyunu/3f4104c7-fa88-4f58-9015-533d06633e7b/scratchpad/pathfor-probe && node --experimental-strip-types probe.mts 2>/dev/null
```

예상 출력(실측):
```
identical: 20000/20000
```

`MISMATCH`가 나오면 Step 7의 `close` 위치가 틀린 것이다 — 멈추고 고친다.

- [ ] **Step 9: 타입 검사**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit
```

예상 출력: **아무것도 출력되지 않고 종료 코드 0**. (`tsconfig.json`의 `include: ["**/*.ts"]`가 새 테스트 파일과 `vitest.config.ts`를 함께 잡는다. `node:url`과 `vitest/config` 타입은 각각 `@types/node@22.13.4`·`node_modules/vitest`에서 해석된다 — TypeScript 5.7.3 + vitest 4.1.10 조합으로 실측 확인함.) `npm run build`는 돌리지 마라 — dev 서버가 `.next`를 쓰고 있다.

- [ ] **Step 10: 커밋**

AGENTS.md 규약대로 원격 변경을 먼저 확인한다:

```
cd /Users/yoma/projects/jamcoding/jangyunu && git fetch origin && git log --oneline -1 origin/main
```

로컬 `main`의 HEAD(`9780947 share magic circle via link`)와 같으면 진행한다. 다르면 커밋 전에 `git pull --rebase origin main`을 먼저 한다.

경로를 명시해서만 스테이징한다 — 이 저장소에는 `next-dev.err.log`, `next-dev.out.log`, `tsconfig.tsbuildinfo`가 추적 중이고 지금 수정된 상태라 `git add -A`를 쓰면 딸려 들어간다:

```
cd /Users/yoma/projects/jamcoding/jangyunu && git add lib/geometry.test.ts vitest.config.ts lib/geometry.ts package.json package-lock.json && git status --short
```

예상 출력(로그 파일이 스테이징에 섞이지 않았는지 확인):
```
A  lib/geometry.test.ts
M  lib/geometry.ts
M  package.json
M  package-lock.json
A  vitest.config.ts
 M next-dev.err.log
 M next-dev.out.log
 M tsconfig.tsbuildinfo
```

```
cd /Users/yoma/projects/jamcoding/jangyunu && git commit -m "lock geometry output with vitest"
```

---

### Task 2: Stroke에 id·closure 부여, 입력단 살균, 드래프트 봉투, 획별 렌더 메모이제이션

스펙 §5.4가 "푸리에보다 먼저" 하라고 지정한 렌더 병목 제거와, 캐시 설계(§5.2)의 전제인 `id` 부여를 한 태스크로 묶는다. `id`를 두 번 도입하지 않기 위해서다(§5.4 마지막 문단). 같은 커밋 안에서 **입력단·로드단 살균을 전부 끝낸다** — E2(호길이 0 획 커밋 폐기), E11(rotationCount 0/누락), E12(레거시 배열 로드), E13(로드 시 `simplify` 정규화), E17(화면 밖 좌표 클램프), E20(첫 저장이 로드를 덮어씀). 스펙 §6 마지막 문단이 "**E11 + E12가 가장 위험한 조합**이다 … 살균과 로더 이전을 **같은 커밋**에서 처리한다"라고 못 박은 조합이고, E2·E13·E17은 그 살균이 막아야 할 NaN·광대역 스펙트럼·유령 획의 나머지 세 입구다.

**Files:**
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/storage.ts`
- Create: `/Users/yoma/projects/jamcoding/jangyunu/app/_components/StrokeLayer.tsx`
- Test: `/Users/yoma/projects/jamcoding/jangyunu/lib/storage.test.ts` (신규, 스펙 T12 + E11·E12·E13)
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/geometry.ts` — 5행(타입 블록)에 `Closure` 추가·`Stroke` 확장, 11행 `pointDistance` 앞에 `newId` 삽입
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/geometry.test.ts` — 56행 `strokeOf` 한 줄 (Task 1 Produces #3이 지정한 상환)
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/page.tsx` — 6행(geometry import), 8행 뒤(import 추가), 10행 앞(모듈 스코프 헬퍼), 46~54행(로드 effect), 58행(저장), 66~69행(`eventPoint`·E17), 80행(`startStroke`), 87~91행(`endStroke`·E2), 149행(렌더 루프)
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/share.ts` — 7행(import), 82행(`strokes.push`)
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/s/[d]/page.tsx` — 59행(`pathFor` 호출)
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/s/[d]/opengraph-image.tsx` — 41행(`pathFor` 호출)

**Interfaces:**

Consumes (Task 1 산출물):
- `vitest` devDependency와 `npm test`(= `vitest run`) 스크립트
- **`vitest.config.ts`가 이미 존재하며 `resolve.alias`로 `@` → 프로젝트 루트를 잡고 있다.** 이 태스크는 그 파일을 만들지도 고치지도 않는다(Step 1은 존재 확인만). 앱과 테스트가 같은 import 문(`@/lib/...`)을 쓴다.
- `pathFor(points: Point[], closed = false): string` — `closed`면 반환 문자열 끝에 `" Z"`. Task 1이 이 인자를 추가했고, 인자를 주지 않는 6개 스냅샷이 그대로 통과함을 Task 1이 증명했다.
- 기존 `lib/geometry.ts`의 `strokeCopies`, `STROKE_WIDTH`, `simplify`, `SIMPLIFY_TOLERANCE`, `pointDistance`
- `lib/geometry.test.ts`의 `strokeOf` 헬퍼 — 이 파일에 존재하는 유일한 `Stroke` 리터럴이다(56행). Step 4가 여기에 `id`/`closure`를 채워 넣는다.

Produces (뒤 태스크가 의존하는 정확한 시그니처):
```ts
// lib/geometry.ts
export type Closure = "closed" | "open" | "point";
export type Stroke = { id: string; points: Point[]; symmetry: Symmetry; rotationCount: number; closure: Closure };
export const newId: () => string;

// lib/storage.ts
export const loadDraft: () => Stroke[];   // v1 맨 배열 / v2 봉투 모두 읽고, 획 단위로 살균한 뒤 simplify(0.35) 1회 적용
export const saveDraft: (strokes: Stroke[]) => void;

// app/_components/StrokeLayer.tsx
export default StrokeLayer: React.MemoExoticComponent<({ stroke }: { stroke: Stroke }) => JSX.Element>;
```
- **`closure` 동결은 Task 3이 상환한다.** 이 태스크는 `closure`를 세 곳에서 `"open"` 리터럴로 채운다: `page.tsx`의 `startStroke`, `lib/storage.ts`의 `reviveStroke`, `lib/share.ts`의 `decodeShare`. Task 3이 `classifyClosure`를 만들면 **`startStroke`를 제외한 나머지**를 교체하고, `page.tsx`의 `endStroke`에서 `simplify` 직후 `closure: classifyClosure(points)`로 동결한다(D-J). `startStroke`의 `"open"`만 활성 획용 임시값으로 영구히 남는다. `"open"`이 안전한 임시값인 근거는 스펙 §1.2다 — 닫힌 획을 열림으로 오판하는 비용은 최대 4항이고 화면은 정상이지만, 반대 방향 오판은 사용자가 그리지 않은 현을 화면에 그린다.
- **렌더 진입점 세 곳이 전부 `pathFor(points, stroke.closure === "closed")`를 쓴다** — 캔버스(`StrokeLayer`), 공유 페이지(`app/s/[d]/page.tsx`), OG 이미지. 스펙 §1.2의 "닫힘으로 판정된 획은 렌더에서도 실제로 닫는다"이자, 모달 오버레이가 캔버스와 같은 곡선을 그리기 위한 전제다(Task 10). 이 태스크 시점에는 모든 `closure`가 `"open"`이므로 **출력이 문자 단위로 불변**이고, Task 3이 판정을 켜는 순간 세 화면이 동시에 닫힌다.
- `encodeShare`는 `id`를 링크에 싣지 않는다(획당 32바이트). 링크 포맷 `FORMAT = 1`은 바뀌지 않으므로 기존에 배포된 링크가 그대로 열린다.
- `polylineLength`는 `app/page.tsx`의 모듈 스코프 지역 헬퍼다. Task 3이 `lib/resample.ts`에 export하는 동명 함수와 별개이며, 이 태스크 시점에 `lib/resample.ts`는 존재하지 않는다.

---

- [ ] **Step 1: 전제 확인 — vitest 설정과 `@` 별칭이 살아 있는가**

Task 1이 남긴 설정으로 별칭이 도는지 먼저 본다. 이게 깨져 있으면 이후 모든 스텝의 빨간불이 "구현이 틀림"인지 "해석이 안 됨"인지 구분되지 않는다. **파일이 없으면 만들지 말고 Task 1로 돌아간다** — `vitest.config.ts`는 Task 1의 산출물이고, 두 태스크가 각각 만들면 내용이 갈라진다.

```bash
cd /Users/yoma/projects/jamcoding/jangyunu
cat vitest.config.ts
npm test
```

`resolve.alias`에 `"@"`가 잡혀 있고 Task 1의 `lib/geometry.test.ts`가 전부 통과하면 진행한다. 실행 확인한 참고 사항: `package.json`에 `"type": "module"`이 없으므로 vitest 4.1.10이 아래 경고를 한 번 낸다. **경고이지 실패가 아니다** — 이것 때문에 설정을 고치지 않는다.

```
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'` …
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1).
```

- [ ] **Step 2: T12 마이그레이션 + 살균 테스트를 먼저 쓴다**

`lib/storage.test.ts`를 새로 만든다. jsdom을 깔지 않는다(스펙 §7: 범위는 `lib/` 순수 함수). `localStorage`만 Map으로 흉내 낸다.

```ts
// T12 마이그레이션 + E11·E12·E13 살균. jsdom 없이 localStorage만 메모리로 흉내 낸다.

import { beforeEach, describe, expect, it } from "vitest";

import { simplify, SIMPLIFY_TOLERANCE } from "@/lib/geometry";
import { loadDraft, saveDraft } from "@/lib/storage";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; }
  }
});

const KEY = "arcana-draft-v1";
const put = (value: unknown) => store.set(KEY, JSON.stringify(value));
const line = [{ x: 10, y: 10 }, { x: 90, y: 90 }];
// 손떨림이 섞인 레거시 점군. v1에는 simplify를 거치지 않고 저장된 그림이 있다.
const noisy = Array.from({ length: 200 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 200;
  return { x: 50 + 30 * Math.cos(angle) + (index % 2 ? 0.12 : -0.12), y: 50 - 30 * Math.sin(angle) + (index % 3 ? 0.1 : -0.1) };
});

beforeEach(() => store.clear());

describe("loadDraft", () => {
  it("키가 없으면 빈 배열", () => {
    expect(loadDraft()).toEqual([]);
  });

  it("v1 맨 배열에 id와 closure를 채워 넣는다", () => {
    put([{ points: line, symmetry: "mirrorX", rotationCount: 4 }]);
    const [stroke] = loadDraft();
    expect(stroke.id.length).toBeGreaterThan(0);
    expect(stroke.closure).toBe("open");
    expect(stroke.symmetry).toBe("mirrorX");
    expect(stroke.rotationCount).toBe(4);
    expect(stroke.points).toEqual(line);
  });

  it("v1의 결측 symmetry/rotationCount는 rotate/6", () => {
    put([{ points: line }]);
    const [stroke] = loadDraft();
    expect(stroke.symmetry).toBe("rotate");
    expect(stroke.rotationCount).toBe(6);
  });

  it("rotationCount 0은 6으로 올린다", () => {
    put([{ points: line, symmetry: "rotate", rotationCount: 0 }]);
    expect(loadDraft()[0].rotationCount).toBe(6);
  });

  it("v2 봉투를 읽고 기존 id를 유지한다", () => {
    put({ version: 2, strokes: [{ id: "keep-me", points: line, symmetry: "free", rotationCount: 6, closure: "closed" }] });
    const [stroke] = loadDraft();
    expect(stroke.id).toBe("keep-me");
    expect(stroke.closure).toBe("closed");
  });

  it("id 없는 v2 봉투에도 id를 채운다", () => {
    put({ version: 2, strokes: [{ points: line, symmetry: "free", rotationCount: 6, closure: "open" }] });
    expect(loadDraft()[0].id.length).toBeGreaterThan(0);
  });

  it("중복 id는 뒤쪽만 새로 만든다", () => {
    put([{ id: "same", points: line }, { id: "same", points: line }]);
    const [first, second] = loadDraft();
    expect(first.id).toBe("same");
    expect(second.id).not.toBe("same");
  });

  it("점이 2개 미만인 획과 배열 안 null만 버리고 나머지는 살린다", () => {
    put([{ points: [] }, null, { points: [{ x: 1, y: 1 }] }, { points: line }, "쓰레기"]);
    const strokes = loadDraft();
    expect(strokes).toHaveLength(1);
    expect(strokes[0].points).toEqual(line);
  });

  it("좌표가 NaN인 점만 걷어낸다", () => {
    put([{ points: [{ x: 10, y: 10 }, { x: null, y: 3 }, { x: 90, y: 90 }] }]);
    expect(loadDraft()[0].points).toEqual(line);
  });

  it("E13 레거시 노이즈 점군을 로드에서 한 번 정규화한다", () => {
    put([{ points: noisy }]);
    const [stroke] = loadDraft();
    expect(stroke.points.length).toBeLessThan(noisy.length / 4);
    expect(stroke.points).toEqual(simplify(noisy, SIMPLIFY_TOLERANCE));
  });

  it("손상된 JSON이면 빈 배열을 주되 원본을 지우지 않는다", () => {
    store.set(KEY, "{망가진");
    expect(loadDraft()).toEqual([]);
    expect(store.get(KEY)).toBe("{망가진");
  });
});

describe("saveDraft", () => {
  it("version 2 봉투로 감싼다", () => {
    saveDraft([{ id: "a", points: line, symmetry: "rotate", rotationCount: 6, closure: "open" }]);
    expect(JSON.parse(store.get(KEY)!)).toEqual({
      version: 2,
      strokes: [{ id: "a", points: line, symmetry: "rotate", rotationCount: 6, closure: "open" }]
    });
  });

  it("저장한 것을 그대로 다시 읽는다", () => {
    const strokes = [{ id: "a", points: line, symmetry: "mirrorY" as const, rotationCount: 8, closure: "closed" as const }];
    saveDraft(strokes);
    expect(loadDraft()).toEqual(strokes);
  });

  it("로드 결과는 고정점이다 — 다시 저장해 읽어도 점이 바뀌지 않는다", () => {
    put([{ points: noisy }]);
    const first = loadDraft();
    saveDraft(first);
    expect(loadDraft()).toEqual(first);
  });
});
```

마지막 두 테스트가 E13의 승인 조건이다. 로드에서 `simplify`를 거는 순간 "로드가 그림을 바꾼다"는 위험이 생기므로, 그 변환이 **멱등**임을(한 번 정규화된 드래프트는 다시 로드해도 그대로임을) 같은 파일에서 못 박는다.

- [ ] **Step 3: 빨간불 확인**

```bash
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/storage.test.ts
```

예상 출력 (vitest 4.1.10 + 별칭 설정으로 실행 확인함):
```
 ❯ lib/storage.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  lib/storage.test.ts [ lib/storage.test.ts ]
Error: Cannot find package '@/lib/storage' imported from /Users/yoma/projects/jamcoding/jangyunu/lib/storage.test.ts
 ❯ lib/storage.test.ts:6:1

 Test Files  1 failed (1)
      Tests  no tests
```

**오류가 6행(`@/lib/storage`)을 가리키고 5행(`@/lib/geometry`)은 조용한 것이 별칭이 살아 있다는 증거다.** 5행에서 먼저 터지면 Step 1의 설정이 빠진 것이다.

- [ ] **Step 4: `lib/geometry.ts`에 `Closure`·`Stroke.id`·`newId` 추가, `strokeOf` 상환**

5행의 `Stroke` 한 줄을 이렇게 바꾼다.

```ts
// 획이 닫혔는지는 커밋 시 한 번만 판정해 동결한다. 매번 다시 재면 같은 그림의 식 형태가 흔들린다.
export type Closure = "closed" | "open" | "point";
export type Stroke = { id: string; points: Point[]; symmetry: Symmetry; rotationCount: number; closure: Closure };
```

11행 `export const pointDistance = ...` **바로 앞**에 `newId`를 넣는다.

```ts
// crypto.randomUUID는 보안 컨텍스트(https·localhost)에서만 존재한다. http로 연 페이지에서도 획에는 id가 있어야 한다.
export const newId = (): string => {
  const source = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues === "function") {
    return Array.from(source.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};
```

`typeof source?.randomUUID === "function"`으로 쓰는 이유: lib.dom에서 `Crypto.randomUUID`가 옵셔널이 아니어서 `if (source?.randomUUID)`는 TS2774(`This condition will always return true`)를 부른다. 세 갈래 모두 node 22에서 실행 확인했고, 최후 폴백도 20만 개 생성에서 충돌이 없다.

```
randomUUID     : 9e44d2a2-9be7-43b5-a29f-b308a01d7b0d
getRandomValues: 5ff65599724cd2101ed2b16107934cae
no crypto      : smsr55ra76pgffojfjy
최후 폴백 20만 개 중 고유 20만 개
```

이어서 **`lib/geometry.test.ts` 56행의 `strokeOf` 한 줄을 상환한다**(Task 1 Produces #3이 지정한 작업). `tsconfig.json`의 `include`가 `**/*.ts`라 테스트 파일도 타입 검사 대상이므로, 이걸 먼저 고쳐야 다음 `tsc` 출력이 앱 코드만 가리킨다.

```ts
const strokeOf = (symmetry: Symmetry, rotationCount: number, points: Point[]): Stroke => ({ id: "s1", points, symmetry, rotationCount, closure: "open" });
```

`strokeCopies`는 `id`도 `closure`도 읽지 않으므로 Task 1의 단언은 하나도 바뀌지 않는다.

```bash
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/geometry.test.ts
npx tsc --noEmit
```

vitest는 Task 1 스위트가 그대로 전부 통과한다. `tsc`는 아직 빨간불이며 **정확히 이 세 개**만 나온다(스크래치패드 복제본에서 프로젝트의 tsc 5.7.3으로 실행 확인함). Stroke를 만드는 지점이 앱 전체에 세 곳뿐이라는 뜻이다.

```
app/page.tsx(51,20): error TS2345: Argument of type '{ points: Point[]; symmetry: Symmetry; rotationCount: number; }[]' is not assignable to parameter of type 'SetStateAction<Stroke[]>'.
    Type '{ points: Point[]; symmetry: Symmetry; rotationCount: number; }' is missing the following properties from type 'Stroke': id, closure
app/page.tsx(80,15): error TS2345: ... is missing the following properties from type 'Stroke': id, closure
lib/share.ts(82,20): error TS2345: ... is missing the following properties from type 'Stroke': id, closure
```

네 번째로 `lib/geometry.test.ts`가 뜨면 `strokeOf` 수정이 빠진 것이다.

- [ ] **Step 5: `lib/storage.ts` 구현 → 초록불**

```ts
// 드래프트 저장. 키는 "arcana-draft-v1" 그대로 두고 페이로드만 봉투로 감싼다.
// 키를 올리면 기존 사용자의 그림이 전부 사라진다 — 그리기 앱에서 그건 마이그레이션이 아니라 데이터 손실이다.

import { newId, simplify, SIMPLIFY_TOLERANCE, type Closure, type Point, type Stroke, type Symmetry } from "@/lib/geometry";

const DRAFT_KEY = "arcana-draft-v1";
const DRAFT_VERSION = 2;
const SYMMETRIES: Symmetry[] = ["free", "mirrorX", "mirrorY", "rotate"];
const CLOSURES: Closure[] = ["closed", "open", "point"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const revivePoints = (value: unknown): Point[] => {
  if (!Array.isArray(value)) return [];
  const points: Point[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const x = typeof raw.x === "number" ? raw.x : NaN; const y = typeof raw.y === "number" ? raw.y : NaN;
    // NaN 좌표 하나가 path 전체를 조용히 지운다. 저장 형식에서 미리 걷어낸다.
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ x, y });
  }
  return points;
};

// 획 하나가 깨져도 나머지는 살린다. 통째로 버리면 그건 복구가 아니라 데이터 손실이다.
const reviveStroke = (raw: unknown, taken: Set<string>): Stroke | null => {
  if (!isRecord(raw)) return null;
  const cleaned = revivePoints(raw.points);
  if (cleaned.length < 2) return null;
  // E13: 출처와 무관하게 저장 형식을 정규화한다. v1에는 simplify를 거치지 않은 노이즈 점군이 남아 있고,
  // 그대로 두면 광대역 스펙트럼이 되어 원 하나가 40항으로 분해된다. simplify는 멱등이라 v2 재로드는 무해하다.
  const points = simplify(cleaned, SIMPLIFY_TOLERANCE);
  const id = typeof raw.id === "string" && raw.id.length > 0 && !taken.has(raw.id) ? raw.id : newId();
  taken.add(id);
  // v1 드래프트는 전부 툴바 기본값(회전 6)으로 그려졌다. "free"로 낮추면 복사본이 사라져 그림 자체가 바뀐다.
  const symmetry = SYMMETRIES.find((item) => item === raw.symmetry) ?? "rotate";
  // E11: rotationCount 0/누락은 각도 2π·k/0 = Infinity → NaN 좌표 → path 소멸로 이어진다.
  const rotationCount = Math.min(8, Math.max(2, Math.round(Number(raw.rotationCount)) || 6));
  // Task 3이 여기를 classifyClosure(points)로 교체한다.
  const closure = CLOSURES.find((item) => item === raw.closure) ?? "open";
  return { id, points, symmetry, rotationCount, closure };
};

export const loadDraft = (): Stroke[] => {
  let raw: string | null = null;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch { return []; }
  if (!raw) return [];
  let parsed: unknown;
  // 읽기에 실패해도 원본을 지우지 않는다. 지우는 순간 복구 경로가 사라진다.
  try { parsed = JSON.parse(raw); } catch { return []; }
  // 배열이면 v1(맨 배열), 객체면 v2(봉투). 배열 대 객체는 공짜로 얻는 완벽한 판별자다.
  const list = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.strokes) ? parsed.strokes : null;
  if (!list) return [];
  const taken = new Set<string>();
  const strokes: Stroke[] = [];
  for (const entry of list) {
    const stroke = reviveStroke(entry, taken);
    if (stroke) strokes.push(stroke);
  }
  return strokes;
};

export const saveDraft = (strokes: Stroke[]): void => {
  // 사파리 프라이빗 모드와 용량 초과는 setItem에서 던진다. 저장이 실패해도 화면의 그림은 살아 있어야 한다.
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: DRAFT_VERSION, strokes })); } catch { /* 저장 실패는 조용히 넘긴다 */ }
};
```

세 가지가 핵심이다. (1) `typeof raw.x === "number"`로 좁힌다 — `Number(raw.x)`를 쓰면 `null`이 0으로 바뀌어 캔버스 좌상단에 없는 점이 생긴다. (2) `simplify`는 `cleaned.length < 2` 판정 **뒤에** 건다 — RDP는 2점 미만 입력을 그대로 돌려주므로 순서를 바꾸면 살균 순서가 흐려진다. (3) `rotationCount` 클램프는 실행 확인한 표가 이렇다.

```
undefined→6   null→6   0→6   1→2   2→2   3→3   6→6   8→8   12→8   "4"→4   "abc"→6   -3→2   6.4→6
```

E13의 멱등성과 정규화 효과도 실측했다(로드 → 저장 → 재로드).

```
노이즈 원  : raw 200 → load 33 → 재로드 33   고정점=true
매끄러운 원: raw  64 → load 32 → 재로드 32   고정점=true
지그재그   : raw  80 → load 80 → 재로드 80   고정점=true
직선       : raw   3 → load  2 → 재로드  2   고정점=true
```

```bash
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/storage.test.ts
```

예상 출력 (vitest 4.1.10에서 실행 확인함):
```
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

- [ ] **Step 6: `app/page.tsx`를 loadDraft/saveDraft로 갈아끼우고 입력단을 살균한다**

6행의 geometry import를 바꾸고(`newId`·`type Point` 추가), 8행 `encodeShare` import 뒤에 storage import를 한 줄 넣는다. 렌더 루프는 아직 손대지 않으므로 `copiesFor`/`pathFor`/`transformPoint`/`STROKE_WIDTH`는 그대로 둔다.

```tsx
import { copiesFor, newId, pathFor, pointDistance, simplify, SIMPLIFY_TOLERANCE, STROKE_WIDTH, transformPoint, type Point, type Stroke, type Symmetry } from "@/lib/geometry";
import { getMetrics } from "@/lib/metrics";
import { encodeShare } from "@/lib/share";
import { loadDraft, saveDraft } from "@/lib/storage";
```

10행 `export default function Home()` **바로 앞**, 모듈 스코프에 E2용 상수와 헬퍼를 둔다.

```tsx
// E2: 점 하나를 톡 찍은 것은 획이 아니다. 100 단위 뷰박스에서 호길이 1.0은 눈에 보이지도 않는다.
const MIN_STROKE_LENGTH = 1;
const polylineLength = (points: Point[]) => {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += pointDistance(points[index - 1], points[index]);
  return total;
};
```

46~54행의 로드 effect 전체를 이 4줄로 교체한다.

```tsx
  useEffect(() => {
    const draft = loadDraft();
    if (draft.length) setStrokes(draft);
  }, []);
```

`if (draft.length)` 가드가 E20이다. 로드가 부분 실패해 빈 배열이 오더라도 `setStrokes`를 호출하지 않으므로, 저장 effect가 돌아 원본을 덮어쓰는 경로가 생기지 않는다. `restored.current` 가드는 그대로 둔다. **이 가드는 Task 7이 `restore` 헬퍼로 감쌀 때도 유지된다.**

58행을 바꾼다.

```tsx
    saveDraft(strokes);
```

66~69행 `eventPoint`의 return을 바꾼다(E17).

```tsx
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    // E17: setPointerCapture 때문에 캔버스 밖에서도 좌표가 들어온다. 보이지 않는 곳까지 뻗은 획이
    // 식과 정확도에는 그대로 잡히므로, 화면 밖 여유 10%까지만 남기고 자른다.
    return { x: Math.min(110, Math.max(-10, x)), y: Math.min(110, Math.max(-10, y)) };
```

실측 클램프 결과:
```
(-380,50)→(-10,50)   (-10.1,50)→(-10,50)   (50,50)→(50,50)   (50,260)→(50,110)   (110.4,-0.2)→(110,-0.2)
```

80행 `setActive`를 바꾼다. 스펙 §3이 `pointerdown → startStroke: id 생성`으로 지정했고, `active`의 타입이 `Stroke | null`이라 여기서 id가 없으면 타입이 성립하지 않는다.

```tsx
    // id는 이벤트 핸들러 안에서만 만든다. 렌더 중에 만들면 서버와 클라이언트가 다른 값을 내 hydration이 깨진다.
    setActive({ id: newId(), points: [eventPoint(event)], symmetry, rotationCount, closure: "open" });
```

87~91행 `endStroke`의 커밋 블록을 바꾼다(E2).

```tsx
    if (active && active.points.length > 2) {
      const points = simplify(active.points, SIMPLIFY_TOLERANCE);
      // Task 3이 여기에 closure: classifyClosure(points)를 붙여 커밋 시 1회 판정으로 동결한다.
      if (polylineLength(points) >= MIN_STROKE_LENGTH) {
        setStrokes((current) => [...current, { ...active, points }]); setRedoStack([]);
      }
    }
```

기존 `active.points.length > 2`만으로는 한 자리에서 손가락이 떨린 "점 찍기"가 획으로 커밋된다. 실측:

```
E2 점 찍기: 제어점 4→2   호길이 0.0539   커밋 폐기
E2 짧은 획: 제어점 4→2   호길이 3.4986   커밋 함
```

- [ ] **Step 7: `lib/share.ts`의 decodeShare가 id/closure를 채우게 한다 → tsc 초록불**

7행의 import를 바꾼다.

```ts
import { newId, type Point, type Stroke, type Symmetry } from "@/lib/geometry";
```

82행 `strokes.push(...)`를 바꾼다. `encodeShare`는 건드리지 않는다 — id를 링크에 실으면 획당 32바이트가 늘고, 읽는 쪽에서 만들면 되는 값이다.

```ts
      // id는 링크에 싣지 않는다(획당 32바이트). 읽는 쪽에서 만들어 붙인다.
      // Task 3이 closure를 classifyClosure(points)로 교체한다.
      strokes.push({ id: newId(), points, symmetry, rotationCount: Math.min(12, Math.max(1, Math.round(rotationCount))), closure: "open" });
```

`decodeShare`는 `app/s/[d]/page.tsx`와 `opengraph-image.tsx`에서 서버 실행된다. 서버가 만든 id는 클라이언트에서 다시 만들어지지 않고(공유 페이지는 서버 컴포넌트다) HTML에도 나가지 않으므로 hydration 문제는 없다. 왕복을 실제로 돌려 확인했다.

```
strokes decoded : 3
  #0 id=36자 새 id=true closure=open sym=rotate rot=6 pts=24
  #1 id=36자 새 id=true closure=open sym=mirrorX rot=6 pts=2
  #2 id=36자 새 id=true closure=open sym=free rot=6 pts=12
id 중복 없음 : true
id/closure가 metrics를 바꾸지 않는다: true   (power 225 · 고급 그대로)
decode("") → null   decode("!!!") → null
```

```bash
cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit && npm test
```

예상 출력: `tsc`는 아무것도 출력하지 않고 종료 코드 0(스크래치패드 복제본에서 이 상태 그대로 실행 확인함), vitest는 `Test Files 2 passed (2)` — `lib/storage.test.ts` 14개와 Task 1의 `lib/geometry.test.ts`가 전부 통과.

- [ ] **Step 8: 커밋 1**

```bash
cd /Users/yoma/projects/jamcoding/jangyunu
git fetch origin && git status -sb
git add lib/geometry.ts lib/geometry.test.ts lib/storage.ts lib/storage.test.ts lib/share.ts app/page.tsx
git commit -m "stroke ids, versioned draft envelope, input sanitizing"
```

`git add .`을 쓰지 않는다. 작업 트리에 추적 중인 `tsconfig.tsbuildinfo`가 항상 더럽다.

- [ ] **Step 9: `app/_components/StrokeLayer.tsx` 생성**

`app/_components`는 언더스코어 접두사라 Next의 라우팅 세그먼트가 되지 않는다.

```tsx
"use client";

import { memo } from "react";

import { pathFor, STROKE_WIDTH, strokeCopies, type Stroke } from "@/lib/geometry";

// 획 하나와 그 대칭 복사본. 그리는 중에 새 객체가 되는 것은 활성 획뿐이라 확정된 획들은 다시 그리지 않는다.
const StrokeLayer = memo(function StrokeLayer({ stroke }: { stroke: Stroke }) {
  // 닫힘으로 판정된 획은 화면에서도 실제로 닫는다(스펙 §1.2). 정확도의 진리값이 "화면에 그려진 곡선"이므로
  // 캔버스가 열어 두고 모달만 닫으면 오버레이가 원본과 어긋나 그 자리에서 신뢰가 무너진다.
  const closed = stroke.closure === "closed";
  return <>{strokeCopies(stroke).map((points, copy) => (
    <path key={`${stroke.id}-${copy}`} className="draw-stroke" d={pathFor(points, closed)}
      style={{ stroke: "url(#arcana-gradient)", strokeWidth: STROKE_WIDTH }} />
  ))}</>;
});

export default StrokeLayer;
```

`url(#arcana-gradient)`가 하드코딩되어 있으므로 이 컴포넌트는 캔버스 전용이다. `app/s/[d]/page.tsx`는 `#share-gradient`를 쓰므로 자기 렌더 루프를 그대로 두고, 다음 스텝에서 `pathFor` 호출만 맞춘다.

- [ ] **Step 10: 렌더 진입점 세 곳을 교체한다**

(a) `app/page.tsx` 6행 import에서 이제 쓰지 않는 `copiesFor`, `pathFor`, `transformPoint`, `STROKE_WIDTH`를 뺀다(`noUnusedLocals`는 꺼져 있지만 남기면 다음 리뷰에서 되살아난다). storage import 뒤에 StrokeLayer import를 넣는다.

```tsx
import { newId, pointDistance, simplify, SIMPLIFY_TOLERANCE, type Point, type Stroke, type Symmetry } from "@/lib/geometry";
import { getMetrics } from "@/lib/metrics";
import { encodeShare } from "@/lib/share";
import { loadDraft, saveDraft } from "@/lib/storage";
import StrokeLayer from "@/app/_components/StrokeLayer";
```

149행의 `displayStrokes.flatMap(...)` 한 줄을 이 한 줄로 바꾼다.

```tsx
            {displayStrokes.map((stroke) => <StrokeLayer key={stroke.id} stroke={stroke} />)}
```

(b) `app/s/[d]/page.tsx` 59행의 `d` 속성을 바꾼다.

```tsx
          <path key={`${index}-${copy}`} d={pathFor(points, stroke.closure === "closed")} fill="none" strokeLinecap="round" strokeLinejoin="round"
```

(c) `app/s/[d]/opengraph-image.tsx` 41행을 바꾼다.

```tsx
  const paths = shared.strokes.flatMap((stroke) => strokeCopies(stroke).map((points) => pathFor(points, stroke.closure === "closed")));
```

출력이 지금 그대로라는 것은 실행해 확인했다 — `closure`가 전부 `"open"`인 이 시점에 `strokeCopies(stroke).map((p) => pathFor(p, false))`가 기존 인라인 식과 문자 단위로 같은 `d`를 낸다. Task 3이 판정을 켜면 세 화면이 동시에 닫힌다.

```
rotate6 원호: copies=6 identical=true
mirrorX 직선: copies=2 identical=true
free 물결   : copies=1 identical=true
closure="closed"로 바꾸면 사본 전부가 " Z"로 끝난다: true (문자열 +2)
RENDER OUTPUT UNCHANGED
```

이득의 크기(획 50개 × 사본 8개 = 400 path, 제어점 20개, node 22/M시리즈 실측):

```
전체 재생성   : 3.69 ms/프레임
활성 획 1개만 : 0.073 ms/프레임   → 51배
```

`pointermove`에서 `displayStrokes` 배열은 새로 생기지만 **확정된 획의 객체 참조는 그대로**이므로 `memo`가 전부 건너뛴다. 지우개(술어 필터)와 undo/redo도 살아남은 획의 참조를 옮길 뿐이라 마찬가지다.

```bash
cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit && npm test
```

예상 출력: `tsc` 무출력·종료 코드 0(이 상태의 프로젝트 복제본을 프로젝트의 tsc 5.7.3으로 검사해 exit 0 확인함), vitest `Test Files 2 passed (2)` 전부 통과. `npm run build`는 돌리지 않는다 — dev 서버가 `.next`를 쓰고 있다.

- [ ] **Step 11: 브라우저에서 마이그레이션과 살균을 눈으로 확인**

dev 서버(http://localhost:3000)의 devtools 콘솔에 v1 형식을 심고 새로고침한다.

```js
localStorage.setItem("arcana-draft-v1", JSON.stringify([
  { points: [{x:20,y:20},{x:80,y:80}], symmetry: "rotate", rotationCount: 0 },
  null,
  { points: Array.from({length: 200}, (_, i) => { const a = Math.PI*2*i/200;
      return { x: 50 + 30*Math.cos(a) + (i%2?0.12:-0.12), y: 50 - 30*Math.sin(a) + (i%3?0.1:-0.1) }; }) }
]));
location.reload();
```

새로고침 뒤 확인할 것 다섯 가지.
1. 획 2개가 회전 6겹으로 그려진다(`null`은 사라지고, `rotationCount: 0`이던 획이 6겹으로 산다).
2. 원이 매끄럽게 남아 있다 — E13의 `simplify`가 200점을 33점으로 줄여도 형태가 보존된다.
3. 캔버스 아무 데나 **한 번 톡 찍는다**. 획이 생기지 않고 푸터 지표도 그대로다(E2).
4. 획을 하나 그리되 캔버스 밖으로 한참 끌고 나갔다 놓는다. 화면 밖으로 뻗은 선이 캔버스 경계 근처에서 멈춘다(E17).
5. `JSON.parse(localStorage["arcana-draft-v1"])`가 `{ version: 2, strokes: [...] }` 봉투이고 각 획에 `id`와 `closure: "open"`이 있다. 콘솔에 hydration 경고가 없다.

- [ ] **Step 12: 커밋 2**

```bash
cd /Users/yoma/projects/jamcoding/jangyunu
git fetch origin && git status -sb
git add app/_components/StrokeLayer.tsx app/page.tsx "app/s/[d]/page.tsx" "app/s/[d]/opengraph-image.tsx"
git commit -m "memoize stroke rendering and close closed paths"
```

---

**이번 범위 밖으로 명시하는 것 두 가지.** 스펙 §6의 E18(지우개 판정을 제어점 거리 → 점-선분 거리로)과 E19(`simplify` 재귀 깊이 상한)는 이 태스크에서도 이 계획 전체에서도 다루지 않는다. 둘 다 푸리에 분해와 무관한 기존 결함이고, E18은 지우개 UX 변경이라 별도 검증(어느 반경에서 지워지는가)이 필요하며 E19는 `SIMPLIFY_TOLERANCE`를 낮추려 할 때 비로소 위험해진다 — 이 계획은 0.35를 바꾸지 않는다. 별도 작업으로 남긴다.

---

프로젝트 파일은 읽기만 했고, 모든 수치는 scratchpad(`task03-check.mjs`, `task03-share-check.mjs`, `task03-jitter.mjs`)에서 실행해 얻었다.

### Task 3: lib/resample.ts — 좌표 변환, 닫힘 판정, 호길이 균등 재샘플, `closure` 동결 배선 완결

이 태스크는 두 가지를 한다. (1) 푸리에 이전의 전처리 모듈을 만든다. (2) **Task 2가 세 곳에 임시로 박아 둔 `closure: "open"`을 전부 상환한다.** (2)가 빠지면 사용자가 그린 모든 획이 영원히 `"open"`이 되고, 스펙 §1.5의 닫힘 DFT 경로·D2·T3이 앱에서 한 번도 실행되지 않는다 — 원을 그려도 1항이 아니라 5항이 나온다. 같은 이유로 스펙 §1.2의 파생 결정("닫힘 획은 렌더에서도 실제로 닫는다")을 공유 페이지와 OG 이미지에도 배선한다.

**Files:**
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/resample.ts`
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/resample.test.ts` (16 tests)
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/share.test.ts` (2 tests)
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/share.ts` — import 블록(현재 6~7행)에 `classifyClosure` 한 줄 추가, `decodeShare`의 `strokes.push({ … })`(Task 2 적용 후 82행 부근)에서 `closure: "open"` → `closure: classifyClosure(points)`
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/storage.ts` — import 블록에 `classifyClosure` 추가, `reviveStroke`의 `const closure = CLOSURES.find(…) ?? "open"` → `?? classifyClosure(points)`
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/storage.test.ts` — Task 2가 만든 12 tests에 2 tests 추가 (총 14)
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/page.tsx` — import 1줄 추가, `endStroke`(현재 87~95행) 전체 교체
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/s/[d]/page.tsx` — 렌더 루프(58~60행)의 `pathFor(points)` → `pathFor(points, stroke.closure === "closed")`
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/s/[d]/opengraph-image.tsx` — 41행의 `pathFor(points)` → 같은 형태

**Interfaces:**

*Consumes*
- Task 1 → `vitest` devDependency, `npm test`(= `vitest run`), **그리고 이미 존재하는 `vitest.config.ts`의 `resolve.alias` `@` → 프로젝트 루트**(D-H). 이 태스크는 설정 파일을 만들지 않는다. Step 1이 존재만 확인한다.
- Task 1 → `pathFor(points: Point[], closed = false): string` — `closed`면 반환 문자열 끝에 `" Z"`. 인자를 주지 않으면 기존 출력과 문자 단위로 같다(실측: `pathFor(p) === pathFor(p, false)` true).
- Task 2 → `lib/geometry.ts`의 `export type Closure = "closed" | "open" | "point"`, `Stroke.closure` 필드, `newId`
- Task 2 → `lib/storage.ts`의 `reviveStroke`(E13의 `simplify(points, 0.35)` 정규화 포함)와 `loadDraft`/`saveDraft`, `lib/storage.test.ts`의 12 tests
- Task 2 → `lib/share.ts`의 `decodeShare`가 임시로 넣어 둔 `closure: "open"`, `app/page.tsx`의 `endStroke`가 임시로 커밋하는 `{ ...active }`
- 기존 `lib/geometry.ts` → `curvePoints`, `pointDistance`, `simplify`, `SIMPLIFY_TOLERANCE`, `strokeCopies`, `STROKE_WIDTH`, `type Point`

*Produces* (Task 4 `lib/fourier.ts`와 Task 6이 그대로 쓴다)
```ts
// lib/resample.ts
export type Complex = { re: number; im: number }

export const CENTER: Point                    // { x: 50, y: 50 }
export const DENSE_SPACING = 0.25
export const MAX_DENSE_POINTS = 4096
export const MIN_SEGMENT_STEPS = 4
export const MAX_SEGMENT_STEPS = 64
export const POINT_ARC_LENGTH = 1.0
export const CLOSED_MIN_LENGTH = 18

export const toComplex: (point: Point) => Complex        // z = conj(p − 50 − 50i)
export const fromComplex: (z: Complex) => Point
export const polylineLength: (poly: Point[]) => number
export function densify(points: Point[], closed: boolean): { poly: Point[]; length: number }
export function resampleUniform(poly: Point[], length: number, P: number, closed: boolean): Point[]
export function classifyClosure(points: Point[]): Closure
```
- **`densify`는 끝점을 클램프(`points[i-1] ?? points[i]`)하고 닫는 세그먼트를 직선 현으로 둔다. 이웃을 순환으로 감지 않는다**(D-G). 근거: 화면의 `pathFor(points, true)`가 `Z`(직선 현)로 닫으므로 클램프 + 직선 현이 화면 곡선과 정확히 일치하고, 스펙 §1.2는 "정확도의 진리값은 화면에 그려진 곡선"이라고 못 박았다. Task 4의 원 기대값(`L = 188.4922`, `P = 378`, 1항, `|c₁| = 29.9991`, `rmsError = 3.78e-3`, `maxError = 3.41e-2`, `accuracy = 0.9998741`)이 이 계약 위에서 측정되었다.
- **이 태스크가 끝나면 앱에 `closure: "open"` 리터럴은 `startStroke` 한 곳만 남는다**(활성 획용 임시값 — 활성 획은 절대 분석하지 않으므로 값이 무의미하다, 스펙 §3).

**검증 완료 수치** (scratchpad에서 이 태스크의 실제 코드를 node로 실행해 얻었다. 아래 스텝의 "예상 출력"은 전부 이 실측이다)

| 항목 | 실측 |
|---|---|
| `fromComplex(toComplex(p))` 왕복 최대 오차 (격자 33×33) | `3.553e-15` |
| 360° 원 r=30 | L=188.4430 · g=0.0000 · limit=5.6533 → **closed** |
| 350° 호 r=30 | L=183.2119 · g=5.2293 · limit=5.4964 → **closed** |
| 345° 호 r=30 | L=180.5962 · g=7.8316 · limit=5.4179 → **open** (게임 판정은 closed) |
| 320° 호 r=30 | L=167.5165 · g=20.5212 → **open** |
| 포함관계 스윕 (r 5~45, 각 90~360°, 2439건) | 위반 0건 · 게임만 closed 176건 |
| `simplify(0.35)` 후 판정 유지 | 원 64점→32점 closed · 350° 호 24점→24점 closed · 손떨림 원 240점→**18점** closed (L=189.9037, g=0.1550) |
| 양자화 왕복(share 0.1단위) 후 판정 유지 | 원 closed · 350° 호 closed(여유 0.2720) · 직선 open · 같은 점 2개 point |
| densify(350°, false) | `curvePoints` L=183.2119 vs densify L=183.2198 (차 0.0079) · \|D\|=737 · 간격 max 0.2896 |
| densify 닫힘 현 | open L=183.2198 → closed L=188.4492 (차 5.229344565 = 현 길이) |
| 지그재그 81 제어점 | 1차 \|D\|=5121 → 재계산 후 \|D\|=4161 (상한 4096+81=4177) |
| 닫힌 원 r=30, P=256 | 간격 mean 0.736234 (L/P 0.736251) · **sd/mean 7.214e-6** |
| 열린 350° 호, P=128 | **sd/mean 2.933e-5** · 양 끝 오차 0 |
| 350°(closed 경로), P=378 | **sd/mean 2.742e-4** (닫힘 현의 꺾임 때문에 가장 큼) |
| 직선 60, P=128 | 간격 정확히 0.46875, max−min = 0 |
| `pathFor(p, true)` | `"… 90.00 10.00 Z"` · `pathFor(p) === pathFor(p, false)` true |

---

- [ ] **Step 1: 전제 확인 — vitest와 `@/` 별칭이 이미 살아 있는가**

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu
  cat vitest.config.ts
  npx vitest run
  ```

  `vitest.config.ts`가 있고 `resolve.alias`에 `"@"`가 잡혀 있어야 한다(Task 1 산출물, D-H). Task 1·2의 테스트가 전부 통과해야 한다. **이 파일을 다시 만들지 않는다** — 내용이 갈라지면 어느 쪽이 도는지 알 수 없게 된다. 없거나 별칭이 빠져 있으면 Task 1로 돌아가 고치고 온다. 이게 깨진 상태로 진행하면 이후 모든 빨간불이 "구현이 틀림"인지 "해석이 안 됨"인지 구분되지 않는다.

- [ ] **Step 2: 좌표 변환·닫힘 판정 테스트 작성 (실패하는 테스트)**

  `lib/resample.test.ts`를 새로 만든다. 헬퍼는 뒤 스텝에서 쓸 것까지 한 번에 둔다.

  ```ts
  import { describe, expect, test } from "vitest";

  import { curvePoints, pointDistance, simplify, SIMPLIFY_TOLERANCE, type Point } from "@/lib/geometry";
  import {
    classifyClosure, fromComplex, polylineLength, toComplex
  } from "@/lib/resample";

  // 반지름 radius 의 원호를 count 개 제어점으로 만든다. degrees=360 이면 마지막 점이 첫 점과 겹친다.
  const arcPoints = (degrees: number, radius = 30, count = 24): Point[] =>
    Array.from({ length: count }, (_, index) => {
      const angle = ((degrees * Math.PI) / 180) * (index / (count - 1));
      return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
    });

  const gapsOf = (points: Point[], wrap: boolean) => {
    const gaps: number[] = [];
    for (let index = 1; index < points.length; index += 1) gaps.push(pointDistance(points[index - 1], points[index]));
    if (wrap) gaps.push(pointDistance(points[points.length - 1], points[0]));
    return gaps;
  };
  // 인접 간격의 표준편차 / 평균. 등간격이면 0 에 수렴한다.
  const spreadOf = (values: number[]) => {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) / mean;
  };
  // metrics.getMetrics 안의 게임용 닫힘 판정과 글자 그대로 같은 식.
  const gameClosed = (points: Point[]) => {
    const shaped = curvePoints(points);
    return polylineLength(shaped) > 18 && pointDistance(shaped[0], shaped[shaped.length - 1]) < 8;
  };
  const allFinite = (points: Point[]) => points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  describe("toComplex / fromComplex", () => {
    test("캔버스 중심이 원점, 화면 오른쪽이 +re, 화면 위쪽이 +im", () => {
      expect(toComplex({ x: 50, y: 50 })).toEqual({ re: 0, im: 0 });
      expect(toComplex({ x: 80, y: 50 })).toEqual({ re: 30, im: 0 });
      expect(toComplex({ x: 50, y: 20 })).toEqual({ re: 0, im: 30 });
      expect(fromComplex({ re: 0, im: 30 })).toEqual({ x: 50, y: 20 });
    });

    test("왕복하면 원래 점으로 돌아온다", () => {
      let worst = 0;
      for (let x = -10; x <= 110; x += 3.7) {
        for (let y = -10; y <= 110; y += 3.7) {
          const back = fromComplex(toComplex({ x, y }));
          worst = Math.max(worst, Math.abs(back.x - x), Math.abs(back.y - y));
        }
      }
      expect(worst).toBeLessThan(1e-12);
    });
  });

  describe("classifyClosure", () => {
    test("350° 호는 닫힘, 345°/320° 호는 열림", () => {
      expect(classifyClosure(arcPoints(360))).toBe("closed");
      expect(classifyClosure(arcPoints(350))).toBe("closed");
      expect(classifyClosure(arcPoints(345))).toBe("open");
      expect(classifyClosure(arcPoints(320))).toBe("open");
      expect(classifyClosure(arcPoints(180))).toBe("open");
    });

    test("퇴화 획은 NaN 없이 point", () => {
      expect(classifyClosure(Array.from({ length: 12 }, () => ({ x: 40, y: 60 })))).toBe("point");
      expect(classifyClosure([])).toBe("point");
      expect(classifyClosure([{ x: 10, y: 10 }])).toBe("point");
      expect(classifyClosure([{ x: 50, y: 50 }, { x: 50.4, y: 50 }])).toBe("point");
      expect(classifyClosure([{ x: NaN, y: 50 }, { x: 80, y: 50 }])).toBe("point");
      expect(classifyClosure([{ x: 50, y: 50 }, { x: 51, y: 50 }])).toBe("open");
    });

    test("긴 직선은 열림", () => {
      expect(classifyClosure([{ x: 20, y: 50 }, { x: 80, y: 50 }])).toBe("open");
    });

    test("분석용 닫힘은 게임용 닫힘의 진부분집합", () => {
      let violations = 0;
      let gameOnly = 0;
      for (let radius = 5; radius <= 45; radius += 5) {
        for (let degrees = 90; degrees <= 360; degrees += 1) {
          const points = arcPoints(degrees, radius);
          const analysis = classifyClosure(points) === "closed";
          const game = gameClosed(points);
          if (analysis && !game) violations += 1;
          if (game && !analysis) gameOnly += 1;
        }
      }
      expect(violations).toBe(0);
      expect(gameOnly).toBe(176);
      expect(classifyClosure(arcPoints(345))).toBe("open");
      expect(gameClosed(arcPoints(345))).toBe(true);
    });

    // endStroke 는 simplify 로 점을 걷어낸 뒤에 판정을 동결한다(스펙 §3). 그 순서에서 판정이 뒤집히면
    // 사용자는 원을 그렸는데 앱은 열린 획으로 적합하고, 그 증상은 "항이 1개가 아니라 5개"로만 나타난다.
    test("endStroke 파이프라인: simplify 를 거쳐도 판정이 뒤집히지 않는다", () => {
      const drawn = arcPoints(360, 30, 64);
      const simplified = simplify(drawn, SIMPLIFY_TOLERANCE);
      expect(simplified.length).toBe(32);
      expect(classifyClosure(drawn)).toBe("closed");
      expect(classifyClosure(simplified)).toBe("closed");

      // 손떨림 원: 반지름에 0.25 단위 고주파 리플을 얹은 240 점. RDP 가 18 점까지 줄여도 닫힘이다.
      const shaky = Array.from({ length: 240 }, (_, index) => {
        const angle = (2 * Math.PI * index) / 239;
        const radius = 30 + 0.25 * Math.sin(index * 12.9898);
        return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
      });
      expect(simplify(shaky, SIMPLIFY_TOLERANCE).length).toBe(18);
      expect(classifyClosure(simplify(shaky, SIMPLIFY_TOLERANCE))).toBe("closed");

      // 열린 호는 simplify 가 한 점도 못 줄여도 그대로 열림이어야 한다.
      expect(classifyClosure(simplify(arcPoints(345), SIMPLIFY_TOLERANCE))).toBe("open");
    });
  });
  ```

- [ ] **Step 3: 빨강 확인 — 모듈이 없어서 스위트 자체가 뜨지 않는다**

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/resample.test.ts
  ```

  예상 출력:
  ```
   ❯ lib/resample.test.ts (0 test)

  ⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

   FAIL  lib/resample.test.ts [ lib/resample.test.ts ]
  Error: Cannot find package '@/lib/resample' imported from .../lib/resample.test.ts
   ❯ lib/resample.test.ts:4:1

   Test Files  1 failed (1)
        Tests  no tests
  ```
  오류가 `'@/lib/resample'`이 아니라 `'@/lib/geometry'`를 가리키면 Step 1의 별칭 확인을 건너뛴 것이다.

- [ ] **Step 4: 좌표 변환 + 닫힘 판정 구현**

  `lib/resample.ts`를 새로 만든다.

  ```ts
  // 획을 호길이 균등 표본으로 바꾼다. 푸리에 계수는 매개변수화에 의존하므로 이 모듈이 틀리면 뒤가 전부 무의미해진다.
  //
  // 좌표는 여기서 단 한 번 z = conj(p − 중심) 으로 옮긴다. 화면의 "중심 이동 + y 뒤집기"가
  // 수학 좌표에서는 켤레 한 번이라, 이후 모든 대칭 연산자에 평행이동 항이 등장하지 않는다.

  import { curvePoints, pointDistance, type Closure, type Point } from "@/lib/geometry";

  export type Complex = { re: number; im: number };

  export const CENTER: Point = { x: 50, y: 50 };
  export const POINT_ARC_LENGTH = 1.0;
  export const CLOSED_MIN_LENGTH = 18;

  export const toComplex = (point: Point): Complex => ({ re: point.x - CENTER.x, im: CENTER.y - point.y });
  export const fromComplex = (z: Complex): Point => ({ x: CENTER.x + z.re, y: CENTER.y - z.im });

  export const polylineLength = (poly: Point[]): number => {
    let total = 0;
    for (let index = 1; index < poly.length; index += 1) total += pointDistance(poly[index - 1], poly[index]);
    return total;
  };

  // 커밋 시 1회만 부른다(E7). L·g 를 게임 지표와 똑같이 curvePoints 위에서 재므로 분석용 closed 가 게임용 closed 의 진부분집합이 된다.
  export function classifyClosure(points: Point[]): Closure {
    const shaped = curvePoints(points);
    if (shaped.length < 2) return "point";
    const length = polylineLength(shaped);
    if (!(length >= POINT_ARC_LENGTH)) return "point"; // NaN 도 여기서 point 로 떨어진다
    const gap = pointDistance(shaped[0], shaped[shaped.length - 1]);
    const limit = Math.min(8, Math.max(1.5, 0.03 * length));
    return length > CLOSED_MIN_LENGTH && gap <= limit ? "closed" : "open";
  }
  ```

  `!(length >= 1.0)`은 부정형이 아니라 NaN 처리다. `length > 1.0`으로 쓰면 NaN 입력이 아래로 새어 나가 `open`이 되고, E2의 NaN 전파 경로가 그대로 열린다. **이 한 줄이 E2의 입력단 판정도 겸한다** — Step 18의 `endStroke`가 "호길이 < 1.0이면 폐기"를 이 함수의 `"point"` 반환으로 읽는다.

- [ ] **Step 5: 초록 확인 후 커밋**

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/resample.test.ts
  ```

  예상 출력:
  ```
   Test Files  1 passed (1)
        Tests  7 passed (7)
  ```

  ```bash
  git add lib/resample.ts lib/resample.test.ts
  git commit -m "add complex frame and closure classifier"
  ```

- [ ] **Step 6: densify 테스트 추가 (실패하는 테스트)**

  `lib/resample.test.ts`의 resample import를 넓힌다.

  ```ts
  import {
    classifyClosure, densify, fromComplex, MAX_DENSE_POINTS, polylineLength, toComplex
  } from "@/lib/resample";
  ```

  파일 끝에 describe를 덧붙인다.

  ```ts
  describe("densify", () => {
    test("렌더와 같은 곡선을 더 촘촘히 훑는다", () => {
      const points = arcPoints(350);
      const { poly, length } = densify(points, false);
      const renderedLength = polylineLength(curvePoints(points));
      expect(poly[0]).toEqual(points[0]);
      expect(pointDistance(poly[poly.length - 1], points[points.length - 1])).toBeLessThan(1e-12);
      expect(length).toBeGreaterThanOrEqual(renderedLength);
      expect(length - renderedLength).toBeLessThan(0.05);
      expect(Math.max(...gapsOf(poly, false))).toBeLessThan(0.3);
    });

    test("닫힘이면 마지막 제어점에서 첫 제어점으로 돌아오는 직선 현이 붙는다", () => {
      const points = arcPoints(350);
      const open = densify(points, false);
      const closed = densify(points, true);
      const chord = pointDistance(points[points.length - 1], points[0]);
      // 현의 길이만큼만 늘어난다 = 닫는 구간이 직선이라는 뜻이다. 이웃을 순환으로 감으면 이 등식이 깨진다.
      expect(closed.length - open.length).toBeCloseTo(chord, 9);
      expect(pointDistance(closed.poly[closed.poly.length - 1], points[0])).toBeLessThan(1e-12);
      // 열림 구간의 좌표는 closed 여부와 무관하게 글자 그대로 같다.
      expect(closed.poly.slice(0, open.poly.length)).toEqual(open.poly);
    });

    test("퇴화 입력에서 길이 0 을 돌려주고 NaN 을 만들지 않는다", () => {
      const same = Array.from({ length: 12 }, () => ({ x: 40, y: 60 }));
      const degenerate = densify(same, false);
      expect(degenerate.length).toBe(0);
      expect(allFinite(degenerate.poly)).toBe(true);
      expect(densify([], false)).toEqual({ poly: [], length: 0 });
      expect(densify([{ x: 3, y: 4 }], false)).toEqual({ poly: [{ x: 3, y: 4 }], length: 0 });
    });

    test("1차 평가가 4096 점을 넘으면 간격을 다시 잡는다", () => {
      const zigzag = Array.from({ length: 81 }, (_, index) => ({ x: index % 2 ? 88 : 12, y: 6 + (index * 88) / 80 }));
      let firstPass = 1;
      for (let index = 0; index < zigzag.length - 1; index += 1) {
        firstPass += Math.min(64, Math.max(4, Math.ceil(pointDistance(zigzag[index], zigzag[index + 1]) / 0.25)));
      }
      expect(firstPass).toBeGreaterThan(MAX_DENSE_POINTS);
      const { poly } = densify(zigzag, false);
      expect(poly.length).toBeLessThan(firstPass);
      // 세그먼트마다 ceil 하므로 정확히 4096 은 아니고 세그먼트 수만큼 넘칠 수 있다.
      expect(poly.length).toBeLessThanOrEqual(MAX_DENSE_POINTS + zigzag.length);
    });
  });
  ```

  두 번째 테스트의 세 단언이 D-G(순환 감기 금지)를 코드로 못 박는다. 이웃을 순환으로 감으면 닫는 구간이 곡선이 되어 길이 차가 현 길이보다 커지고, 첫 세그먼트의 `p0`가 바뀌어 `closed.poly.slice(...)  === open.poly`가 깨진다.

  마지막 단언이 `≤ 4096`이 아니라 `≤ 4096 + 제어점 수`인 이유는 실측이다: 1차 5121점짜리 지그재그가 재계산 후 4161점이 된다. 세그먼트마다 `ceil`하므로 스펙의 `L/4096`은 정확한 상한이 아니라 목표값이고, 뒤에서 P ≤ 512로 다시 줄이므로 65점의 초과는 무해하다. `≤ 4096`으로 쓰면 이 테스트는 반드시 실패한다.

- [ ] **Step 7: 빨강 확인**

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/resample.test.ts
  ```

  예상 출력:
  ```
   ❯ lib/resample.test.ts (11 tests | 4 failed) 54ms
       × 렌더와 같은 곡선을 더 촘촘히 훑는다
       × 닫힘이면 마지막 제어점에서 첫 제어점으로 돌아오는 직선 현이 붙는다
       × 퇴화 입력에서 길이 0 을 돌려주고 NaN 을 만들지 않는다
       × 1차 평가가 4096 점을 넘으면 간격을 다시 잡는다

   FAIL  lib/resample.test.ts > densify > 렌더와 같은 곡선을 더 촘촘히 훑는다
  TypeError: densify is not a function
  ```

- [ ] **Step 8: densify 구현**

  `lib/resample.ts`의 상수 블록을 이렇게 바꾼다(네 줄 추가).

  ```ts
  export const CENTER: Point = { x: 50, y: 50 };
  export const DENSE_SPACING = 0.25;
  export const MAX_DENSE_POINTS = 4096;
  export const MIN_SEGMENT_STEPS = 4;
  export const MAX_SEGMENT_STEPS = 64;
  export const POINT_ARC_LENGTH = 1.0;
  export const CLOSED_MIN_LENGTH = 18;
  ```

  `fromComplex` 아래, `polylineLength` 위에 곡선 평가기를 넣는다.

  ```ts
  // geometry.curvePoints 와 같은 Catmull-Rom 식. 스텝 수만 세그먼트 길이에 맞춰 바뀐다.
  const catmullRomAt = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
    const t2 = t * t; const t3 = t2 * t;
    return {
      x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
  };
  ```

  `polylineLength` 아래에 densify 본체를 넣는다.

  ```ts
  const stepsFor = (chord: number, spacing: number) =>
    Math.min(MAX_SEGMENT_STEPS, Math.max(MIN_SEGMENT_STEPS, Math.ceil(chord / spacing)));

  const evaluateAt = (points: Point[], closed: boolean, spacing: number): Point[] => {
    const poly: Point[] = [points[0]];
    for (let index = 0; index < points.length - 1; index += 1) {
      // 끝단을 클램프한다. geometry.curvePoints 와 글자 그대로 같아야 한다 — 여기가 갈라지면
      // 화면 곡선과 분석 곡선이 끝단에서만 조용히 달라지고, 증상은 "정확도 99% 인데 오버레이 끝이 어긋남"이다.
      const p0 = points[index - 1] ?? points[index];
      const p1 = points[index]; const p2 = points[index + 1];
      const p3 = points[index + 2] ?? p2;
      const steps = stepsFor(pointDistance(p1, p2), spacing);
      for (let step = 1; step <= steps; step += 1) poly.push(catmullRomAt(p0, p1, p2, p3, step / steps));
    }
    // 닫힘 획은 렌더의 Z 와 같은 직선 현으로 되돌아온다. 이웃을 순환으로 감지 않는 이유가 이것이다:
    // 화면이 pathFor(points, true) 로 직선 현을 그리므로, 순환으로 감으면 분석만 다른 곡선을 보게 된다(스펙 §1.2).
    if (closed) {
      const from = points[points.length - 1]; const to = points[0];
      const steps = stepsFor(pointDistance(from, to), spacing);
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        poly.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      }
    }
    return poly;
  };

  // 렌더와 같은 곡선을 간격 0.25 로 훑는다. 선형보간 새그가 h²κ/8 ≈ 0.008 로 절대 오차 하한 0.15 보다 한 자릿수 작다.
  export function densify(points: Point[], closed: boolean): { poly: Point[]; length: number } {
    if (!points.length) return { poly: [], length: 0 };
    if (points.length === 1) return { poly: [points[0]], length: 0 };
    let poly = evaluateAt(points, closed, DENSE_SPACING);
    let length = polylineLength(poly);
    // 세그먼트마다 ceil 하므로 재계산 후 개수는 MAX_DENSE_POINTS + 세그먼트 수까지 뜬다. 뒤가 P ≤ 512 로 다시 줄이므로 무해하다.
    if (poly.length > MAX_DENSE_POINTS && length > 0) {
      poly = evaluateAt(points, closed, length / MAX_DENSE_POINTS);
      length = polylineLength(poly);
    }
    return { poly, length };
  }
  ```

- [ ] **Step 9: 초록 확인 후 커밋**

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/resample.test.ts
  ```

  예상 출력:
  ```
   Test Files  1 passed (1)
        Tests  11 passed (11)
  ```

  ```bash
  git add lib/resample.ts lib/resample.test.ts
  git commit -m "densify strokes along render curve"
  ```

- [ ] **Step 10: resampleUniform 테스트 추가 (실패하는 테스트)**

  import를 다시 넓힌다.

  ```ts
  import {
    classifyClosure, densify, fromComplex, MAX_DENSE_POINTS, polylineLength, resampleUniform, toComplex
  } from "@/lib/resample";
  ```

  파일 끝에 덧붙인다.

  ```ts
  describe("resampleUniform", () => {
    test("닫힘: 표본 P 개, 끝점 중복 없음, 호길이 등간격", () => {
      const { poly, length } = densify(arcPoints(360, 30, 33), true);
      const samples = resampleUniform(poly, length, 256, true);
      expect(samples.length).toBe(256);
      expect(allFinite(samples)).toBe(true);
      const gaps = gapsOf(samples, true);
      expect(gaps.length).toBe(256);
      expect(spreadOf(gaps)).toBeLessThan(1e-3);
      expect(gaps.reduce((sum, gap) => sum + gap, 0) / 256).toBeCloseTo(length / 256, 3);
    });

    test("열림: 표본 P+1 개, 양 끝 포함", () => {
      const { poly, length } = densify(arcPoints(350), false);
      const samples = resampleUniform(poly, length, 128, false);
      expect(samples.length).toBe(129);
      expect(pointDistance(samples[0], poly[0])).toBeLessThan(1e-12);
      expect(pointDistance(samples[128], poly[poly.length - 1])).toBeLessThan(1e-9);
      expect(spreadOf(gapsOf(samples, false))).toBeLessThan(1e-3);
    });

    test("직선은 정확히 등간격", () => {
      const { poly, length } = densify([{ x: 20, y: 50 }, { x: 80, y: 50 }], false);
      expect(length).toBe(60);
      const gaps = gapsOf(resampleUniform(poly, length, 128, false), false);
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-12);
      expect(gaps[0]).toBeCloseTo(60 / 128, 12);
    });

    test("퇴화 폴리라인도 NaN 을 만들지 않는다", () => {
      const { poly, length } = densify(Array.from({ length: 12 }, () => ({ x: 40, y: 60 })), false);
      const samples = resampleUniform(poly, length, 128, false);
      expect(samples.length).toBe(129);
      expect(samples.every((point) => point.x === 40 && point.y === 60)).toBe(true);
      expect(resampleUniform([], 0, 128, false)).toEqual([]);
    });

    test("실전 경로: 350° 호는 닫힘 판정이므로 닫힌 현까지 포함해 등간격", () => {
      const points = arcPoints(350);
      expect(classifyClosure(points)).toBe("closed");
      const { poly, length } = densify(points, true);
      expect(length).toBeCloseTo(188.4492, 3);
      const samples = resampleUniform(poly, length, 378, true);
      expect(samples.length).toBe(378);
      expect(spreadOf(gapsOf(samples, true))).toBeLessThan(1e-3);
    });
  });
  ```

  등간격성을 **매끄러운** 픽스처에서만 재는 이유: 지그재그처럼 꺾인 도형은 호길이로는 완벽히 균등해도 코너를 가로지르는 인접 표본의 유클리드 거리가 짧아진다(실측 sd/mean 2.3e-1). 이는 재샘플 버그가 아니라 기하이므로, 이 단언을 꺾인 픽스처로 옮기면 옳은 구현이 실패한다. 350° 닫힘 경로의 2.742e-4가 세 픽스처 중 가장 큰 것도 같은 이유다(닫는 현의 꺾임).

- [ ] **Step 11: 빨강 확인**

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/resample.test.ts
  ```

  예상 출력:
  ```
   ❯ lib/resample.test.ts (16 tests | 5 failed) 180ms
       × 닫힘: 표본 P 개, 끝점 중복 없음, 호길이 등간격
       × 열림: 표본 P+1 개, 양 끝 포함
       × 직선은 정확히 등간격
       × 퇴화 폴리라인도 NaN 을 만들지 않는다
       × 실전 경로: 350° 호는 닫힘 판정이므로 닫힌 현까지 포함해 등간격

   FAIL  lib/resample.test.ts > resampleUniform > 닫힘: 표본 P 개, 끝점 중복 없음, 호길이 등간격
  TypeError: resampleUniform is not a function
  ```

- [ ] **Step 12: resampleUniform 구현**

  `lib/resample.ts`의 `densify` 아래, `classifyClosure` 위에 넣는다.

  ```ts
  // 누적 현길이 표 + two-pointer 전진. u_k 가 단조 증가하므로 이진탐색이 필요 없다 — O(|D| + P).
  export function resampleUniform(poly: Point[], length: number, P: number, closed: boolean): Point[] {
    const count = closed ? P : P + 1;
    if (!poly.length) return [];
    if (poly.length === 1 || !(length > 0)) return Array.from({ length: count }, () => poly[0]);

    const table = new Array<number>(poly.length);
    table[0] = 0;
    for (let index = 1; index < poly.length; index += 1) table[index] = table[index - 1] + pointDistance(poly[index - 1], poly[index]);
    const total = table[poly.length - 1];

    const samples: Point[] = [];
    let segment = 0;
    for (let k = 0; k < count; k += 1) {
      const u = Math.min(total, (k * length) / P);
      while (segment < poly.length - 2 && table[segment + 1] < u) segment += 1;
      const span = table[segment + 1] - table[segment];
      const t = span > 0 ? (u - table[segment]) / span : 0;
      const a = poly[segment]; const b = poly[segment + 1];
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return samples;
  }
  ```

  세 개의 방어가 각각 다른 실패를 막는다. `Math.min(total, …)`와 `segment < poly.length - 2`는 E14(마지막 표본 `s == L`에서 `poly[segment + 1]`이 undefined)를 막고, `span > 0 ? … : 0`은 닫힘 획의 길이 0짜리 현(마지막 제어점이 첫 제어점과 겹칠 때 실제로 생긴다)에서 `0/0 → NaN`이 전 계수로 번지는 것을 막는다. `!(length > 0)`은 다시 NaN 처리다.

- [ ] **Step 13: 초록 확인 후 커밋**

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/resample.test.ts
  ```

  예상 출력:
  ```
   Test Files  1 passed (1)
        Tests  16 passed (16)
  ```

  ```bash
  git add lib/resample.ts lib/resample.test.ts
  git commit -m "resample strokes at uniform arc length"
  ```

- [ ] **Step 14: 상환 1/3 — decodeShare의 임시 closure를 겨냥한 테스트 + 빨강 확인**

  `lib/share.test.ts`를 새로 만든다.

  ```ts
  import { describe, expect, test } from "vitest";

  import type { Point, Stroke } from "@/lib/geometry";
  import { decodeShare, encodeShare } from "@/lib/share";

  const arcPoints = (degrees: number, radius = 30, count = 24): Point[] =>
    Array.from({ length: count }, (_, index) => {
      const angle = ((degrees * Math.PI) / 180) * (index / (count - 1));
      return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
    });

  const strokeOf = (points: Point[]): Stroke =>
    ({ id: "fixture", points, symmetry: "free", rotationCount: 6, closure: "open" });

  describe("decodeShare 의 closure", () => {
    test("링크로 받은 원은 closed, 직선은 open, 한 점은 point 로 복원된다", async () => {
      const strokes = [
        strokeOf(arcPoints(360, 30, 33)),
        strokeOf([{ x: 20, y: 50 }, { x: 80, y: 50 }]),
        strokeOf([{ x: 40, y: 60 }, { x: 40, y: 60 }])
      ];
      const decoded = await decodeShare(await encodeShare({ strokes, attributes: ["light"] }));
      expect(decoded?.strokes.map((stroke) => stroke.closure)).toEqual(["closed", "open", "point"]);
    });

    test("0.1 단위 양자화를 거쳐도 경계 근처 획의 판정이 유지된다", async () => {
      const encoded = await encodeShare({ strokes: [strokeOf(arcPoints(350))], attributes: ["light"] });
      const decoded = await decodeShare(encoded);
      expect(decoded?.strokes[0].closure).toBe("closed");
    });
  });
  ```

  픽스처의 `closure: "open"`은 일부러 틀린 값을 넣은 것이다. 인코더는 closure를 링크에 싣지 않으므로(좌표에서 재계산하는 편이 싸고 형식도 안 늘어난다) 디코더가 이 값을 그대로 되돌려주면 안 된다. 두 번째 테스트가 재는 것은 양자화 여유다 — 실측으로 350° 호는 양자화 후 g=5.2240, limit=5.4960으로 **여유 0.2720**이고 0.1 단위 반올림이 만들 수 있는 최대 편차(≈0.141)보다 크다.

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/share.test.ts
  ```

  예상 출력 (Task 2가 넣어 둔 `closure: "open"`이 그대로 있으므로):
  ```
   ❯ lib/share.test.ts (2 tests | 2 failed) 19ms
       × 링크로 받은 원은 closed, 직선은 open, 한 점은 point 로 복원된다
       × 0.1 단위 양자화를 거쳐도 경계 근처 획의 판정이 유지된다

   FAIL  lib/share.test.ts > decodeShare 의 closure > 링크로 받은 원은 closed, 직선은 open, 한 점은 point 로 복원된다
  AssertionError: expected [ 'open', 'open', 'open' ] to deeply equal [ 'closed', 'open', 'point' ]
  ```

  `CompressionStream`/`DecompressionStream`/`Blob`/`btoa`는 Node 22에 전역으로 있으므로 jsdom 없이 vitest 기본 node 환경에서 그대로 돈다.

- [ ] **Step 15: decodeShare를 classifyClosure로 교체 + 초록 + 커밋**

  `lib/share.ts`의 import 블록(현재 6~7행) 아래에 한 줄을 더한다.

  ```ts
  import { ATTRIBUTE_ORDER, sanitizeAttributes, type Attribute } from "@/lib/attributes";
  import { newId, type Point, type Stroke, type Symmetry } from "@/lib/geometry";
  import { classifyClosure } from "@/lib/resample";
  ```

  `decodeShare` 안의 push를 바꾼다. 바꾸기 전(Task 2가 남긴 상태):

  ```ts
      if (points.length < 2) continue;
      strokes.push({ id: newId(), points, symmetry, rotationCount: Math.min(12, Math.max(1, Math.round(rotationCount))), closure: "open" });
  ```

  바꾼 뒤:

  ```ts
      if (points.length < 2) continue;
      strokes.push({
        id: newId(), points, symmetry,
        rotationCount: Math.min(12, Math.max(1, Math.round(rotationCount))),
        // 링크에는 closure 를 싣지 않는다. 좌표에서 다시 판정해야 보낸 사람과 받은 사람의 식이 같아진다.
        closure: classifyClosure(points)
      });
  ```

  (`newId()` 부분은 Task 2가 넣은 그대로 둔다. 이 스텝이 바꾸는 것은 `closure` 한 필드뿐이다.)

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/share.test.ts
  ```

  예상 출력:
  ```
   Test Files  1 passed (1)
        Tests  2 passed (2)
  ```

  ```bash
  git add lib/share.ts lib/share.test.ts
  git commit -m "classify closure on shared link decode"
  ```

- [ ] **Step 16: 상환 2/3 — reviveStroke를 겨냥한 테스트 추가 + 빨강 확인**

  `lib/storage.test.ts`의 `const line = …` 아래에 픽스처 하나를 더한다.

  ```ts
  const line = [{ x: 10, y: 10 }, { x: 90, y: 90 }];
  // 반지름 30 의 완전한 원(제어점 33개, 마지막이 첫 점과 겹친다).
  const circle = Array.from({ length: 33 }, (_, index) => {
    const angle = (2 * Math.PI * index) / 32;
    return { x: 50 + 30 * Math.cos(angle), y: 50 - 30 * Math.sin(angle) };
  });
  ```

  `describe("loadDraft", …)` 블록 끝에 두 개를 덧붙인다.

  ```ts
    it("closure 가 없는 항목은 좌표에서 판정한다", () => {
      put([{ points: circle, symmetry: "free", rotationCount: 6 }]);
      expect(loadDraft()[0].closure).toBe("closed");
    });

    it("같은 좌표 두 점은 point 로 복원된다", () => {
      put([{ points: [{ x: 40, y: 60 }, { x: 40, y: 60 }] }]);
      expect(loadDraft()[0].closure).toBe("point");
    });
  ```

  기존 12개는 하나도 깨지지 않는다. 근거 두 줄: (a) `"v1 맨 배열에 id와 closure를 채워 넣는다"`의 픽스처는 직선이고 `classifyClosure(line)`이 실측으로 `"open"`이다(L=113.14, g=113.14). (b) `"v2 봉투를 읽고 기존 id를 유지한다"`는 `closure: "closed"`를 명시적으로 저장했고, 아래 구현은 저장된 값이 있으면 다시 재지 않는다 — 이것이 E7의 "커밋 시 1회 판정 후 동결"이다.

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/storage.test.ts
  ```

  예상 출력:
  ```
   ❯ lib/storage.test.ts (14 tests | 2 failed) 21ms
       × closure 가 없는 항목은 좌표에서 판정한다
       × 같은 좌표 두 점은 point 로 복원된다

   FAIL  lib/storage.test.ts > loadDraft > closure 가 없는 항목은 좌표에서 판정한다
  AssertionError: expected 'open' to be 'closed'
  ```

- [ ] **Step 17: reviveStroke의 closure 폴백 교체 + 초록 + 커밋**

  `lib/storage.ts`의 import 블록에 한 줄을 더한다.

  ```ts
  import { newId, simplify, SIMPLIFY_TOLERANCE, type Closure, type Point, type Stroke, type Symmetry } from "@/lib/geometry";
  import { classifyClosure } from "@/lib/resample";
  ```

  `reviveStroke`에서 `closure`를 정하는 **한 줄만** 바꾼다.

  ```ts
  const closure = CLOSURES.find((item) => item === raw.closure) ?? "open";
  ```
  →
  ```ts
  // 저장된 동결값이 있으면 그대로 쓴다(E7). 없는 v1 항목만 좌표에서 판정한다 — simplify 를 거친 최종 좌표에서.
  const closure = CLOSURES.find((item) => item === raw.closure) ?? classifyClosure(points);
  ```

  바꾼 뒤 함수 전체는 이렇게 읽혀야 한다(Task 2가 E13으로 넣은 `simplify` 한 줄을 포함한 상태다 — Task 2가 그 줄의 변수 이름을 다르게 잡았다면 `classifyClosure`에 넘기는 것이 **`simplify`를 거친 최종 `points`**인지만 확인하고 그 이름을 쓴다. 저장된 원본이 아니라 앱이 실제로 그리는 좌표에서 판정해야 화면과 식이 같아진다).

  ```ts
  // 획 하나가 깨져도 나머지는 살린다. 통째로 버리면 그건 복구가 아니라 데이터 손실이다.
  const reviveStroke = (raw: unknown, taken: Set<string>): Stroke | null => {
    if (!isRecord(raw)) return null;
    const revived = revivePoints(raw.points);
    if (revived.length < 2) return null;
    // E13: 출처와 무관하게 저장 형식을 한 번 정규화한다. 레거시 노이즈 점군이 원 하나에 40항을 만드는 경로를 여기서 닫는다.
    const points = simplify(revived, SIMPLIFY_TOLERANCE);
    const id = typeof raw.id === "string" && raw.id.length > 0 && !taken.has(raw.id) ? raw.id : newId();
    taken.add(id);
    // v1 드래프트는 전부 툴바 기본값(회전 6)으로 그려졌다. "free"로 낮추면 복사본이 사라져 그림 자체가 바뀐다.
    const symmetry = SYMMETRIES.find((item) => item === raw.symmetry) ?? "rotate";
    // rotationCount 0/누락은 각도 2π·k/0 = Infinity → NaN 좌표 → path 소멸로 이어진다.
    const rotationCount = Math.min(8, Math.max(2, Math.round(Number(raw.rotationCount)) || 6));
    // 저장된 동결값이 있으면 그대로 쓴다(E7). 없는 v1 항목만 좌표에서 판정한다 — simplify 를 거친 최종 좌표에서.
    const closure = CLOSURES.find((item) => item === raw.closure) ?? classifyClosure(points);
    return { id, points, symmetry, rotationCount, closure };
  };
  ```

  `lib/storage.ts → lib/resample.ts → lib/geometry.ts`는 단방향이다. 순환 import가 생기지 않는다(스펙 §2의 의존 방향과 같다).

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/storage.test.ts
  ```

  예상 출력:
  ```
   Test Files  1 passed (1)
        Tests  14 passed (14)
  ```

  ```bash
  git add lib/storage.ts lib/storage.test.ts
  git commit -m "classify closure when reviving drafts"
  ```

- [ ] **Step 18: 상환 3/3 — `endStroke`에서 closure를 동결한다 (이 태스크의 핵심)**

  여기가 빠지면 캔버스에서 그린 모든 획이 영구히 `"open"`이 되고 닫힘 DFT 경로가 앱에서 한 번도 실행되지 않는다. 스펙 §3은 `pointerup / endStroke → simplify → classifyClosure(points) → closure 동결`을 명시한다.

  `app/page.tsx`의 import 블록(Task 2 적용 후)에 한 줄을 넣는다. 순서는 모듈 경로 알파벳순을 유지한다.

  ```tsx
  import { newId, pointDistance, simplify, SIMPLIFY_TOLERANCE, type Stroke, type Symmetry } from "@/lib/geometry";
  import { getMetrics } from "@/lib/metrics";
  import { classifyClosure } from "@/lib/resample";
  import { encodeShare } from "@/lib/share";
  import { loadDraft, saveDraft } from "@/lib/storage";
  import StrokeLayer from "@/app/_components/StrokeLayer";
  ```

  `endStroke`(현재 87~95행, Task 2가 E2 살균을 넣은 상태) **전체**를 아래로 교체한다.

  ```tsx
  const endStroke = () => {
    if (active && active.points.length > 2) {
      const points = simplify(active.points, SIMPLIFY_TOLERANCE);
      // 커밋 시 1회 판정해 동결한다(E7). 매번 다시 재면 임계 근처에서 같은 그림의 식 형태가 흔들린다.
      const closure = classifyClosure(points);
      // E2 입력단: 호길이 1.0 미만은 획이 아니라 탭이다. classifyClosure 가 이미 그 길이를 재고
      // !(L >= POINT_ARC_LENGTH) 일 때 "point" 를 돌려주므로 길이를 두 번 재지 않는다.
      if (closure !== "point") {
        setStrokes((current) => [...current, { ...active, points, closure }]);
        setRedoStack([]);
      }
    }
    setActive(null);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => undefined, 100);
  };
  ```

  Task 2가 E2용으로만 끌어온 import(`curvePoints`·`polylineLength` 등)가 이 교체로 쓰이지 않게 되면 그 줄에서 지운다. `startStroke`의 `closure: "open"`은 **그대로 둔다** — 활성 획은 절대 분석하지 않으므로(스펙 §3) 값이 소비되지 않는 임시값이고, 여기서 판정하면 그리는 도중 프레임마다 분기가 뒤집힌다.

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit
  ```
  `tsc`는 아무것도 출력하지 않고 종료 코드 0.

  이 경로는 React 이벤트 핸들러라 `lib/` 순수 함수 테스트로 덮이지 않는다(스펙 §7: jsdom 없음). 순수 함수 쪽 절반은 Step 2의 "endStroke 파이프라인" 테스트가 이미 고정했고, 배선은 dev 서버에서 눈으로 확인한다.

  ```js
  // 브라우저 devtools, http://localhost:3000 에서 원을 하나 그린 뒤
  JSON.parse(localStorage["arcana-draft-v1"]).strokes.map((s) => [s.points.length, s.closure])
  ```
  확인할 것: 원을 닫아서 그리면 `"closed"`, 직선을 그으면 `"open"`이 나온다. 캔버스를 한 번 톡 누르기만 하면(호길이 1.0 미만) 획이 커밋되지 않는다. 새로고침 후에도 같은 값이 유지된다(저장된 동결값을 다시 재지 않는다).

  ```bash
  git add app/page.tsx
  git commit -m "freeze stroke closure on commit"
  ```

- [ ] **Step 19: 닫힘 획을 공유 페이지와 OG 이미지에서도 실제로 닫는다**

  스펙 §1.2의 파생 결정이다 — 정확도의 진리값이 "화면에 그려진 곡선"이므로 캔버스·공유 페이지·모달이 같은 곡선을 그려야 한다. 캔버스(`StrokeLayer`)는 Task 2가, 모달 오버레이는 Task 10이 맡는다. 이 스텝은 서버 렌더 두 곳을 맞춘다.

  `app/s/[d]/page.tsx`의 58~60행을 바꾼다.

  ```tsx
        {strokes.flatMap((stroke, index) => strokeCopies(stroke).map((points, copy) =>
          // 닫힘 획은 렌더에서도 실제로 닫는다(스펙 §1.2). 보낸 사람의 캔버스와 받은 사람의 페이지가 같은 곡선이어야 한다.
          <path key={`${index}-${copy}`} d={pathFor(points, stroke.closure === "closed")} fill="none" strokeLinecap="round" strokeLinejoin="round"
            style={{ stroke: "url(#share-gradient)", strokeWidth: STROKE_WIDTH }} />))}
  ```

  `app/s/[d]/opengraph-image.tsx`의 41행을 바꾼다. OG 미리보기가 공유 페이지와 다른 그림을 보여주면 링크를 연 사람이 두 번 다른 마법진을 본다.

  ```tsx
    const paths = shared.strokes.flatMap((stroke) => strokeCopies(stroke).map((points) => pathFor(points, stroke.closure === "closed")));
  ```

  `Z`가 도형을 칠하지 않는다는 것은 세 렌더러 모두에서 확인했다: `.draw-stroke{fill:none}`(globals.css), 공유 페이지 `<path fill="none">`, OG의 `circleDataUri`가 만드는 `<path … fill="none" …>`.

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit
  ```
  무출력·종료 코드 0. dev 서버에서 원을 그려 「마법진 공유하기」로 링크를 만들고 그 링크를 새 탭에서 연다. 확인할 것: 공유 페이지의 원이 캔버스와 같은 자리에서 닫혀 있고, 직선 획은 아무것도 달라지지 않는다.

  ```bash
  git add app/s/\[d\]/page.tsx app/s/\[d\]/opengraph-image.tsx
  git commit -m "close closed strokes when rendering shares"
  ```

- [ ] **Step 20: 전체 회귀 확인**

  ```bash
  cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run && npx tsc --noEmit
  ```

  예상 출력: 테스트 파일 4개(`lib/geometry.test.ts`·`lib/storage.test.ts`·`lib/resample.test.ts`·`lib/share.test.ts`)가 **전부 통과**하고 실패 0. 이 태스크가 만든 몫은 `lib/resample.test.ts` 16 + `lib/share.test.ts` 2 + `lib/storage.test.ts`에 더한 2이고, `lib/geometry.test.ts`의 개수는 Task 1이 D-A의 `closed` 스냅샷을 몇 개로 나눴는지에 달렸으므로 총합을 단언하지 않는다 — 세는 것은 `Test Files 4 passed (4)`와 `failed 0`이다.

  ```
   Test Files  4 passed (4)
  ```

  `tsc --noEmit`은 아무것도 출력하지 않고 종료 코드 0. `npm run build`는 dev 서버가 쓰는 `.next`를 건드리므로 돌리지 않는다.

  마지막으로 앱에 남은 `closure: "open"` 리터럴이 `startStroke` 한 곳뿐인지 확인한다.

  ```bash
  grep -rn 'closure: "open"' app lib
  ```
  예상 출력: `app/page.tsx`의 `setActive({ id: newId(), … closure: "open" })` 한 줄만.

---

**이번 범위 밖**: E18(지우개 판정을 제어점 거리에서 점-선분 거리로)과 E19(`simplify` 재귀 깊이)는 이 태스크가 `app/page.tsx`의 같은 영역을 지나가지만 손대지 않는다. 스펙 §6이 인접 결함으로 분류하지 않았으나 이번 계획 10개 태스크 어디에도 배정되지 않았고, 별도 이슈로 남긴다.

---

All numbers verified against Task 3's actual `densify`. Here is the rewritten task.

### Task 4: lib/fourier.ts — 닫힌 획 DFT와 항 선택·정확도 (공유 코어 포함)

**Files:**
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.ts`
- Test: `/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.test.ts`
- Modify: 없음 (`app/`·`lib/metrics.ts`·`lib/share.ts`는 건드리지 않는다. UI 연결은 Task 7~10)

**Interfaces:**

*Consumes*
- `@/lib/geometry` (Task 2): `type Point`, `type Closure`
- `@/lib/resample` (Task 3): `type Complex`, `densify(points, closed)`, `resampleUniform(poly, length, P, closed)`, `toComplex(p)`, `fromComplex(z)`
- Task 1 (D-H): `vitest.config.ts`의 `resolve.alias`가 `@` → 프로젝트 루트를 푼다. 이 파일도 앱과 같은 `@/lib/...` import 문을 쓴다. 상대 경로로 우회하지 않는다.
- **Task 3의 `densify` 계약 (D-G 확정, 리뷰 1-G/5-D)** — 아래 두 문장이 이 태스크의 모든 기대값의 전제다. Step 1의 게이트 테스트가 이것을 코드로 못 박는다.
  1. `densify(points, true)`는 마지막 제어점 → 첫 제어점을 **직선 현**으로 잇고, Catmull-Rom 이웃은 **끝단에서 클램프**한다(`points[i-1] ?? points[i]`). **순환으로 감지 않는다.** 근거는 화면이다 — `pathFor(points, true)`가 `Z`(직선 현)로 닫으므로 클램프+직선 현이 화면 곡선과 일치하고, 스펙 §1.2는 "정확도의 진리값은 화면에 그려진 곡선"이라고 못 박았다.
  2. `resampleUniform(poly, L, P, true)`는 정확히 `P`개 점을 `u_k = kL/P` (k = 0..P−1, 끝점 중복 없음)로 돌려준다.
- 이 계약의 대가는 **닫는 현이 원 픽스처에 seam을 만든다**는 것이다. 반지름 30 원(제어점 64개)의 닫는 현은 `2·30·sin(π/64) = 2.94406`이고, 그 중점이 반지름 안쪽으로 `30(1−cos(π/64)) = 0.036136` 들어온다. 이 seam 하나가 원의 `maxError`(0.0341)를 지배한다 — 즉 **원의 `maxError/rmsError` 비율이 9.03이다**(순환 감기 가정에서는 2.58이었다). 국소 꺾임 보정의 `absFloor` 조건이 없으면 원이 2항이 되어 T3가 깨진다. Step 9가 이것을 테스트로 고정한다.

*Produces* (뒤 태스크가 이 시그니처에 의존한다)
```ts
export type { Complex } from "@/lib/resample"
export type Term = { n: number; re: number; im: number }
export type Candidate = Term & { energy: number }
export type FitStats = { P: number; arcLength: number; normS: number; rmsError: number; maxError: number; accuracy: number; capped: boolean }
export type Spectrum =
  | { kind: "point"; length: number }
  | { kind: "closed"; c0: Complex; terms: Term[]; stats: FitStats }
  | { kind: "open"; z0: Complex; delta: Complex; terms: Term[]; stats: FitStats }
export type ClosedSpectrum = Extract<Spectrum, { kind: "closed" }>
export type FitOptions = { target?: number; maxTerms?: number; absFloor?: number }

export const T_MAX = 24
export const TARGET_ACCURACY = 0.99
export const ABS_FLOOR = 0.15
export const MIN_ARC_LENGTH = 1e-6
export const amplitude: (term: { re: number; im: number }) => number
export const sampleCount: (arcLength: number) => number      // P = clamp(round(2L),128,512), 짝수
export const bandLimit: (P: number) => number                // K_max = min(floor(P/4), 64)
export function normOf(samples: Complex[]): number
export function dftClosed(samples: Complex[], band: number): { c0: Complex; terms: Term[]; cosTable: Float64Array; sinTable: Float64Array }
export function selectAndFinalize(samples: Complex[], candidates: Candidate[], tailEnergy: number, normS: number, arcLength: number, P: number, rebuild: (terms: Term[]) => Complex[], options?: FitOptions): { terms: Term[]; stats: FitStats }
export function fitClosed(samples: Complex[], arcLength: number, options?: FitOptions): ClosedSpectrum
export function fitStroke(points: Point[], closure: Closure, options?: FitOptions): Spectrum
export function truncate(spectrum: Spectrum, termCount: number): Spectrum
export function reconstruct(spectrum: Spectrum, q: number): Point[]
export function overlayPointCount(spectrum: Spectrum): number   // Q = clamp(8·max|n|, 64, 512)
```

**뒤 태스크와의 계약 (전부 확정 결정에 따름)**

- **D-D — Task 5는 이 파일을 재작성하지 않고 호출만 한다.** `normOf`·`selectAndFinalize`·`dftClosed`의 `cosTable`/`sinTable`은 Task 5가 앵커로 잡을 수 있도록 **이 태스크에서 먼저 쪼개 export한다.** Task 5가 추가하는 것은 `fitOpen` 하나와 `fitStroke` 마지막 분기 한 줄뿐이다. 정지조건·정확도·`maxError` 보정의 구현은 `selectAndFinalize` **하나뿐이고**, 이 태스크가 그것을 완성해서 넘긴다.
- **D-C — `terms`는 진폭(에너지) 내림차순으로 저장한다.** 닫힘·열림 모두. `selectAndFinalize`는 `n` 오름차순으로 재정렬하지 **않는다**. 이것이 `truncate(k)` = "진폭 상위 k개" 계약의 근거다. 표시용 `n` 정렬이 필요한 곳(모달 계수표)에서 각자 정렬한다.
- **D-F — 국소 꺾임 보정 조건은 `maxError > 3*rmsError && maxError > absFloor && count > 0 && count < ceiling`** 하나로 통일한다. `absFloor` 조건을 빼면 원이 2항이 된다(Step 9에서 테스트로 증명).
- **D-E — `{ kind: "point"; length }`의 `length`는 호길이다.** 항상 0이 아니다(`fitStroke(CIRCLE, "point")`는 185.548을 돌려준다). `toEqual({kind:"point", length:0})` 형태의 단언을 쓰지 않는다 — Task 7도 마찬가지다.
- **D-B — 이 모듈은 표시 문자열을 만들지 않는다.** `FitStats.accuracy`는 0~1 **숫자**다. `null`은 Task 7의 집계(유효 획 0)에서만 생기고, 문자열화는 `lib/formatting.ts`의 `formatAccuracy(accuracy: number | null): string` 하나뿐이다.
- **D-K — `truncate`/`reconstruct`의 `"open"` 분기는 Task 5가 반드시 채운다.** 이 태스크는 `kind !== "closed"`를 통과시키는 자리를 남기되, Task 5가 만족해야 할 식을 여기 명시한다. `truncate`: 진폭 상위 k항 슬라이스 + `normS` 기준 rms/accuracy 재계산(에너지 단위는 `(P/(2(P+1)))|b_n|²`). `reconstruct`: `z₀ + Δ·t + Σ b_n sin(πnt)`를 `t = j/(q−1)`, j = 0..q−1로 평가해 **닫힘과 같은 q개** 반환.
- **`applyOperator`는 이 파일에 넣지 않는다** (Task 6).
- **4-B** — `overlayPointCount`가 오버레이 점 수의 유일한 구현이다. Task 10은 `overlayQ`를 만들지 않고 이것을 import한다.
- `Spectrum`은 표본을 들고 다니지 않는다. 그래서 `truncate`는 `rmsError`/`accuracy`만 파스발로 다시 계산하고 `maxError`는 원래 적합값을 물려받는다(잘라낸 스펙트럼의 `maxError`는 화면에 표시하지 않는다).

**측정 근거** — 아래 모든 기대값은 Task 3의 실제 `densify`(클램프 + 직선 현) 위에서 이 계획의 코드를 그대로 `.mjs`로 옮겨 node로 실행해 얻은 실측이다(`/private/tmp/claude-501/-Users-yoma-projects-jamcoding-jangyunu/3f4104c7-fa88-4f58-9015-533d06633e7b/scratchpad/{t4v,t4gate,t4norm}.mjs`).

| 도형 | P | L | 정지 항 | 최종 항 | 정지 정확도 | 최종 정확도 | normS | 최종 maxError |
|---|---|---|---|---|---|---|---|---|
| 원 r=30 (제어점 64) | 378 | 188.492203 | **1** | **1** | 0.9998741 | 0.9998741 | 29.999100 | 0.034116 |
| 정사각형 | 480 | 240.102092 | **6** | **9** | 0.9902253 | 0.9945916 | 34.645780 | 0.944190 |
| 정육각형 | 360 | 180.116181 | **4** | **6** | 0.9916976 | 0.9954116 | 27.389878 | 0.496740 |
| 오각별 | 436 | 218.167774 | **8** | **12** | 0.9903255 | 0.9949019 | 20.890137 | 0.614750 |

스펙의 "원 1항 / 정사각형 6항 / 정육각형 4항 / 오각별 8항"은 **그리디 정지 시점의 항 수**로 정확히 재현되고(한 항 적으면 각각 0.9872027 · 0.9882091 · 0.9879917로 99% 미달), 스펙 §1.6의 `maxError > 3·e_A → 1.5배` 국소 꺾임 보호가 모서리 도형에서 발동해 최종 항 수가 9·6·12가 된다(발동 비율 4.198 · 3.327 · 4.651). 원의 비율은 9.030이지만 `maxError = 0.034 < ABS_FLOOR = 0.15`이라 발동하지 않는다.

---

- [ ] **Step 1: 커널 테스트 작성 — densify 계약 게이트 · P·K_max · 테이블 DFT · 파스발 · T6**

`/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.test.ts` 신규 생성. 픽스처 빌더는 뒤 스텝에서 쓸 것까지 여기서 한 번에 둔다.

```ts
// 이 스위트가 지키는 것: 정규화 상수, 대역 경계, 재매개화 균등성(T6),
// 그리고 "정확도가 거짓말하지 않는다"는 이 기능의 유일한 판매 근거(뒤 describe).

import { describe, expect, it } from "vitest";
import { densify, resampleUniform, toComplex, type Complex } from "@/lib/resample";
import { amplitude, bandLimit, dftClosed, normOf, sampleCount } from "@/lib/fourier";
import type { Point } from "@/lib/geometry";

// ── 픽스처: 캔버스 좌표(0..100, y 아래로 증가) 위의 닫힌 도형 제어점 ──
const circlePoints = (radius: number, count: number): Point[] =>
  Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count;
    return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
  });

// 꼭짓점 목록을 step 간격으로 찍어 모서리가 살아 있는 폐곡선을 만든다(꼭짓점 중복 없음).
const edgeLoop = (vertices: Point[], step: number): Point[] => {
  const out: Point[] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    const from = vertices[i];
    const to = vertices[(i + 1) % vertices.length];
    const parts = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / step));
    for (let s = 0; s < parts; s += 1) {
      out.push({ x: from.x + ((to.x - from.x) * s) / parts, y: from.y + ((to.y - from.y) * s) / parts });
    }
  }
  return out;
};

const regularPolygon = (sides: number, radius: number): Point[] =>
  Array.from({ length: sides }, (_, i) => {
    const angle = Math.PI / 2 + (Math.PI * 2 * i) / sides;
    return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
  });

const starPolygon = (points: number, outer: number): Point[] => {
  const inner = (outer * Math.cos((Math.PI * 2) / points)) / Math.cos(Math.PI / points);
  return Array.from({ length: points * 2 }, (_, i) => {
    const angle = Math.PI / 2 + (Math.PI * i) / points;
    const radius = i % 2 === 0 ? outer : inner;
    return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
  });
};

const CIRCLE = circlePoints(30, 64);
const SQUARE = edgeLoop([{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }], 1);
const HEXAGON = edgeLoop(regularPolygon(6, 30), 1);
const PENTAGRAM = edgeLoop(starPolygon(5, 30), 1);

// 분석 파이프라인과 같은 경로로 표본을 만든다: densify → resampleUniform → toComplex
const closedSamples = (points: Point[]) => {
  const { poly, length } = densify(points, true);
  const P = sampleCount(length);
  return { P, length, samples: resampleUniform(poly, length, P, true).map(toComplex) };
};

describe("Task 3 densify 계약 게이트", () => {
  // 이 태스크의 모든 기대값이 이 계약 위에 서 있다(D-G). 여기가 빨강이면 Task 3이 바뀐 것이고,
  // 그 경우 아래 원 픽스처 숫자를 고칠 게 아니라 Task 3의 변경을 되돌려야 한다.
  it("닫힘은 직선 현으로 마감하고 Catmull-Rom 이웃을 순환으로 감지 않는다", () => {
    const open = densify(CIRCLE, false);
    const closed = densify(CIRCLE, true);
    const chord = Math.hypot(CIRCLE[63].x - CIRCLE[0].x, CIRCLE[63].y - CIRCLE[0].y);
    expect(chord).toBeCloseTo(60 * Math.sin(Math.PI / 64), 9);   // 2r·sin(π/64) = 2.944060
    expect(closed.length - open.length).toBeCloseTo(chord, 9);
    expect(open.length).toBeCloseTo(185.5481, 3);
    expect(closed.length).toBeCloseTo(188.4922, 3);
    expect(sampleCount(closed.length)).toBe(378);

    // 닫는 세그먼트가 직선 현이므로 그 중점이 반지름 안쪽으로 30(1−cos(π/64)) = 0.036136 들어온다.
    // 순환으로 감았다면 이 dip 이 1e-3 이하로 떨어지고 원의 maxError 가 2e-4 로 내려간다.
    let dip = 0;
    for (const point of closed.poly) dip = Math.max(dip, 30 - Math.hypot(point.x - 50, point.y - 50));
    expect(dip).toBeCloseTo(30 * (1 - Math.cos(Math.PI / 64)), 9);
    expect(resampleUniform(closed.poly, closed.length, 378, true)).toHaveLength(378);
  });
});

describe("표본 수와 후보 대역", () => {
  it("P는 round(2L)을 128..512로 자르고 짝수로 올린다", () => {
    expect(sampleCount(10)).toBe(128);
    expect(sampleCount(64)).toBe(128);
    expect(sampleCount(100)).toBe(200);
    expect(sampleCount(94.3)).toBe(190);        // round(188.6)=189 → 짝수 보정
    expect(sampleCount(188.4922)).toBe(378);    // 반지름 30 원
    expect(sampleCount(255.7)).toBe(512);       // round(511.4)=511 → 512, 상한을 넘지 않는다
    expect(sampleCount(4000)).toBe(512);
  });

  it("K_max는 floor(P/4)와 64 중 작은 값이다", () => {
    expect(bandLimit(128)).toBe(32);
    expect(bandLimit(200)).toBe(50);
    expect(bandLimit(256)).toBe(64);
    expect(bandLimit(378)).toBe(64);
    expect(bandLimit(512)).toBe(64);
  });
});

describe("정확도 분모 normOf", () => {
  it("중심 대비 RMS 거리이고 평행이동에 불변이다", () => {
    expect(normOf([])).toBe(0);
    expect(normOf([{ re: 7, im: -3 }])).toBe(0);
    const ring: Complex[] = [{ re: 5, im: 0 }, { re: 0, im: 5 }, { re: -5, im: 0 }, { re: 0, im: -5 }];
    expect(normOf(ring)).toBeCloseTo(5, 12);
    expect(normOf(ring.map((z) => ({ re: z.re + 123, im: z.im - 77 })))).toBeCloseTo(5, 12);
  });

  it("닫힘에서는 c₀ 기준 분산과 같은 값이다", () => {
    const { P, samples } = closedSamples(CIRCLE);
    const { c0 } = dftClosed(samples, 1);
    let energy = 0;
    for (const z of samples) energy += z.re * z.re + z.im * z.im;
    expect(normOf(samples)).toBeCloseTo(Math.sqrt(energy / P - (c0.re * c0.re + c0.im * c0.im)), 12);
    expect(normOf(samples)).toBeCloseTo(29.9991, 4);   // 실측 29.999100446
  });
});

describe("테이블 DFT", () => {
  const P = 128;
  // z_k = (4 − 6i) + (5 + i)e^(2πi·3k/P) + (2 + 3i)e^(−2πi·7k/P)
  const synthetic: Complex[] = Array.from({ length: P }, (_, k) => {
    const t = (Math.PI * 2 * k) / P;
    const a = { re: 5, im: 1 };
    const b = { re: 2, im: 3 };
    return {
      re: 4 + a.re * Math.cos(3 * t) - a.im * Math.sin(3 * t) + b.re * Math.cos(-7 * t) - b.im * Math.sin(-7 * t),
      im: -6 + a.re * Math.sin(3 * t) + a.im * Math.cos(3 * t) + b.re * Math.sin(-7 * t) + b.im * Math.cos(-7 * t)
    };
  });

  it("대역 제한 신호의 계수를 그대로 되돌린다", () => {
    const { c0, terms, cosTable, sinTable } = dftClosed(synthetic, 12);
    expect(terms).toHaveLength(24);              // n = −12..12, 0 제외
    expect(cosTable).toHaveLength(P);            // Task 5의 fitOpen 이 이 두 표를 재사용한다(D-D)
    expect(sinTable).toHaveLength(P);
    expect(c0.re).toBeCloseTo(4, 12);
    expect(c0.im).toBeCloseTo(-6, 12);
    const at = (n: number) => terms.find((term) => term.n === n)!;
    expect(at(3).re).toBeCloseTo(5, 12);
    expect(at(3).im).toBeCloseTo(1, 12);
    expect(at(-7).re).toBeCloseTo(2, 12);
    expect(at(-7).im).toBeCloseTo(3, 12);
    for (const term of terms) {
      if (term.n !== 3 && term.n !== -7) expect(amplitude(term)).toBeLessThan(1e-12);
    }
  });

  it("파스발: 전 대역 Σ|c_n|² = mean|z − c₀|²", () => {
    const { c0, terms } = dftClosed(synthetic, P / 2);
    // n = ±P/2는 같은 빈의 별칭이므로 한쪽만 센다(스펙 E10).
    const sum = terms.filter((term) => term.n > -P / 2).reduce((total, term) => total + term.re ** 2 + term.im ** 2, 0);
    const mean = synthetic.reduce((total, z) => total + (z.re - c0.re) ** 2 + (z.im - c0.im) ** 2, 0) / P;
    expect(sum).toBeCloseTo(39, 9);              // |5+i|² + |2+3i|² = 26 + 13
    expect(Math.abs(sum - mean)).toBeLessThan(1e-9);   // 실측 2.13e-14
  });

  it("재샘플한 원에서도 파스발이 성립하고 ±P/2는 같은 값이다", () => {
    const { P: count, samples } = closedSamples(CIRCLE);
    expect(count).toBe(378);
    const { c0, terms } = dftClosed(samples, count / 2);
    const sum = terms.filter((term) => term.n > -count / 2).reduce((total, term) => total + term.re ** 2 + term.im ** 2, 0);
    const mean = samples.reduce((total, z) => total + (z.re - c0.re) ** 2 + (z.im - c0.im) ** 2, 0) / count;
    expect(Math.abs(sum - mean)).toBeLessThan(1e-9);   // 실측 9.10e-13
    const low = terms.find((term) => term.n === -count / 2)!;
    const high = terms.find((term) => term.n === count / 2)!;
    expect(low.re).toBe(high.re);
    expect(low.im).toBe(high.im);
  });

  it("T6 — 호길이 항등식 Σ(2πn)²|c_n|² = L² (전 대역)", () => {
    // 스펙 §1.9-1: 재매개화 버그·좌표 부호 실수·정규화 상수 실수를 한 줄로 잡는 유일한 자체 검증이다.
    // 호길이 균등 매개화에서 |z'(t)| = L 이므로 ∫|z'|² dt = Σ(2πn)²|c_n|² = L².
    // 다각형은 코너 이산화 때문에 0.3% 이내로만 맞는다(스펙이 0.7% 이내라고 적은 그 오차).
    const table = [
      { name: "circle", points: CIRCLE, tolerance: 1e-4 },      // 실측 2.47e-6
      { name: "square", points: SQUARE, tolerance: 5e-3 },      // 실측 1.22e-3
      { name: "hexagon", points: HEXAGON, tolerance: 5e-3 },    // 실측 8.01e-4
      { name: "pentagram", points: PENTAGRAM, tolerance: 5e-3 } // 실측 2.26e-3
    ];
    for (const row of table) {
      const { P: count, length, samples } = closedSamples(row.points);
      const { terms } = dftClosed(samples, count / 2);
      let total = 0;
      for (const term of terms) {
        if (term.n <= -count / 2) continue;   // ±P/2 별칭은 한쪽만
        total += (2 * Math.PI * term.n) ** 2 * (term.re ** 2 + term.im ** 2);
      }
      expect(Math.abs(total - length ** 2) / length ** 2, row.name).toBeLessThan(row.tolerance);
    }
  });
});
```

- [ ] **Step 2: 빨강 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.test.ts
```

예상 출력:
```
 FAIL  lib/fourier.test.ts [ lib/fourier.test.ts ]
Error: Failed to resolve import "@/lib/fourier" from "lib/fourier.test.ts". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```
같은 메시지가 `@/lib/resample`을 가리키면 Task 3이 아직 안 들어온 것이고, `@/lib/geometry`를 가리키는데 파일은 존재한다면 러너가 `@/*` 별칭을 못 푸는 것이다(= Task 1의 `vitest.config.ts` 문제, D-H). 이 파일을 상대 경로로 바꿔 우회하지 말고 Task 1에서 고친다.

- [ ] **Step 3: lib/fourier.ts 생성 — 타입·상수·표본 수·normOf·테이블 DFT**

`/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.ts` 신규 생성:

```ts
// 획 하나를 복소 푸리에 계수로 옮긴다. 수치만 만들고 표시 문자열은 만들지 않는다 — 표기는 lib/formatting.ts 몫이다.
// 좌표는 이미 z = conj(p − 중심)으로 옮겨진 수학 좌표(lib/resample의 toComplex)만 쓴다.
// 닫힌 획은 지수급수, 열린 획은 현 분리 + 사인급수(DST-I, Task 5).
// FFT를 쓰지 않는다 — DST-I는 라딕스-2 복소 FFT와 호환되지 않고, 항이 한 자릿수 규모라 이득도 없다.

import type { Complex } from "@/lib/resample";

export type { Complex } from "@/lib/resample";

export type Term = { n: number; re: number; im: number };

// 항 선택 전의 후보. energy 는 이미 "표본 평균제곱오차" 단위로 환산된 값이다:
// 닫힘은 |c_n|², 열림은 (P/(2(P+1)))|b_n|² (Task 5가 같은 단위로 채운다).
export type Candidate = Term & { energy: number };

export type FitStats = {
  P: number;           // 표본 수
  arcLength: number;
  normS: number;       // 정확도 분모 = 중심 대비 RMS 거리
  rmsError: number;
  maxError: number;
  accuracy: number;    // 0~1 숫자. 문자열은 lib/formatting.ts의 formatAccuracy 하나만 만든다.
  capped: boolean;     // T_max 도달로 종료
};

export type Spectrum =
  | { kind: "point"; length: number }   // length 는 호길이다 — 0으로 고정된 값이 아니다.
  | { kind: "closed"; c0: Complex; terms: Term[]; stats: FitStats }
  | { kind: "open"; z0: Complex; delta: Complex; terms: Term[]; stats: FitStats };

export type ClosedSpectrum = Extract<Spectrum, { kind: "closed" }>;

export type FitOptions = { target?: number; maxTerms?: number; absFloor?: number };

export const T_MAX = 24;
export const TARGET_ACCURACY = 0.99;
export const ABS_FLOOR = 0.15;
export const MIN_ARC_LENGTH = 1e-6;

export const amplitude = (term: { re: number; im: number }) => Math.hypot(term.re, term.im);

// P = clamp(round(2L), 128, 512), 짝수. 표본 간격을 0.5단위 이하로 묶는다.
// 511 → 512로 올라가므로 짝수 보정이 상한을 넘기지 않는다.
export const sampleCount = (arcLength: number) => {
  const clamped = Math.max(128, Math.min(512, Math.round(2 * arcLength)));
  return clamped % 2 === 0 ? clamped : clamped + 1;
};

// K_max ≤ P/4. 나이퀴스트가 아니라 2배 오버샘플 여유를 강제하는 값이다.
// P/2까지 쓰면 DFT가 표본을 정확히 보간해 오차가 0이 되고 정확도가 자기충족적이 된다.
export const bandLimit = (P: number) => Math.min(Math.floor(P / 4), 64);

// 정확도 분모 S = 표본의 중심 대비 RMS 거리. 스펙 §1.6이 "앱 전체에 하나만"이라고 못 박은 값이다.
// 닫힘(P개)·열림(P+1개)이 이 함수 하나를 부른다 — Task 5의 fitOpen 도 여기를 호출한다(D-D).
// 닫힘에서는 표본 평균이 곧 c₀이므로 sqrt((1/P)Σ|z_k|² − |c₀|²)와 비트 단위로 같은 값이 나온다.
export function normOf(samples: Complex[]): number {
  const count = samples.length;
  if (!count) return 0;
  let sumRe = 0;
  let sumIm = 0;
  let energy = 0;
  for (const z of samples) {
    sumRe += z.re;
    sumIm += z.im;
    energy += z.re * z.re + z.im * z.im;
  }
  const meanRe = sumRe / count;
  const meanIm = sumIm / count;
  return Math.sqrt(Math.max(0, energy / count - (meanRe * meanRe + meanIm * meanIm)));
}

// 테이블 DFT. cos/sin 표를 획마다 한 번 만들고 (n·k) mod P 인덱스로 조회해 루프 안 삼각함수 호출을 0으로 만든다.
// 표를 반환하는 이유는 호출자가 진단 재구성(rebuild)에서 같은 표를 다시 써야 하기 때문이다 — 두 번 만들지 않는다.
// n = ±P/2는 같은 빈의 별칭이라 band = P/2로 부르면 양쪽 모두 돌려준다. 전 대역 합에서는 한쪽만 세라.
export function dftClosed(
  samples: Complex[],
  band: number
): { c0: Complex; terms: Term[]; cosTable: Float64Array; sinTable: Float64Array } {
  const P = samples.length;
  const cosTable = new Float64Array(P);
  const sinTable = new Float64Array(P);
  for (let j = 0; j < P; j += 1) {
    const angle = (Math.PI * 2 * j) / P;
    cosTable[j] = Math.cos(angle);
    sinTable[j] = Math.sin(angle);
  }
  const coefficient = (n: number): Complex => {
    const step = ((n % P) + P) % P;
    let re = 0;
    let im = 0;
    let index = 0;
    for (let k = 0; k < P; k += 1) {
      const cos = cosTable[index];
      const sin = sinTable[index];
      re += samples[k].re * cos + samples[k].im * sin;
      im += samples[k].im * cos - samples[k].re * sin;
      index += step;
      if (index >= P) index -= P;
    }
    return { re: re / P, im: im / P };
  };
  const top = Math.max(0, Math.min(Math.floor(band), P / 2));
  const terms: Term[] = [];
  for (let n = -top; n <= top; n += 1) {
    if (n === 0) continue;
    const { re, im } = coefficient(n);
    terms.push({ n, re, im });
  }
  return { c0: coefficient(0), terms, cosTable, sinTable };
}
```

- [ ] **Step 4: 초록 확인 + 타입 확인 + 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.test.ts && npx tsc --noEmit
```
예상 출력: `Test Files  1 passed (1)` / `Tests  8 passed (8)`, `tsc`는 무출력. (`npm run build`는 dev 서버의 `.next`를 건드리므로 돌리지 않는다.)

```
git add lib/fourier.ts lib/fourier.test.ts && git commit -m "closed stroke dft kernel"
```

- [ ] **Step 5: 적합 테스트 작성 — 원 1항·최소 항 수·대칭 구조·퇴화·open**

`lib/fourier.test.ts` 상단 import를 교체:
```ts
import { amplitude, bandLimit, dftClosed, fitStroke, normOf, sampleCount, type FitOptions } from "@/lib/fourier";
```
`const PENTAGRAM = …` 아래에 헬퍼 한 개를 추가:
```ts
const closedFit = (points: Point[], options?: FitOptions) => {
  const spectrum = fitStroke(points, "closed", options);
  if (spectrum.kind !== "closed") throw new Error("닫힌 스펙트럼이 아니다");
  return spectrum;
};
```
파일 끝에 describe 블록 추가:
```ts
describe("닫힌 획 적합", () => {
  it("반지름 30 완전한 원은 정확히 1항이다", () => {
    const fit = closedFit(CIRCLE);
    expect(fit.terms).toHaveLength(1);
    expect(fit.terms[0].n).toBe(1);
    expect(amplitude(fit.terms[0])).toBeCloseTo(30, 2);   // 실측 29.999100
    // |c₀| 이 1e-9 이 아닌 이유: 닫는 직선 현(2.944)이 중심을 아주 조금 끌어당긴다.
    expect(amplitude(fit.c0)).toBeLessThan(2e-3);         // 실측 1.111e-3
    expect(fit.stats.P).toBe(378);
    expect(fit.stats.arcLength).toBeCloseTo(188.4922, 3);
    expect(fit.stats.normS).toBeCloseTo(30, 2);           // 실측 29.999100
    expect(fit.stats.rmsError).toBeLessThan(5e-3);        // 실측 3.778e-3
    expect(fit.stats.maxError).toBeLessThan(5e-2);        // 실측 3.412e-2 (seam 하나가 지배한다)
    expect(fit.stats.accuracy).toBeGreaterThan(0.9998);   // 실측 0.9998741
    expect(fit.stats.capped).toBe(false);
  });

  it("정사각형 6항 · 정육각형 4항 · 오각별 8항에서 99%에 닿는다", () => {
    const table = [
      { name: "square", points: SQUARE, terms: 6, reached: 0.9902253, short: 0.9872027 },
      { name: "hexagon", points: HEXAGON, terms: 4, reached: 0.9916976, short: 0.9882091 },
      { name: "pentagram", points: PENTAGRAM, terms: 8, reached: 0.9903255, short: 0.9879917 }
    ];
    for (const row of table) {
      const enough = closedFit(row.points, { maxTerms: row.terms });
      const lacking = closedFit(row.points, { maxTerms: row.terms - 1 });
      expect(enough.terms, row.name).toHaveLength(row.terms);
      expect(enough.stats.accuracy, row.name).toBeGreaterThanOrEqual(0.99);
      expect(enough.stats.accuracy, row.name).toBeCloseTo(row.reached, 5);
      expect(lacking.stats.accuracy, row.name).toBeLessThan(0.99);
      expect(lacking.stats.accuracy, row.name).toBeCloseTo(row.short, 5);
      expect(enough.stats.capped, row.name).toBe(true);
    }
  });

  it("terms는 진폭 내림차순으로 저장된다", () => {
    // D-C: truncate(k) = "진폭 상위 k개" 계약의 근거다. n 오름차순으로 정렬하지 않는다.
    for (const [points, name] of [[CIRCLE, "circle"], [SQUARE, "square"], [PENTAGRAM, "pentagram"]] as const) {
      const fit = closedFit(points);
      for (let i = 1; i < fit.terms.length; i += 1) {
        expect(amplitude(fit.terms[i - 1]), `${name} #${i}`).toBeGreaterThanOrEqual(amplitude(fit.terms[i]));
      }
    }
    expect(closedFit(SQUARE).terms.map((term) => term.n)).toEqual([-1, 3, -5, 7, -9, 11, -13, 15, -17]);
  });

  it("m겹 대칭 도형은 n ≡ n₁ (mod m) 인 항만 고른다", () => {
    for (const [points, m, name] of [[SQUARE, 4, "square"], [HEXAGON, 6, "hexagon"], [PENTAGRAM, 5, "pentagram"]] as const) {
      const fit = closedFit(points);
      const first = fit.terms[0].n;
      for (const term of fit.terms) expect(((term.n - first) % m + m) % m, `${name} n=${term.n}`).toBe(0);
    }
  });

  it("퇴화 획은 NaN 없이 point로 떨어지고 length는 호길이를 담는다", () => {
    // D-E: point 의 length 는 "항상 0"이 아니라 호길이다. toEqual 로 통째 비교하지 않는다.
    const sameSpot = Array.from({ length: 12 }, () => ({ x: 50, y: 50 }));
    for (const [points, closure] of [[sameSpot, "closed"], [[], "closed"], [[{ x: 10, y: 10 }], "closed"]] as const) {
      const spectrum = fitStroke(points, closure);
      expect(spectrum.kind).toBe("point");
      if (spectrum.kind !== "point") throw new Error("point가 아니다");
      expect(spectrum.length).toBe(0);
    }
    const asPoint = fitStroke(CIRCLE, "point");
    expect(asPoint.kind).toBe("point");
    if (asPoint.kind !== "point") throw new Error("point가 아니다");
    expect(asPoint.length).toBeCloseTo(185.5481, 3);   // closure="point"는 열린 폴리라인 길이다
  });

  it("열린 획은 아직 이 모듈이 처리하지 않는다", () => {
    expect(() => fitStroke([{ x: 20, y: 50 }, { x: 80, y: 50 }], "open")).toThrow(/open/);
  });
});
```

- [ ] **Step 6: 빨강 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.test.ts
```
예상 출력: 앞의 8개는 통과하고 새 6개가 전부 실패한다. 실패 메시지는 `TypeError: __vite_ssr_import_1__.fitStroke is not a function`(러너 버전에 따라 `does not provide an export named 'fitStroke'`). 요약은 `Test Files  1 failed (1)` / `Tests  6 failed | 8 passed (14)`.

- [ ] **Step 7: 공유 코어 + fitClosed + fitStroke 구현 (성장 규칙 없음)**

`lib/fourier.ts`의 import 두 줄을 교체:
```ts
import type { Closure, Point } from "@/lib/geometry";
import { densify, resampleUniform, toComplex, type Complex } from "@/lib/resample";
```
파일 끝에 추가:
```ts
// 에너지는 항상 이 식으로 센다. hypot(re,im)²와 re²+im²는 부동소수에서 같은 값이 아니라서
// 그리디 누적과 truncate가 서로 다른 식을 쓰면 두 경로의 rmsError가 미세하게 갈린다.
const energyOf = (term: { re: number; im: number }) => term.re * term.re + term.im * term.im;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// 진폭 그리디 · 파스발 꼬리 · 정지조건 · 국소 꺾임 보정. 닫힘과 열림이 이 함수 하나만 쓴다(D-D).
// Task 5의 fitOpen 은 candidates/tailEnergy/rebuild 만 자기 기저로 만들어 여기로 넘긴다 —
// 정확도·정지조건·maxError 보정이 두 벌 존재하면 열림이 닫힘과 다른 규칙으로 끝나고,
// 그 차이는 화면에 "정확도 99%"로 똑같이 표시되어 절대 발견되지 않는다.
export function selectAndFinalize(
  samples: Complex[],
  candidates: Candidate[],
  tailEnergy: number,
  normS: number,
  arcLength: number,
  P: number,
  rebuild: (terms: Term[]) => Complex[],
  options: FitOptions = {}
): { terms: Term[]; stats: FitStats } {
  const target = options.target ?? TARGET_ACCURACY;
  const maxTerms = options.maxTerms ?? T_MAX;
  const absFloor = options.absFloor ?? ABS_FLOOR;

  // 직교 기저에서 최적 T항 근사는 진폭 상위 T개다(스펙 §1.6). 재적합 루프는 없다.
  // 이 순서가 곧 저장 순서다 — n 오름차순으로 되돌리지 않는다(D-C).
  const sorted = [...candidates].sort((a, b) => b.energy - a.energy || Math.abs(a.n) - Math.abs(b.n) || a.n - b.n);
  const limit = Math.max(0, (1 - target) * normS);
  const ceiling = Math.min(maxTerms, sorted.length);

  const residualAt = (count: number) => {
    let rest = tailEnergy;
    for (let index = 0; index < count; index += 1) rest -= sorted[index].energy;
    return Math.sqrt(Math.max(0, rest));
  };
  // 진단용 최대 오차. 항 집합이 확정된 뒤에만 부른다(획당 1~2회).
  const measure = (count: number) => {
    const terms = sorted.slice(0, count).map(({ n, re, im }) => ({ n, re, im }));
    const hat = rebuild(terms);
    let worst = 0;
    for (let k = 0; k < samples.length; k += 1) {
      worst = Math.max(worst, Math.hypot(samples[k].re - hat[k].re, samples[k].im - hat[k].im));
    }
    return { terms, maxError: worst };
  };

  let count = 0;
  while (count < ceiling) {
    const error = residualAt(count);
    if (error <= limit || error <= absFloor) break;   // 정지조건 (1) 과 (2)
    count += 1;
  }
  const rmsError = residualAt(count);
  const measured = measure(count);

  return {
    terms: measured.terms,
    stats: {
      P,
      arcLength,
      normS,
      rmsError,
      maxError: measured.maxError,
      accuracy: normS > 0 ? clamp01(1 - rmsError / normS) : 1,
      capped: measured.terms.length >= maxTerms
    }
  };
}

export function fitClosed(samples: Complex[], arcLength: number, options?: FitOptions): ClosedSpectrum {
  const P = samples.length;
  const { c0, terms, cosTable, sinTable } = dftClosed(samples, bandLimit(P));
  // S² = (1/P)Σ|z_k|² − |c₀|². 앱 전체에서 정확도 분모는 이 S 하나뿐이다.
  const normS = normOf(samples);
  const candidates: Candidate[] = terms.map((term) => ({ ...term, energy: energyOf(term) }));

  // 표본 격자 위의 재구성이라 dftClosed 가 만든 표를 그대로 조회한다(삼각함수 호출 0회).
  const rebuild = (chosen: Term[]): Complex[] => {
    const out: Complex[] = [];
    for (let k = 0; k < P; k += 1) {
      let re = c0.re;
      let im = c0.im;
      for (const term of chosen) {
        const index = (((term.n * k) % P) + P) % P;
        re += term.re * cosTable[index] - term.im * sinTable[index];
        im += term.re * sinTable[index] + term.im * cosTable[index];
      }
      out.push({ re, im });
    }
    return out;
  };

  const { terms: chosen, stats } = selectAndFinalize(samples, candidates, normS * normS, normS, arcLength, P, rebuild, options);
  return { kind: "closed", c0, terms: chosen, stats };
}

export function fitStroke(points: Point[], closure: Closure, options?: FitOptions): Spectrum {
  if (points.length < 2) return { kind: "point", length: 0 };
  const closed = closure === "closed";
  const { poly, length } = densify(points, closed);
  // !(length > …) 는 부정형이 아니라 NaN 처리다. length > … 로 쓰면 NaN 이 아래로 새어 나간다.
  if (closure === "point" || !(length > MIN_ARC_LENGTH)) return { kind: "point", length };
  const P = sampleCount(length);
  const samples = resampleUniform(poly, length, P, closed).map(toComplex);
  // Task 5가 이 한 줄을 `return closed ? fitClosed(...) : fitOpen(samples, length, options);` 로 바꾼다.
  if (!closed) throw new Error("fitStroke: open stroke fitting lands in Task 5");
  return fitClosed(samples, length, options);
}
```

- [ ] **Step 8: 초록 확인 + 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.test.ts && npx tsc --noEmit
```
예상 출력: `Tests  14 passed (14)`, `tsc` 무출력.

```
git add lib/fourier.ts lib/fourier.test.ts && git commit -m "fit closed strokes with parseval greedy"
```

- [ ] **Step 9: 국소 꺾임 보호 테스트 작성**

import에 `ABS_FLOOR`와 `T_MAX`를 추가:
```ts
import { ABS_FLOOR, T_MAX, amplitude, bandLimit, dftClosed, fitStroke, normOf, sampleCount, type FitOptions } from "@/lib/fourier";
```
파일 끝에 추가:
```ts
describe("국소 꺾임 보호", () => {
  it("최대 오차가 RMS의 3배를 넘는 모서리 도형은 항을 1.5배로 한 번 늘린다", () => {
    const table = [
      { name: "square", points: SQUARE, terms: 9, accuracy: 0.9945916, maxError: 0.9442, normS: 34.6458 },
      { name: "hexagon", points: HEXAGON, terms: 6, accuracy: 0.9954116, maxError: 0.4967, normS: 27.3899 },
      { name: "pentagram", points: PENTAGRAM, terms: 12, accuracy: 0.9949019, maxError: 0.6147, normS: 20.8901 }
    ];
    for (const row of table) {
      const fit = closedFit(row.points);
      expect(fit.terms, row.name).toHaveLength(row.terms);
      expect(fit.stats.accuracy, row.name).toBeCloseTo(row.accuracy, 5);
      expect(fit.stats.maxError, row.name).toBeCloseTo(row.maxError, 3);
      expect(fit.stats.normS, row.name).toBeCloseTo(row.normS, 3);
      expect(fit.stats.capped, row.name).toBe(false);
    }
  });

  it("발동 조건과 비발동 조건을 둘 다 고정한다", () => {
    // 그리디 정지 시점(6항)의 진단값: 최대 오차 1.4216 > 3 × RMS 0.3387 (비율 4.198) → 9항으로 늘어난 이유.
    const stopped = closedFit(SQUARE, { maxTerms: 6 });
    expect(stopped.stats.rmsError).toBeCloseTo(0.33865, 4);
    expect(stopped.stats.maxError).toBeCloseTo(1.4216, 3);
    expect(stopped.stats.maxError / stopped.stats.rmsError).toBeCloseTo(4.198, 2);

    // 원은 seam(닫는 직선 현) 하나가 잔차를 지배해 비율이 9.03이다 — 3배 조건만으로는 발동을 못 막는다.
    // 절대 하한 0.15가 유일한 방어선이고, 그래서 D-F 조건에 maxError > absFloor 가 들어간다.
    const circle = closedFit(CIRCLE);
    expect(circle.terms).toHaveLength(1);
    expect(circle.stats.maxError).toBeCloseTo(0.0341, 4);
    expect(circle.stats.maxError / circle.stats.rmsError).toBeGreaterThan(3);
    expect(circle.stats.maxError).toBeLessThan(ABS_FLOOR);

    // absFloor 를 0으로 낮추면 그 방어선이 사라져 원이 2항이 된다. 이 단언이 조건의 존재 이유다.
    const unguarded = closedFit(CIRCLE, { absFloor: 0 });
    expect(unguarded.terms).toHaveLength(2);
    expect(unguarded.terms.map((term) => term.n)).toEqual([1, -1]);
  });

  it("성장은 T_max를 넘지 않고 상한에 닿으면 capped가 선다", () => {
    expect(T_MAX).toBe(24);
    const capped = closedFit(PENTAGRAM, { maxTerms: 5 });
    expect(capped.terms).toHaveLength(5);
    expect(capped.stats.capped).toBe(true);
    expect(capped.stats.accuracy).toBeCloseTo(0.9813628, 5);
  });
});
```

- [ ] **Step 10: 빨강 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.test.ts
```
예상 출력: 성장 규칙이 아직 없으므로 항 수가 6·4·8에 머물고, `absFloor: 0` 도 1항 그대로다.
```
 FAIL  lib/fourier.test.ts > 국소 꺾임 보호 > 최대 오차가 RMS의 3배를 넘는 모서리 도형은 항을 1.5배로 한 번 늘린다
AssertionError: square: expected [ { n: -1, … }, … ] to have a length of 9 but got 6

 FAIL  lib/fourier.test.ts > 국소 꺾임 보호 > 발동 조건과 비발동 조건을 둘 다 고정한다
AssertionError: expected [ { n: 1, … } ] to have a length of 2 but got 1

 Test Files  1 failed (1)
      Tests  2 failed | 15 passed (17)
```
(세 번째 테스트 — T_max·capped — 는 이미 통과한다.)

- [ ] **Step 11: 국소 꺾임 보호 구현**

`lib/fourier.ts`의 `selectAndFinalize` 안에서 `const rmsError = residualAt(count);`와 `const measured = measure(count);` 두 줄을 아래로 교체:
```ts
  let rmsError = residualAt(count);
  let measured = measure(count);
  // 최종 A를 정한 뒤 한 번만 재구성해 최대 오차를 잰다. RMS의 3배를 넘으면 항을 1.5배로 딱 한 번 늘린다.
  // 조건 넷은 각각 다른 실패를 막는다(D-F):
  //  · maxError > 3*rmsError — 잔차가 한 점에 몰린 모서리 도형만 고른다.
  //  · maxError > absFloor   — 잔차가 이미 눈에 안 보이는 획을 늘리지 않는다. 원의 seam 비율이 9.03이라
  //                            이 조건이 없으면 완전한 원이 2항이 되고 스펙 T3가 깨진다.
  //  · count > 0             — 직선(0항)에서 ceil(0 × 1.5) = 0 이라 무의미하게 도는 것을 막는다.
  //  · count < ceiling       — 이미 상한이면 늘릴 자리가 없다.
  if (measured.maxError > 3 * rmsError && measured.maxError > absFloor && count > 0 && count < ceiling) {
    count = Math.min(ceiling, Math.ceil(count * 1.5));
    rmsError = residualAt(count);
    measured = measure(count);
  }
```

- [ ] **Step 12: 초록 확인 + 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.test.ts && npx tsc --noEmit
```
예상 출력: `Tests  17 passed (17)`, `tsc` 무출력.

정지조건이 한 곳에만 있는지 확인한다(Task 5가 여기에 두 번째 사본을 만들지 않게 하는 기준선이다).
```
cd /Users/yoma/projects/jamcoding/jangyunu && grep -n "TARGET_ACCURACY\|T_MAX\|ABS_FLOOR" lib/fourier.ts
```
예상 출력: **정확히 6줄** — 상수 선언 3줄과 `selectAndFinalize` 안의 `options.target ?? TARGET_ACCURACY` / `options.maxTerms ?? T_MAX` / `options.absFloor ?? ABS_FLOOR` 3줄.

```
git add lib/fourier.ts lib/fourier.test.ts && git commit -m "grow terms when a corner outruns rms"
```

- [ ] **Step 13: truncate·reconstruct·오버레이 점 수 테스트 작성**

import에 세 함수를 추가:
```ts
import { ABS_FLOOR, T_MAX, amplitude, bandLimit, dftClosed, fitStroke, normOf, overlayPointCount, reconstruct, sampleCount, truncate, type FitOptions } from "@/lib/fourier";
```
파일 끝에 추가:
```ts
describe("항 수 슬라이더와 오버레이", () => {
  it("truncate는 재변환 없이 부분집합의 오차를 다시 센다", () => {
    const fit = closedFit(PENTAGRAM);
    let previous = Infinity;
    for (let count = 0; count <= fit.terms.length; count += 1) {
      const view = truncate(fit, count);
      if (view.kind !== "closed") throw new Error("닫힌 스펙트럼이 아니다");
      expect(view.terms).toHaveLength(count);
      expect(view.stats.rmsError).toBeLessThanOrEqual(previous + 1e-12);
      previous = view.stats.rmsError;
    }
    const empty = truncate(fit, 0);
    if (empty.kind !== "closed") throw new Error("닫힌 스펙트럼이 아니다");
    expect(empty.stats.rmsError).toBeCloseTo(fit.stats.normS, 10);
    expect(empty.stats.accuracy).toBe(0);
    expect(truncate(fit, fit.terms.length)).toBe(fit);      // 전량이면 같은 객체
  });

  it("truncate는 범위를 벗어난 값을 자르고 point는 그대로 돌려준다", () => {
    const fit = closedFit(PENTAGRAM);
    expect(truncate(fit, 999)).toBe(fit);
    const none = truncate(fit, -3);
    if (none.kind !== "closed") throw new Error("닫힌 스펙트럼이 아니다");
    expect(none.terms).toHaveLength(0);
    const degenerate = fitStroke([{ x: 50, y: 50 }, { x: 50, y: 50 }], "point");
    expect(truncate(degenerate, 3)).toBe(degenerate);
  });

  it("truncate(k)와 maxTerms:k 적합은 같은 항 집합·같은 오차를 낸다", () => {
    // 이 등식이 성립하는 이유는 terms 가 진폭 내림차순이기 때문이다(D-C).
    // n 오름차순으로 재정렬하면 여기가 즉시 빨강이 된다.
    const fit = closedFit(SQUARE);
    const view = truncate(fit, 6);
    if (view.kind !== "closed") throw new Error("닫힌 스펙트럼이 아니다");
    const refit = closedFit(SQUARE, { maxTerms: 6 });
    expect(view.terms.map((term) => term.n)).toEqual([-1, 3, -5, 7, -9, 11]);
    expect(view.terms.map((term) => term.n)).toEqual(refit.terms.map((term) => term.n));
    expect(view.stats.rmsError).toBeCloseTo(refit.stats.rmsError, 9);
    expect(view.stats.accuracy).toBeCloseTo(refit.stats.accuracy, 9);
  });

  it("reconstruct는 q개 점을 캔버스 좌표로 돌려준다", () => {
    const fit = closedFit(CIRCLE);
    const drawn = reconstruct(fit, 512);
    expect(drawn).toHaveLength(512);
    expect(drawn[0].x).toBeCloseTo(80, 2);        // 실측 79.997991
    expect(drawn[0].y).toBeCloseTo(50, 2);        // 실측 50.000510
    for (const point of drawn) expect(Math.hypot(point.x - 50, point.y - 50)).toBeCloseTo(30, 2);
    expect(reconstruct(fit, 0)).toEqual([]);
    expect(reconstruct(fitStroke([], "closed"), 64)).toEqual([]);
  });

  it("오버레이 점 수는 clamp(8·max|n|, 64, 512)", () => {
    expect(overlayPointCount(closedFit(CIRCLE))).toBe(64);        // max|n| = 1
    expect(overlayPointCount(closedFit(SQUARE))).toBe(136);       // max|n| = 17
    expect(overlayPointCount(closedFit(HEXAGON))).toBe(136);      // max|n| = 17
    expect(overlayPointCount(closedFit(PENTAGRAM))).toBe(288);    // max|n| = 36
    expect(overlayPointCount(fitStroke([], "closed"))).toBe(0);   // 퇴화 획은 오버레이에서 걸러진다
  });
});
```

- [ ] **Step 14: 빨강 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.test.ts
```
예상 출력: 새 5개가 `TypeError: __vite_ssr_import_1__.truncate is not a function` 계열로 실패. 요약 `Tests  5 failed | 17 passed (22)`.

- [ ] **Step 15: truncate·reconstruct·overlayPointCount 구현**

`lib/fourier.ts`의 resample import에 `fromComplex`를 추가:
```ts
import { densify, fromComplex, resampleUniform, toComplex, type Complex } from "@/lib/resample";
```
파일 끝에 추가:
```ts
// 임의 t 에서의 z(t) = c₀ + Σ c_n e^(2πint). 표본 격자를 벗어나므로 표 조회가 아니라 직접 계산한다.
const evaluateClosed = (c0: Complex, terms: Term[], t: number): Complex => {
  let re = c0.re;
  let im = c0.im;
  for (const term of terms) {
    const angle = Math.PI * 2 * term.n * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    re += term.re * cos - term.im * sin;
    im += term.re * sin + term.im * cos;
  }
  return { re, im };
};

// 항 수 슬라이더용. 계수는 항 개수와 무관하게 정해지므로 변환을 다시 돌리지 않는다.
// terms 가 진폭 내림차순이므로 slice(0, k) 가 곧 "진폭 상위 k개"다(D-C).
// maxError는 표본이 있어야 다시 잴 수 있는데 Spectrum은 표본을 들고 다니지 않는다 —
// 잘라낸 스펙트럼의 maxError는 적합 시점 값을 물려받으며, 화면에 표시하지 않는다.
export function truncate(spectrum: Spectrum, termCount: number): Spectrum {
  // Task 5(D-K)가 여기에 "open" 분기를 넣는다: 같은 슬라이스 + (P/(2(P+1)))|b_n|² 단위의 파스발 재계산.
  if (spectrum.kind !== "closed") return spectrum;
  const count = Math.max(0, Math.min(spectrum.terms.length, Math.floor(termCount)));
  if (count === spectrum.terms.length) return spectrum;
  const terms = spectrum.terms.slice(0, count);
  let tail = spectrum.stats.normS * spectrum.stats.normS;
  for (const term of terms) tail -= energyOf(term);
  const rmsError = Math.sqrt(Math.max(0, tail));
  const accuracy = spectrum.stats.normS > 0 ? clamp01(1 - rmsError / spectrum.stats.normS) : 1;
  return { ...spectrum, terms, stats: { ...spectrum.stats, rmsError, accuracy, capped: false } };
}

// 오버레이용 곡선. 닫힌 획이므로 t = 0..(q−1)/q, 끝점을 중복하지 않는다(렌더가 Z로 닫는다).
export function reconstruct(spectrum: Spectrum, q: number): Point[] {
  // Task 5(D-K)가 여기에 "open" 분기를 넣는다: t = j/(q−1), j = 0..q−1 로 같은 q개를 돌려준다.
  // 그게 빠지면 모달의 재구성 오버레이가 모든 열린 획에서 빈 화면이 된다.
  if (spectrum.kind !== "closed") return [];
  const count = Math.floor(q);
  if (count < 1) return [];
  const out: Point[] = [];
  for (let j = 0; j < count; j += 1) out.push(fromComplex(evaluateClosed(spectrum.c0, spectrum.terms, j / count)));
  return out;
}

// Q = clamp(8·max|n|, 64, 512). 최고 조화를 주기당 8점으로 해상한다.
// 오버레이 점 수의 유일한 구현이다 — Task 10은 overlayQ 를 따로 만들지 않고 이것을 import한다(4-B).
export function overlayPointCount(spectrum: Spectrum): number {
  if (spectrum.kind === "point") return 0;
  let top = 1;
  for (const term of spectrum.terms) top = Math.max(top, Math.abs(term.n));
  return Math.max(64, Math.min(512, 8 * top));
}
```

- [ ] **Step 16: 초록 확인 + 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.test.ts && npx tsc --noEmit
```
예상 출력: `Tests  22 passed (22)`, `tsc` 무출력.

```
git add lib/fourier.ts lib/fourier.test.ts && git commit -m "truncate and reconstruct spectra"
```

- [ ] **Step 17: T7 — 정확도가 거짓말하지 않는지 독립 표본으로 검사**

파일 끝에 추가. 이 세 테스트는 새 동작을 요구하지 않는다. **통과가 기대값이고, 실패하면 앞 단계 구현이 거짓말을 하고 있다는 뜻이다**(스펙 §7-T7: 이게 거짓이면 기능 전체가 무의미).
```ts
describe("보고된 정확도의 진위", () => {
  it("스펙트럼과 무관한 조밀 표본에서 잰 오차가 보고값과 맞는다", () => {
    for (const [name, points] of [["circle", CIRCLE], ["square", SQUARE], ["hexagon", HEXAGON], ["pentagram", PENTAGRAM]] as const) {
      const fit = closedFit(points);
      const { poly, length } = densify(points, true);
      const M = 4 * fit.stats.P + 2;   // P의 배수가 아니라 적합 표본과 사실상 겹치지 않는다
      const truth = resampleUniform(poly, length, M, true).map(toComplex);
      const drawn = reconstruct(fit, M).map(toComplex);
      expect(drawn, name).toHaveLength(M);
      let total = 0;
      let worst = 0;
      for (let i = 0; i < M; i += 1) {
        const gap = Math.hypot(truth[i].re - drawn[i].re, truth[i].im - drawn[i].im);
        total += gap * gap;
        worst = Math.max(worst, gap);
      }
      const rms = Math.sqrt(total / M);
      const probed = 1 - rms / fit.stats.normS;
      expect(rms / fit.stats.rmsError, name).toBeGreaterThan(0.95);   // 실측 0.9917 ~ 0.9990
      expect(rms / fit.stats.rmsError, name).toBeLessThan(1.05);
      expect(fit.stats.accuracy, name).toBeLessThanOrEqual(probed + 1e-4);  // 보고값이 실제보다 후하면 안 된다
      expect(worst, name).toBeLessThanOrEqual(fit.stats.maxError * 1.05);
    }
  });

  it("같은 입력은 같은 계수를 낸다", () => {
    expect(JSON.stringify(closedFit(PENTAGRAM))).toBe(JSON.stringify(closedFit(PENTAGRAM)));
  });

  it("닫힌 획 20개 적합이 50ms를 넘지 않는다", () => {
    const set = [CIRCLE, SQUARE, HEXAGON, PENTAGRAM];
    const started = performance.now();
    for (let i = 0; i < 20; i += 1) closedFit(set[i % set.length]);
    expect(performance.now() - started).toBeLessThan(50);   // 실측 4.0ms (M시리즈), Worker 도입 기준선이 50ms
  });
});
```

- [ ] **Step 18: 전체 확인 + 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/ && npx tsc --noEmit
```
예상 출력: `lib/fourier.test.ts`가 `Tests  25 passed (25)`, Task 1~3이 만든 `lib/geometry.test.ts`·`lib/storage.test.ts`·`lib/resample.test.ts`·`lib/share.test.ts`까지 **전부 통과**. `tsc`는 무출력.

```
git add lib/fourier.test.ts && git commit -m "check accuracy against independent samples"
```

---

**이 태스크가 남기는 미완 자리 (전부 담당 태스크가 지정되어 있다)**

| 자리 | 담당 | 계약 |
|---|---|---|
| `fitStroke`의 `throw new Error("… lands in Task 5")` | Task 5 (D-D) | `fitOpen(samples, length, options)` 호출로 교체. `selectAndFinalize`·`normOf`·`dftClosed`는 **호출만** 한다 — 재작성하지 않는다 |
| `truncate`의 `kind !== "closed"` 통과 | Task 5 (D-K) | 진폭 상위 k항 슬라이스 + `(P/(2(P+1)))|b_n|²` 단위 파스발 재계산 |
| `reconstruct`의 `kind !== "closed"` → `[]` | Task 5 (D-K) | `z₀ + Δ·t + Σ b_n sin(πnt)`를 `t = j/(q−1)`, j = 0..q−1로 평가해 q개 반환 |
| `applyOperator` | Task 6 | 이 파일에 추가된다. 앵커는 Task 4 Step 15가 만든 `reconstruct` 정의 다음 줄이다 |

---

### Task 5: lib/fourier.ts — 열린 획 현(chord) 분리와 DST-I

**Files:**
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.ts` — Task 4가 만드는 파일이라 줄 번호 대신 앵커로 지정한다. 수정 지점 4곳:
  - ① `fitStroke` 본문 — Task 4가 남긴 `if (closure === "open") throw …` 한 줄 삭제, `resampleUniform(poly, length, P, true)`의 `true` → `closed`, 마지막 `return fitClosed(…)` → 삼항 분기 (Step 4)
  - ② 파일 끝에 `fitOpen` 추가 (Step 4)
  - ③ `truncate`의 첫 줄 `if (spectrum.kind !== "closed") return spectrum;   // "open"은 Task 5에서 채운다` → 열림 위임, 그 위에 `truncateOpen` 추가 (Step 9)
  - ④ `reconstruct`의 첫 줄 `if (spectrum.kind !== "closed") return [];   // "open"은 Task 5에서 채운다` → 열림 분기, 그 위에 `evaluateOpen` 추가 (Step 9)
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.test.ts` — Task 4 Step 5가 넣은 `it("열린 획은 아직 이 모듈이 처리하지 않는다")` **하나만** 교체한다. 다른 테스트는 한 글자도 건드리지 않는다 (Step 6)
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.open.test.ts` (12 tests: Step 2에서 8개, Step 7에서 4개)
- Test: 위 신규 파일 + `lib/fourier.test.ts` 회귀 (Step 1·5·10에서 반드시 다시 돌린다)

**Interfaces:**

*Consumes*
- `@/lib/geometry` (Task 2): `type Point = { x: number; y: number }`, `type Closure = "closed" | "open" | "point"`
- `@/lib/resample` (Task 3): `type Complex = { re: number; im: number }`, `densify(points: Point[], closed: boolean): { poly: Point[]; length: number }`, `resampleUniform(poly: Point[], length: number, P: number, closed: boolean): Point[]` — **열림이면 P+1개(k = 0..P, 양 끝 포함)**, `toComplex(p: Point): Complex`, `fromComplex(z: Complex): Point`
- `lib/fourier.ts` (Task 4, **같은 파일이므로 import 없이 쓴다**). D-D에 따라 Task 4가 이미 다음을 만들어 둔 상태를 전제한다. **Task 5는 이 중 한 줄도 다시 쓰지 않는다:**
  ```ts
  type Term = { n: number; re: number; im: number }
  type FitStats = { P: number; arcLength: number; normS: number; rmsError: number; maxError: number; accuracy: number; capped: boolean }
  type Spectrum = { kind: "point"; length: number } | { kind: "closed"; … } | { kind: "open"; z0: Complex; delta: Complex; terms: Term[]; stats: FitStats }
  type FitOptions = { target?: number; maxTerms?: number; absFloor?: number }
  type Candidate = Term & { energy: number }                      // 모듈 지역 타입
  const T_MAX = 24 / TARGET_ACCURACY = 0.99 / ABS_FLOOR = 0.15 / MIN_ARC_LENGTH = 1e-6
  const energyOf: (term: { re: number; im: number }) => number     // 모듈 지역
  const clamp01: (value: number) => number                         // 모듈 지역
  const evaluateClosed: (c0: Complex, terms: Term[], t: number) => Complex   // 모듈 지역
  export const sampleCount: (arcLength: number) => number
  export const bandLimit: (P: number) => number
  export function normOf(samples: Complex[]): number               // S = 표본의 중심 대비 RMS 거리
  export function fitClosed(samples: Complex[], arcLength: number, options?: FitOptions): Spectrum
  function selectAndFinalize(
    samples: Complex[], candidates: Candidate[], tailEnergy: number, normS: number,
    arcLength: number, P: number, rebuild: (terms: Term[]) => Complex[], options?: FitOptions
  ): { terms: Term[]; stats: FitStats }
  export function truncate(spectrum: Spectrum, termCount: number): Spectrum
  export function reconstruct(spectrum: Spectrum, q: number): Point[]
  export function overlayPointCount(spectrum: Spectrum): number
  ```
- 계약 세 개. 깨지면 이 태스크의 모든 기대값이 즉시 빨강이 된다:
  1. **D-C** — `selectAndFinalize`는 `candidates`를 진폭(=`energy`) 내림차순으로 정렬해 상위 k개를 그대로 반환한다. **`n` 오름차순 재정렬을 하지 않는다.** 이것이 `truncate(k)` = "진폭 상위 k개" 계약의 근거다.
  2. **D-F** — 국소 꺾임 보정 조건은 `maxError > 3 * rmsError && maxError > absFloor && count > 0 && count < ceiling` 하나뿐이다. 정지조건·정확도·`maxError` 보정의 구현은 앱에 이 함수 하나다.
  3. **D-E** — `fitStroke`의 `point` 분기는 `{ kind: "point", length: <호길이> }`를 돌려준다(항상 0이 아니다). 이 분기는 Task 4 소유이고 Task 5는 건드리지 않는다.

*Produces*
- `fitStroke(points, "open", options?) → { kind: "open"; z0: Complex; delta: Complex; terms: Term[]; stats: FitStats }`. `terms`는 **진폭 내림차순**, 모든 `n ≥ 1`, 중복 없음. (`n` 오름차순이 아니다 — 표시용 정렬은 Task 10의 계수표가 각자 한다.)
- `Term.n`의 의미가 kind마다 다르다: `"open"`은 `sin(πnt)`의 인덱스(항상 양수), `"closed"`는 `e^(2πint)`의 인덱스(음수 가능). 뒤 태스크의 `applyOperator`·`formatLatex`는 **`n`의 부호가 아니라 `kind`로 분기해야 한다.**
- `z0`와 `delta`는 항 수에 세지 않는다: `terms.length === 0`이어도 획은 완전히 표현된다(직선).
- `truncate(spectrum, k)`의 `"open"` 분기 — 진폭 상위 k항 슬라이스 + 파스발로 `rmsError`/`accuracy` 재계산. `z0`·`delta`는 참조 그대로 물려주므로 **슬라이더를 어디에 두어도 재구성 곡선의 양 끝점이 원본 획의 끝점과 일치한다.**
- `reconstruct(spectrum, q)`의 `"open"` 분기 — `z₀ + Δ·t + Σ b_n sin(πnt)`를 `t = j/(q−1)`, j = 0..q−1로 평가해 **닫힘과 같은 q개**(양 끝점 포함) 반환. 닫힘은 `t = j/q`(끝점 중복 없음, 렌더가 `Z`로 닫는다), 열림은 `t = j/(q−1)`(끝점 포함) — 개수만 같고 격자는 다르다. Task 6의 궤도 비교 헬퍼와 Task 10의 오버레이가 두 kind를 같은 코드로 그리는 근거다.
- 이 태스크 범위 밖: `applyOperator`(Task 6), `formatLatex`(Task 8), 오버레이 배선(Task 10).

**측정 근거** — 아래 모든 기대값은 scratchpad(`/private/tmp/claude-501/-Users-yoma-projects-jamcoding-jangyunu/3f4104c7-fa88-4f58-9015-533d06633e7b/scratchpad/t5/{core,run,run2,run3,run4,assert}.mjs`)에서 Task 3의 `densify`(D-G의 클램프 방식) + Task 4의 공유 코어(D-C·D-F 반영) + 이 태스크의 코드를 그대로 `.mjs`로 옮겨 node로 실행한 실측이다. 계획에 적힌 단언 451개를 `assert.mjs`가 전부 재현했고, TS 사본은 `--strict`에서 무출력으로 통과했다.

| 획 | 항 | n (저장 순서 = 진폭 내림차순) | P | L | S | rms | maxError | 정확도 |
|---|---|---|---|---|---|---|---|---|
| 직선 가로 2점 | **0** | — | 128 | 60.00000 | 17.45530 | 0 | 0 | 100.000% |
| 직선 대각 2점 | **0** | — | 164 | 81.39410 | 23.63929 | 8.8e-15 | 2.6e-14 | 100.000% |
| 직선 대각 9점 | **0** | — | 164 | 81.39410 | 23.63929 | 2.3e-14 | 4.3e-14 | 100.000% |
| 반원 180° | 3 | 1, 2, 4 | 188 | 94.24377 | 23.21607 | 0.14145 | 0.29107 | 99.391% |
| 완만한 호 90° | 3 | 1, 2, 3 | 128 | 47.12332 | 13.14986 | 0.08940 | 0.15446 | 99.320% |
| 물결 2주기 | 5 | **4, 12, 8, 20, 16** | 262 | 131.11836 | 19.55434 | 0.15260 | 0.30798 | 99.220% |
| 갈고리 | 4 | 1, 2, 3, 4 | 128 | 55.41174 | 12.78592 | 0.11221 | 0.29497 | 99.122% |
| 직각 코너 | 15 | 1,2,3,4,6,5,8,10,11,13,9,15,12,17,20 | 140 | 70.08122 | 16.27936 | 0.08154 | 0.45749 | 99.499% |
| 360° r=4 (시작=끝) | 3 | 1, 2, 3 | 128 | 25.11041 | 3.99504 | 0.14280 | 0.26885 | 96.426% |

물결의 `[4, 12, 8, 20, 16]`이 D-C의 증거다 — `|b₁₂| = 1.1389 > |b₈| = 1.0618`이라 진폭 순서와 `n` 순서가 실제로 갈린다. 직각 코너는 **열린 획에서 국소 꺾임 보정이 발동하는 유일한 픽스처**다(그리디 정지 10항에서 `maxError 0.71976 / rms 0.14801 = 4.863배` → `ceil(10 × 1.5) = 15`항). 공유 코어가 진짜로 공유되는지를 이 픽스처 하나가 잰다. 나머지 곡선 획은 비율 1.7~2.6이라 발동하지 않는다.

정지 문턱 대비 여유(문턱 = `max(0.01·S, 0.15)`): 반원 `e(N−1) = 2.03× / e(N) = 0.61×`, 호 90° `1.35× / 0.60×`, 물결 `1.30× / 0.78×`, 갈고리 `3.15× / 0.75×`. 어느 쪽도 경계에 붙어 있지 않다.

---

- [ ] **Step 1: 전제 확인 — Task 4가 D-D대로 쪼개 두었는가**

이 태스크의 모든 스텝이 Task 4의 공유 코어를 **호출만** 한다. 앵커가 없으면 여기서 멈추고 Task 4로 돌아간다.

```
cd /Users/yoma/projects/jamcoding/jangyunu
grep -n "function fitClosed\|function normOf\|function selectAndFinalize\|type Candidate\|const energyOf\|const clamp01\|const evaluateClosed\|open stroke fitting" lib/fourier.ts
```

예상 출력 — 8줄이 모두 나와야 한다(줄 번호는 다를 수 있다).

```
lib/fourier.ts:NN:const energyOf = (term: { re: number; im: number }) => term.re * term.re + term.im * term.im;
lib/fourier.ts:NN:const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
lib/fourier.ts:NN:type Candidate = Term & { energy: number };
lib/fourier.ts:NN:function selectAndFinalize(
lib/fourier.ts:NN:export function normOf(samples: Complex[]): number {
lib/fourier.ts:NN:const evaluateClosed = (c0: Complex, terms: Term[], t: number): Complex => {
lib/fourier.ts:NN:export function fitClosed(samples: Complex[], arcLength: number, options?: FitOptions): Spectrum {
lib/fourier.ts:NN:  if (closure === "open") throw new Error("fitStroke: open stroke fitting lands in the next task");
```

`selectAndFinalize`가 없고 항 선택 코드가 `fitClosed` 안에 인라인으로 있으면 D-D가 이행되지 않은 것이다. 이 태스크에서 리팩터하지 말고 Task 4를 먼저 고친다 — 정확도·정지조건·`maxError` 보정이 두 벌 존재하면 열림이 닫힘과 다른 규칙으로 끝나고, 그 차이는 화면에 "정확도 99%"로 똑같이 표시되어 발견되지 않는다.

이어서 닫힘 기준선을 찍어 둔다(Step 5·10에서 이 값이 한 자리도 바뀌면 안 된다).

```
npx vitest run lib/fourier.test.ts
```

예상 출력: `Test Files  1 passed (1)` — Task 4가 만든 테스트가 전부 통과. 참조 구현 실측 기준값: 반지름 30 원 → **1항, n = 1, |c₁| = 29.9991, P = 378, L = 188.4922, rms = 3.778e-3, maxError = 3.412e-2, 정확도 99.98741%**. 정사각형 9항 99.4592% · 정육각형 6항 99.5412% · 오각별 12항 99.4902%.

- [ ] **Step 2: 열린 획 실패 테스트 작성 (8개)**

`lib/fourier.open.test.ts`를 새로 만든다. 픽스처는 전부 결정적이고, 정확도 검증은 라이브러리를 쓰지 않고 식을 직접 평가해서 한다 — 정확도가 자기 자신을 채점하면 T7의 의미가 사라진다. `truncate`도 쓰지 않는다(이 스텝 시점에 열림 분기가 비어 있어 공허하게 통과한다).

```ts
// 이 스위트가 지키는 것: 직선 0항(스펙 D1의 판매 근거), 진폭 내림차순 저장(D-C),
// 공유 정지 코어가 열림에도 같은 규칙으로 작동한다는 것(D-D·D-F), 그리고 보고된 정확도가 참이라는 것(T7·T10).

import { describe, expect, it } from "vitest";

import type { Point } from "@/lib/geometry";
import { densify, resampleUniform, toComplex, type Complex } from "@/lib/resample";
import { ABS_FLOOR, T_MAX, fitStroke, type FitOptions, type Spectrum, type Term } from "@/lib/fourier";

// ---- 픽스처: 전부 결정적. 난수도 스냅샷도 쓰지 않는다 ----
const straightPoints = (a: Point, b: Point, count = 2): Point[] =>
  Array.from({ length: count }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / (count - 1),
    y: a.y + ((b.y - a.y) * i) / (count - 1)
  }));

const arcPoints = (degrees: number, radius = 30, segments = 24): Point[] =>
  Array.from({ length: segments + 1 }, (_, i) => {
    const angle = ((degrees * Math.PI) / 180) * (i / segments);
    return { x: 50 + radius * Math.cos(angle), y: 50 - radius * Math.sin(angle) };
  });

const wavePoints = (cycles = 2, amplitude = 14, span = 60, segments = 40): Point[] =>
  Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    return { x: 50 - span / 2 + span * t, y: 50 - amplitude * Math.sin(2 * Math.PI * cycles * t) };
  });

// J 갈고리: 수직으로 내려오다 반원으로 말려 올라간다(접선 연속, 곡률만 점프).
const hookPoints = (drop = 24, radius = 10, downSteps = 12, turnSteps = 16): Point[] => {
  const top = 50 - drop / 2;
  const bottom = 50 + drop / 2;
  const points: Point[] = [];
  for (let i = 0; i <= downSteps; i += 1) points.push({ x: 50, y: top + (drop * i) / downSteps });
  for (let i = 1; i <= turnSteps; i += 1) {
    const angle = Math.PI - (Math.PI * i) / turnSteps;
    points.push({ x: 50 + radius + radius * Math.cos(angle), y: bottom + radius * Math.sin(angle) });
  }
  return points;
};

// 직각 코너: 가로 30 → 아래로 40. 접선이 끊기므로 열린 획 중 유일하게 국소 꺾임 보정을 발동시킨다.
const cornerPoints = (across = 30, down = 40, step = 2): Point[] => {
  const points: Point[] = [];
  for (let x = 20; x <= 20 + across; x += step) points.push({ x, y: 30 });
  for (let y = 30 + step; y <= 30 + down; y += step) points.push({ x: 20 + across, y });
  return points;
};

type OpenSpectrum = Extract<Spectrum, { kind: "open" }>;

const fitOpenStroke = (points: Point[], options?: FitOptions): OpenSpectrum => {
  const spectrum = fitStroke(points, "open", options);
  if (spectrum.kind !== "open") throw new Error(`expected kind "open", got "${spectrum.kind}"`);
  return spectrum;
};

const amplitudeOf = (term: Term) => Math.hypot(term.re, term.im);

// 라이브러리를 쓰지 않고 식을 직접 평가한다. 정확도가 자기 자신을 채점하지 못하게 하기 위함이다.
// terms 를 인자로 받는 이유: 부분합의 끝점 통과를 truncate 없이 재기 위해서다.
const evaluate = (spectrum: OpenSpectrum, terms: Term[], t: number): Complex => {
  let re = spectrum.z0.re + t * spectrum.delta.re;
  let im = spectrum.z0.im + t * spectrum.delta.im;
  for (const term of terms) {
    const basis = Math.sin(Math.PI * term.n * t);
    re += term.re * basis;
    im += term.im * basis;
  }
  return { re, im };
};

const samplesOf = (points: Point[], P: number): Complex[] => {
  const { poly, length } = densify(points, false);
  return resampleUniform(poly, length, P, false).map(toComplex);
};

const shapes = [
  { name: "반원 180°", points: arcPoints(180), terms: 3 },
  { name: "완만한 호 90°", points: arcPoints(90), terms: 3 },
  { name: "물결 2주기", points: wavePoints(), terms: 5 },
  { name: "갈고리", points: hookPoints(), terms: 4 },
  { name: "직각 코너", points: cornerPoints(), terms: 15 }
];

describe("fitStroke — 열린 획", () => {
  it("완전한 직선은 0항으로 정확하다", () => {
    const cases = [
      straightPoints({ x: 20, y: 50 }, { x: 80, y: 50 }),
      straightPoints({ x: 20, y: 20 }, { x: 80, y: 75 }),
      straightPoints({ x: 20, y: 20 }, { x: 80, y: 75 }, 9)
    ];
    for (const points of cases) {
      const spectrum = fitOpenStroke(points);
      expect(spectrum.terms).toEqual([]);
      expect(spectrum.stats.rmsError).toBeLessThan(1e-9);
      expect(spectrum.stats.maxError).toBeLessThan(1e-9);
      expect(spectrum.stats.accuracy).toBeCloseTo(1, 10);
      expect(spectrum.stats.capped).toBe(false);
      expect(spectrum.stats.normS).toBeGreaterThan(0);   // 0항인데 분모가 0이면 정확도가 자기충족적이다
    }
  });

  it("반원의 계수가 해석해와 일치한다", () => {
    const spectrum = fitOpenStroke(arcPoints(180));
    // r(t) = 30e^{iπt} − 30 + 60t → b₁ = 30i, b₂ = 20/π, b₄ = 2/π, 홀수 n ≥ 3 은 정확히 0.
    expect(spectrum.terms.map((term) => term.n)).toEqual([1, 2, 4]);
    expect(Math.hypot(spectrum.terms[0].re, spectrum.terms[0].im - 30)).toBeLessThan(0.01);
    expect(Math.hypot(spectrum.terms[1].re - 20 / Math.PI, spectrum.terms[1].im)).toBeLessThan(0.01);
    expect(Math.hypot(spectrum.terms[2].re - 2 / Math.PI, spectrum.terms[2].im)).toBeLessThan(0.01);
    expect(Math.hypot(spectrum.z0.re - 30, spectrum.z0.im)).toBeLessThan(1e-9);
    expect(Math.hypot(spectrum.delta.re + 60, spectrum.delta.im)).toBeLessThan(1e-9);
    expect(spectrum.stats.P).toBe(188);
    expect(spectrum.stats.arcLength).toBeCloseTo(94.2438, 3);
  });

  it("열린 획이 T_max 안에서 목표 정확도에 도달한다", () => {
    for (const shape of shapes) {
      const spectrum = fitOpenStroke(shape.points);
      expect({ name: shape.name, terms: spectrum.terms.length }).toEqual({ name: shape.name, terms: shape.terms });
      expect(spectrum.terms.length).toBeLessThanOrEqual(T_MAX);
      expect(spectrum.stats.capped, shape.name).toBe(false);
      expect(spectrum.stats.accuracy, shape.name).toBeGreaterThan(0.99);
      expect(spectrum.terms.every((term) => term.n >= 1), shape.name).toBe(true);
      expect(new Set(spectrum.terms.map((term) => term.n)).size, shape.name).toBe(spectrum.terms.length);
    }
  });

  it("항을 진폭 내림차순으로 저장한다", () => {
    // D-C: truncate(k) = "진폭 상위 k개" 계약의 근거. n 오름차순으로 재정렬하면 이 단언이 깨진다.
    // 물결은 |b₁₂| = 1.1389 > |b₈| = 1.0618 이라 두 순서가 실제로 갈리는 픽스처다.
    expect(fitOpenStroke(wavePoints()).terms.map((term) => term.n)).toEqual([4, 12, 8, 20, 16]);
    for (const shape of shapes) {
      const amplitudes = fitOpenStroke(shape.points).terms.map(amplitudeOf);
      expect(amplitudes, shape.name).toEqual([...amplitudes].sort((a, b) => b - a));
    }
  });

  it("보고된 오차가 표본에서 실제로 성립한다", () => {
    for (const shape of shapes) {
      const spectrum = fitOpenStroke(shape.points);
      const P = spectrum.stats.P;
      const samples = samplesOf(shape.points, P);
      let square = 0;
      let worst = 0;
      for (let k = 0; k <= P; k += 1) {
        const hat = evaluate(spectrum, spectrum.terms, k / P);
        const gap = Math.hypot(samples[k].re - hat.re, samples[k].im - hat.im);
        square += gap * gap;
        worst = Math.max(worst, gap);
      }
      const measured = Math.sqrt(square / (P + 1));
      expect(Math.abs(measured - spectrum.stats.rmsError) / measured, shape.name).toBeLessThan(1e-9);
      expect(worst, shape.name).toBeCloseTo(spectrum.stats.maxError, 10);
      expect(spectrum.stats.accuracy, shape.name).toBeCloseTo(1 - measured / spectrum.stats.normS, 10);
    }
  });

  it("재구성이 양 끝점을 항 수와 무관하게 정확히 지난다", () => {
    for (const shape of shapes) {
      const spectrum = fitOpenStroke(shape.points);
      const samples = samplesOf(shape.points, spectrum.stats.P);
      const last = samples[spectrum.stats.P];
      for (let count = 0; count <= spectrum.terms.length; count += 1) {
        const partial = spectrum.terms.slice(0, count);
        const head = evaluate(spectrum, partial, 0);
        const tail = evaluate(spectrum, partial, 1);
        const label = `${shape.name} ${count}항`;
        expect(Math.hypot(head.re - samples[0].re, head.im - samples[0].im), label).toBeLessThan(1e-12);
        expect(Math.hypot(tail.re - last.re, tail.im - last.im), label).toBeLessThan(1e-12);
      }
    }
  });

  it("시작점과 끝점이 같은 열린 획도 NaN 없이 처리한다", () => {
    const spectrum = fitOpenStroke(arcPoints(360, 4, 16));
    expect(Math.hypot(spectrum.delta.re, spectrum.delta.im)).toBeLessThan(1e-9);   // Δ ≈ 0 이어도 0으로 나누지 않는다
    expect(spectrum.terms.length).toBeGreaterThan(0);
    for (const term of spectrum.terms) {
      expect(Number.isFinite(term.re)).toBe(true);
      expect(Number.isFinite(term.im)).toBe(true);
    }
    expect(Number.isFinite(spectrum.stats.rmsError)).toBe(true);
    expect(spectrum.stats.accuracy).toBeGreaterThan(0);
    expect(spectrum.stats.accuracy).toBeLessThanOrEqual(1);
    // 반지름 4짜리 작은 획이라 절대 하한(0.15)에서 멈춘다 — 항 낭비 방지가 열림에도 그대로 걸린다.
    expect(spectrum.stats.rmsError).toBeLessThanOrEqual(ABS_FLOOR);
    expect(spectrum.stats.accuracy).toBeLessThan(0.99);
  });

  it("국소 꺾임 보호가 열린 획에서도 같은 규칙으로 발동한다", () => {
    // 공유 코어(selectAndFinalize)가 실제로 공유되는지 재는 유일한 테스트다.
    // 열림이 자기 정지 규칙을 따로 갖고 있으면 여기서만 빨강이 된다.
    const stopped = fitOpenStroke(cornerPoints(), { maxTerms: 10 });   // 그리디 정지 시점을 재현
    expect(stopped.stats.rmsError).toBeCloseTo(0.148, 2);
    expect(stopped.stats.maxError).toBeCloseTo(0.720, 1);
    expect(stopped.stats.maxError).toBeGreaterThan(3 * stopped.stats.rmsError);   // 실측 비율 4.863
    expect(stopped.stats.maxError).toBeGreaterThan(ABS_FLOOR);                    // D-F 의 두 번째 조건

    const grown = fitOpenStroke(cornerPoints());
    expect(grown.terms.length).toBe(15);                 // ceil(10 × 1.5)
    expect(grown.stats.rmsError).toBeCloseTo(0.08154, 4);
    expect(grown.stats.maxError).toBeCloseTo(0.45749, 4);
    expect(grown.stats.accuracy).toBeCloseTo(0.994991, 5);

    // 잔차가 매끄러운 획은 발동하지 않는다 — 성장 규칙이 항상 켜지면 직선 0항이 무너진다.
    const smooth = fitOpenStroke(arcPoints(90));
    expect(smooth.stats.maxError).toBeLessThanOrEqual(3 * smooth.stats.rmsError);
  });
});
```

- [ ] **Step 3: 빨강 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu
npx vitest run lib/fourier.open.test.ts
```

예상 출력 — Task 4 시점의 `fitStroke`는 열림에서 던진다.

```
 ❯ lib/fourier.open.test.ts (8 tests | 8 failed)
   × fitStroke — 열린 획 > 완전한 직선은 0항으로 정확하다
     → fitStroke: open stroke fitting lands in the next task
   × fitStroke — 열린 획 > 반원의 계수가 해석해와 일치한다
   × fitStroke — 열린 획 > 열린 획이 T_max 안에서 목표 정확도에 도달한다
   × fitStroke — 열린 획 > 항을 진폭 내림차순으로 저장한다
   × fitStroke — 열린 획 > 보고된 오차가 표본에서 실제로 성립한다
   × fitStroke — 열린 획 > 재구성이 양 끝점을 항 수와 무관하게 정확히 지난다
   × fitStroke — 열린 획 > 시작점과 끝점이 같은 열린 획도 NaN 없이 처리한다
   × fitStroke — 열린 획 > 국소 꺾임 보호가 열린 획에서도 같은 규칙으로 발동한다

 Test Files  1 failed (1)
      Tests  8 failed (8)
```

**집계 줄 `Tests 8 failed (8)`만이 판정 기준이다.** 하나라도 통과하면 테스트가 잘못 작성된 것이니 Step 2로 돌아간다.

- [ ] **Step 4: fitOpen 구현 + fitStroke 배선**

`lib/fourier.ts` 파일 끝(`overlayPointCount` 아래)에 추가한다.

```ts
// 열린 획: 현 분리 후 DST-I. z(t) = z₀ + Δ·t + Σ b_n sin(πnt).
// 항 선택·정지조건·정확도·maxError 보정은 손대지 않는다 — selectAndFinalize 하나가 닫힘과 열림을 모두 끝낸다.
function fitOpen(samples: Complex[], arcLength: number, options?: FitOptions): Spectrum {
  const P = samples.length - 1;
  const K = bandLimit(P);
  const z0 = samples[0];
  const delta = { re: samples[P].re - z0.re, im: samples[P].im - z0.im };

  // r_k = z_k − z₀ − (k/P)Δ. 정의상 r_0 = r_P = 0 이므로 합에서 뺀다(Float64Array 는 0으로 초기화된다).
  const rRe = new Float64Array(P + 1);
  const rIm = new Float64Array(P + 1);
  for (let k = 1; k < P; k += 1) {
    const f = k / P;
    rRe[k] = samples[k].re - z0.re - f * delta.re;
    rIm[k] = samples[k].im - z0.im - f * delta.im;
  }

  // sin(πm/P) 는 m 에 대해 주기 2P. n·k ≤ 64 × 512 = 32768 이라 정수 나머지가 안전하다.
  const span = 2 * P;
  const sinTable = new Float64Array(span);
  for (let j = 0; j < span; j += 1) sinTable[j] = Math.sin((Math.PI * j) / P);

  // 표본 P+1 개 기준 평균제곱오차 환산 계수. Σ_{k=1}^{P−1}|res_k|² = (P/2)Σ_{n∉A}|b_n|² 이므로.
  // 닫힘의 energy 는 |c_n|²(환산 계수 1)이고 열림은 이 scale 이 붙는다. 두 kind 의 energy 가
  // 같은 단위(표본 MSE)여야 selectAndFinalize 의 정지 문턱이 한 벌로 성립한다.
  const scale = P / (2 * (P + 1));

  const candidates: Candidate[] = [];
  for (let n = 1; n <= K; n += 1) {
    let re = 0;
    let im = 0;
    for (let k = 1; k < P; k += 1) {
      const s = sinTable[(n * k) % span];
      re += rRe[k] * s;
      im += rIm[k] * s;
    }
    re *= 2 / P;
    im *= 2 / P;
    candidates.push({ n, re, im, energy: scale * (re * re + im * im) });
  }

  // 파스발: Σ_{n=1}^{P−1}|b_n|² = (2/P)Σ_{k=1}^{P−1}|r_k|². 후보 대역(K) 밖 에너지까지 정확히 포함된다.
  let power = 0;
  for (let k = 1; k < P; k += 1) power += rRe[k] * rRe[k] + rIm[k] * rIm[k];
  const tailEnergy = scale * (2 / P) * power;

  const rebuild = (terms: Term[]): Complex[] => {
    const out: Complex[] = [];
    for (let k = 0; k <= P; k += 1) {
      const f = k / P;
      let re = z0.re + f * delta.re;
      let im = z0.im + f * delta.im;
      for (const term of terms) {
        const s = sinTable[(term.n * k) % span];
        re += term.re * s;
        im += term.im * s;
      }
      out.push({ re, im });
    }
    return out;
  };

  const { terms, stats } = selectAndFinalize(samples, candidates, tailEnergy, normOf(samples), arcLength, P, rebuild, options);
  return { kind: "open", z0, delta, terms, stats };
}
```

`fitStroke`를 아래로 교체한다. 바뀌는 것은 세 가지뿐이다 — `throw` 한 줄 삭제, `resampleUniform`의 4번째 인자 `true` → `closed`, 마지막 반환의 분기.

```ts
export function fitStroke(points: Point[], closure: Closure, options: FitOptions = {}): Spectrum {
  if (points.length < 2) return { kind: "point", length: 0 };
  const closed = closure === "closed";
  const { poly, length } = densify(points, closed);
  if (closure === "point" || !(length > MIN_ARC_LENGTH)) return { kind: "point", length };
  const P = sampleCount(length);
  // 닫힘은 P개(끝점 중복 없음), 열림은 P+1개(양 끝 포함). fitOpen 은 samples.length − 1 로 P를 되찾는다.
  const samples = resampleUniform(poly, length, P, closed).map(toComplex);
  return closed ? fitClosed(samples, length, options) : fitOpen(samples, length, options);
}
```

파일 상단 첫 줄 주석 뒤에 한 줄을 덧붙인다(이 파일이 이제 변환을 두 개 들고 있다).

```ts
// 닫힌 획은 지수급수(DFT), 열린 획은 현 분리 + 사인급수(DST-I). 항 선택과 정확도는 두 변환이 같은 코어를 쓴다.
```

이 구현으로 node에서 실측한 항등식(P = 188):
- 테이블 조회 `sinTable[(n·k) % 2P]` vs `Math.sin(πnk/P)` 최대 편차 **4.998e-14**
- DST-I 직교성 `Σ_{k=1}^{P−1} sin(πnk/P)sin(πmk/P) − (P/2)δ_{nm}` 최대 편차 **7.105e-14**
- 파스발 `e(0항) = (2/P)Σ|r_k|² 환산값` vs 실제 0항 잔차 상대차 **1.64e-16**(반원) / **0**(갈고리)

- [ ] **Step 5: 초록 확인 + Task 4 테스트 1개의 빨강 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu
npx vitest run lib/fourier.open.test.ts
```

예상 출력:

```
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

이어서 닫힘 회귀를 돌린다.

```
npx vitest run lib/fourier.test.ts
```

예상 출력 — **실패가 정확히 1개**여야 하고, 그것이 Task 4가 남긴 `throw` 테스트여야 한다.

```
 FAIL  lib/fourier.test.ts > 닫힌 획 적합 > 열린 획은 아직 이 모듈이 처리하지 않는다
AssertionError: expected [Function] to throw error matching /open/ but it didn't

 Test Files  1 failed (1)
      Tests  1 failed | <나머지 전부> passed
```

다른 테스트가 하나라도 빨강이면 `fitOpen`이 공유 코어를 바꿔 놓은 것이다. Step 4로 돌아가 `selectAndFinalize`·`fitClosed`를 건드리지 않았는지 확인한다(D-D).

- [ ] **Step 6: Task 4의 throw 테스트를 이음매 테스트로 교체 + 커밋**

`lib/fourier.test.ts`의 `describe("닫힌 획 적합")` 안 마지막 `it` 하나를 교체한다. 바꾸기 전:

```ts
  it("열린 획은 아직 이 모듈이 처리하지 않는다", () => {
    expect(() => fitStroke([{ x: 20, y: 50 }, { x: 80, y: 50 }], "open")).toThrow(/open/);
  });
```

바꾼 뒤:

```ts
  it("열린 획은 열림 분기로 넘어가고 표본을 P+1개 쓴다", () => {
    const spectrum = fitStroke([{ x: 20, y: 50 }, { x: 80, y: 50 }], "open");
    if (spectrum.kind !== "open") throw new Error(`열린 스펙트럼이 아니다: ${spectrum.kind}`);
    expect(spectrum.terms).toEqual([]);                      // 직선은 0항
    expect(spectrum.stats.arcLength).toBeCloseTo(60, 9);
    // resampleUniform 의 4번째 인자를 closed 로 넘기지 않으면(=true 고정) 표본이 P개로 와서
    // fitOpen 이 P = 127 로 계산한다. 이 128 단언이 그 실수만 잡는다.
    expect(spectrum.stats.P).toBe(128);
  });
```

```
cd /Users/yoma/projects/jamcoding/jangyunu
npx vitest run lib/ && npx tsc --noEmit
```

예상 출력: `lib/fourier.test.ts`는 Task 4가 만든 개수 그대로(교체이지 추가가 아니다), `lib/fourier.open.test.ts`는 `8 passed`, Task 1~3의 스위트까지 포함해 **전부 통과**. `tsc`는 아무것도 출력하지 않고 종료 코드 0이다(`npm run build`는 dev 서버가 쓰는 `.next`를 건드리므로 돌리지 않는다).

```
git add lib/fourier.ts lib/fourier.test.ts lib/fourier.open.test.ts
git commit -m "open strokes via chord separation and DST-I"
```

- [ ] **Step 7: truncate·reconstruct 실패 테스트 추가 (4개)**

이게 빠지면 **모달의 주역인 재구성 오버레이(D13)가 모든 열린 획에서 빈 화면이고**, 항 수 슬라이더도 열린 획에는 아무 효과가 없다. 직선·호·물결이 마법진의 대부분이다.

`lib/fourier.open.test.ts`의 import를 넓힌다.

```ts
import { ABS_FLOOR, T_MAX, fitStroke, overlayPointCount, reconstruct, truncate, type FitOptions, type Spectrum, type Term } from "@/lib/fourier";
```

파일 끝에 describe를 덧붙인다.

```ts
describe("truncate · reconstruct — 열린 획", () => {
  it("truncate는 진폭 상위 k항만 남기고 오차를 다시 센다", () => {
    for (const shape of shapes) {
      const fit = fitOpenStroke(shape.points);
      let previous = Infinity;
      for (let count = 0; count <= fit.terms.length; count += 1) {
        const view = truncate(fit, count);
        if (view.kind !== "open") throw new Error("열린 스펙트럼이 아니다");
        const label = `${shape.name} ${count}항`;
        expect(view.terms, label).toEqual(fit.terms.slice(0, count));   // 진폭 상위 k개, 재정렬 없음
        expect(view.stats.rmsError, label).toBeLessThanOrEqual(previous + 1e-12);
        expect(view.z0, label).toBe(fit.z0);        // 아핀 항은 항 수와 무관하다 — 슬라이더가 끝점을 흔들지 않는 근거
        expect(view.delta, label).toBe(fit.delta);
        expect(view.stats.capped, label).toBe(false);
        previous = view.stats.rmsError;
      }
      expect(truncate(fit, fit.terms.length)).toBe(fit);   // 전량이면 같은 객체
      expect(truncate(fit, 999)).toBe(fit);
      const none = truncate(fit, -3);
      if (none.kind !== "open") throw new Error("열린 스펙트럼이 아니다");
      expect(none.terms).toHaveLength(0);
    }
    // 닫힘과 달리 0항 오차는 normS 가 아니다 — z₀ + Δt 가 이미 획의 상당 부분을 설명하고 있다.
    // 이 차이를 놓치고 normS² 에서 빼면 열린 획의 슬라이더 정확도가 전 구간 거짓이 된다.
    const semi = fitOpenStroke(arcPoints(180));
    const zero = truncate(semi, 0);
    if (zero.kind !== "open") throw new Error("열린 스펙트럼이 아니다");
    expect(zero.stats.rmsError).toBeCloseTo(21.6332, 3);
    expect(zero.stats.accuracy).toBeCloseTo(0.068178, 5);
    expect(semi.stats.normS).toBeCloseTo(23.2161, 3);
  });

  it("truncate(k)와 maxTerms:k 적합이 같은 항·같은 오차를 낸다", () => {
    for (const shape of shapes) {
      const fit = fitOpenStroke(shape.points);
      for (let count = 1; count < fit.terms.length; count += 1) {
        const view = truncate(fit, count);
        const refit = fitOpenStroke(shape.points, { maxTerms: count });
        if (view.kind !== "open") throw new Error("열린 스펙트럼이 아니다");
        const label = `${shape.name} ${count}항`;
        expect(view.terms.map((term) => term.n), label).toEqual(refit.terms.map((term) => term.n));
        expect(view.stats.rmsError, label).toBeCloseTo(refit.stats.rmsError, 9);
        expect(view.stats.accuracy, label).toBeCloseTo(refit.stats.accuracy, 9);
      }
    }
  });

  it("reconstruct는 끝점을 포함한 q개를 돌려준다", () => {
    for (const shape of shapes) {
      const fit = fitOpenStroke(shape.points);
      const q = overlayPointCount(fit);
      const drawn = reconstruct(fit, q);
      expect(drawn, shape.name).toHaveLength(q);
      // 같은 t 격자(j/(q−1))에서 원곡선을 뽑아 점대점으로 비교한다.
      const { poly, length } = densify(shape.points, false);
      const truth = resampleUniform(poly, length, q - 1, false);
      expect(truth, shape.name).toHaveLength(q);
      let worst = 0;
      for (let i = 0; i < q; i += 1) worst = Math.max(worst, Math.hypot(drawn[i].x - truth[i].x, drawn[i].y - truth[i].y));
      expect(Math.hypot(drawn[0].x - truth[0].x, drawn[0].y - truth[0].y), shape.name).toBeLessThan(1e-12);
      expect(Math.hypot(drawn[q - 1].x - truth[q - 1].x, drawn[q - 1].y - truth[q - 1].y), shape.name).toBeLessThan(1e-12);
      expect(worst, shape.name).toBeLessThanOrEqual(fit.stats.maxError * 1.05 + 1e-9);   // 실측 비 0.975 ~ 1.001
      // 슬라이더를 1항으로 내려도 끝점은 그대로다 — 오버레이가 획 끝에서 튀지 않는 근거.
      const one = reconstruct(truncate(fit, 1), q);
      expect(Math.hypot(one[0].x - truth[0].x, one[0].y - truth[0].y), shape.name).toBeLessThan(1e-12);
      expect(Math.hypot(one[q - 1].x - truth[q - 1].x, one[q - 1].y - truth[q - 1].y), shape.name).toBeLessThan(1e-12);
    }
    const fit = fitOpenStroke(arcPoints(180));
    expect(reconstruct(fit, 0)).toEqual([]);
    expect(reconstruct(fit, 1)).toEqual([{ x: 80, y: 50 }]);   // q = 1 은 0으로 나누지 않고 시작점만
    expect(reconstruct(fit, 64)).toHaveLength(64);
  });

  it("퇴화 획은 truncate·reconstruct를 그대로 통과한다", () => {
    // 새 동작을 요구하지 않는 가드다. 이 스텝이 두 함수의 첫 줄을 갈아끼우므로 point 경로가 살아 있는지 잡아 둔다.
    const degenerate = fitStroke(Array.from({ length: 12 }, () => ({ x: 50, y: 50 })), "open");
    expect(degenerate.kind).toBe("point");
    expect(truncate(degenerate, 3)).toBe(degenerate);
    expect(reconstruct(degenerate, 64)).toEqual([]);
    expect(overlayPointCount(degenerate)).toBe(0);
    // D-E: point 의 length 는 호길이다. 열림으로 들어와도 point 로 떨어지면 여기서 걸러진다.
    const asPoint = fitStroke(arcPoints(180), "point");
    if (asPoint.kind !== "point") throw new Error("point 가 아니다");
    expect(asPoint.length).toBeCloseTo(94.2438, 3);
    expect(reconstruct(asPoint, 64)).toEqual([]);
  });
});
```

- [ ] **Step 8: 빨강 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu
npx vitest run lib/fourier.open.test.ts
```

예상 출력 — 열림 분기가 비어 있으므로 `truncate`는 원본을 그대로 돌려주고 `reconstruct`는 빈 배열을 준다.

```
 ❯ lib/fourier.open.test.ts (12 tests | 3 failed)
   × truncate · reconstruct — 열린 획 > truncate는 진폭 상위 k항만 남기고 오차를 다시 센다
     → 반원 180° 0항: expected [ { n: 1, … }, … ] to deeply equal []
   × truncate · reconstruct — 열린 획 > truncate(k)와 maxTerms:k 적합이 같은 항·같은 오차를 낸다
   × truncate · reconstruct — 열린 획 > reconstruct는 끝점을 포함한 q개를 돌려준다
     → 반원 180°: expected [] to have a length of 64 but got 0

 Test Files  1 failed (1)
      Tests  3 failed | 9 passed (12)
```

네 번째 테스트(`퇴화 획은 …`)는 **이미 초록이 맞다** — 새 동작이 아니라 이 스텝이 건드리는 두 함수의 `point` 경로를 잡아 두는 가드다. 3개가 아니라 4개가 실패하면 Task 4의 `point` 처리가 D-E대로 되어 있지 않은 것이니 Step 1로 돌아간다.

- [ ] **Step 9: truncate·reconstruct의 열림 분기 구현**

`lib/fourier.ts`의 `truncate` 바로 위에 `truncateOpen`을 넣고, `truncate`의 첫 줄을 위임으로 바꾼다. **닫힘 본문은 한 글자도 건드리지 않는다.**

```ts
// 열린 획의 슬라이더용. 닫힘은 S² 에서 선택 항 에너지를 빼지만 열림은 S 가 잔차 에너지가 아니다
// (z₀ + Δt 가 이미 제거되어 있다). 대신 "버린 항의 에너지를 rmsError² 에 도로 더한다" —
// 같은 파스발의 다른 표현이고, 이쪽만 Spectrum 이 실제로 들고 있는 값(stats.P, stats.rmsError, terms)으로 닫힌다.
function truncateOpen(spectrum: Extract<Spectrum, { kind: "open" }>, termCount: number): Spectrum {
  const count = Math.max(0, Math.min(spectrum.terms.length, Math.floor(termCount)));
  if (count === spectrum.terms.length) return spectrum;
  const { P, normS, rmsError } = spectrum.stats;
  const scale = P / (2 * (P + 1));
  let tail = rmsError * rmsError;
  for (let index = count; index < spectrum.terms.length; index += 1) tail += scale * energyOf(spectrum.terms[index]);
  const nextRms = Math.sqrt(Math.max(0, tail));
  return {
    ...spectrum,   // z0 와 delta 를 참조 그대로 물려준다 — 항 수와 무관하게 끝점이 고정된다
    terms: spectrum.terms.slice(0, count),
    stats: {
      ...spectrum.stats,
      rmsError: nextRms,
      accuracy: normS > 0 ? clamp01(1 - nextRms / normS) : 1,
      capped: false
    }
  };
}
```

`truncate`의 첫 줄을 교체한다. 바꾸기 전:

```ts
  if (spectrum.kind !== "closed") return spectrum;   // "open"은 Task 5에서 채운다
```

바꾼 뒤:

```ts
  if (spectrum.kind === "open") return truncateOpen(spectrum, termCount);
  if (spectrum.kind !== "closed") return spectrum;   // point 는 자를 것이 없다
```

`reconstruct` 바로 위에 `evaluateOpen`을 넣는다(`evaluateClosed` 옆이 자리다).

```ts
// z(t) = z₀ + Δ·t + Σ b_n sin(πnt). 오버레이용이라 테이블 없이 직접 sin 을 부른다 — q ≤ 512, 항 ≤ 24.
const evaluateOpen = (z0: Complex, delta: Complex, terms: Term[], t: number): Complex => {
  let re = z0.re + t * delta.re;
  let im = z0.im + t * delta.im;
  for (const term of terms) {
    const basis = Math.sin(Math.PI * term.n * t);
    re += term.re * basis;
    im += term.im * basis;
  }
  return { re, im };
};
```

`reconstruct`를 아래로 교체한다.

```ts
// 오버레이용 곡선. 닫힘은 t = j/q 로 끝점을 중복하지 않고(렌더가 Z로 닫는다),
// 열림은 t = j/(q−1) 로 양 끝점을 포함한다. 개수는 둘 다 q 개다 — 호출부가 kind 를 몰라도 되게.
export function reconstruct(spectrum: Spectrum, q: number): Point[] {
  const count = Math.floor(q);
  if (spectrum.kind === "point" || count < 1) return [];
  const out: Point[] = [];
  if (spectrum.kind === "open") {
    const last = count > 1 ? count - 1 : 1;   // q = 1 에서 0으로 나누지 않는다
    for (let j = 0; j < count; j += 1) {
      out.push(fromComplex(evaluateOpen(spectrum.z0, spectrum.delta, spectrum.terms, j / last)));
    }
    return out;
  }
  for (let j = 0; j < count; j += 1) out.push(fromComplex(evaluateClosed(spectrum.c0, spectrum.terms, j / count)));
  return out;
}
```

정지 규칙이 여전히 한 곳뿐인지 확인한다.

```
cd /Users/yoma/projects/jamcoding/jangyunu
grep -n "TARGET_ACCURACY\|T_MAX\|ABS_FLOOR" lib/fourier.ts
```

예상 출력: **정확히 6줄** — 상수 선언 3줄과 `selectAndFinalize` 안의 `options?.target ?? TARGET_ACCURACY` / `options?.maxTerms ?? T_MAX` / `options?.absFloor ?? ABS_FLOOR` 3줄. `fitOpen`이나 `truncateOpen`에서 이 이름이 보이면 정지 규칙이 두 벌이 된 것이니 그 코드를 지운다.

- [ ] **Step 10: 초록 확인 + 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu
npx vitest run lib/ && npx tsc --noEmit
```

예상 출력 — `lib/fourier.open.test.ts`가 `12 passed`, `lib/fourier.test.ts`를 포함해 Task 1~4의 스위트까지 **전부 통과**. `tsc`는 무출력·종료 코드 0.

실측 성능(M시리즈, node): 열린 획 20개 적합 **1.76ms**, 열림·닫힘 섞어 20개 **6.23ms**. Worker 도입 기준선 50ms의 8분의 1이다.

현 분리가 거울(왕복) 확장보다 나은 폭도 같은 코드로 직접 비교했다(거울 쪽은 열림 표본을 왕복 확장해 같은 그리디·같은 정지조건으로 닫힘 적합). 스펙 §0 D1의 "3~14배" 주장은 방향이 맞고 폭은 더 크다.

| 획 | 현 분리 | 거울 확장 |
|---|---|---|
| 직선 가로 / 대각 | **0항** (100.00%) | 18항 (99.45% / 99.46%) |
| 반원 180° | **3항** (99.39%) | 23항 (99.52%) |
| 완만한 호 90° | **3항** (99.32%) | 24항 (99.02%, T_max 도달) |
| 물결 2주기 | **5항** (99.22%) | 24항 (99.05%, T_max 도달) |
| 갈고리 | **4항** (99.12%) | 24항 (99.32%, T_max 도달) |
| 직각 코너 | **15항** (99.50%) | 24항 (98.81%, T_max 도달) |

거울 확장 넷은 T_max = 24에 걸려 잘린 값이므로 실제 격차는 표보다 더 벌어진다. 이 비교는 검증용이고 저장소에 커밋하지 않는다 — 거울 확장 구현은 어디서도 쓰이지 않는 죽은 코드다.

```
git add lib/fourier.ts lib/fourier.open.test.ts
git commit -m "truncate and reconstruct open spectra"
```

**이 태스크가 남기지 않는 부채:** Task 4가 `truncate`/`reconstruct`에 남긴 `// "open"은 Task 5에서 채운다` 두 자리가 여기서 모두 상환된다. `applyOperator`의 `"open"` 분기만 Task 6으로 넘어가며, 그것은 Task 6이 자기 파일에서 처음 만드는 함수라 플레이스홀더가 아니다.

---

### Task 6: applyOperator — 대칭을 계수 위 연산으로

스펙 §1.7 · D10 · E9 · E10 / 테스트 T2 · T8 · T9. 대칭 복사본을 **다시 적합하지 않는다.** 회전과 반사는 등거리변환이므로 계수 위의 선형(회전) / 반선형(반사) 연산으로 **정확히** 유도된다 — 근사가 아니라 항등식이다. 덤으로 스펙 §3이 지정한 T2(재샘플과 변환의 교환법칙)를 이 파일에서 못 박는다.

**Files:**
- **Modify:** `/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.ts`
  - 최상단 `@/lib/geometry` import 줄 (Task 4가 작성, Task 5는 건드리지 않음): `Symmetry` 타입 1개 추가
  - **파일 맨 끝 — Task 4 Step 15가 만든 `overlayPointCount` 정의 다음 줄부터** 약 45줄 추가. (앵커 정정: `reconstruct`·`truncate`·`overlayPointCount`는 **Task 4**가 만든다. Task 5는 그 안의 `"open"` 분기를 채울 뿐 새 함수를 파일 끝에 붙이지 않는다.)
  - `Complex`는 Task 4가 이미 `@/lib/resample`에서 가져와 있으므로 import 줄을 손대지 않는다
- **Test:** `/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.operator.test.ts` (신규, 약 250줄)
- **Create:** 없음

**Interfaces:**

Consumes
- `@/lib/geometry` (Task 2): `type Point`, `type Symmetry`, `type Closure`, `transformPoint(p, symmetry, count, copy): Point`
- `@/lib/resample` (Task 3): `type Complex`, `toComplex(p): Complex`, `fromComplex(z): Point`, `densify(points, closed): { poly, length }`, `resampleUniform(poly, length, P, closed): Point[]`
- `@/lib/fourier` (Task 4·5): `type Spectrum`, `type Term`, `type FitStats`, `fitStroke(points, closure, options?): Spectrum`, `reconstruct(spectrum, q): Point[]`, `sampleCount(arcLength): number`
- **Task 4·5에 의존하는 두 가지 계약. 깨지면 이 파일이 즉시 빨강이다:**
  1. `terms`는 **진폭 내림차순**으로 저장된다(D-C). Task 5는 `n` 오름차순 재정렬을 하지 않는다. 이 순서가 유지되어야 아래 "|c_n| 보존" 단언이 인덱스별로 짝지어진다.
  2. `reconstruct`가 `kind: "open"`에서 **q개 점**을 돌려준다(D-K, `t = j/(q−1)`). 빈 배열을 돌려주면 `wave`·`straight` 픽스처를 도는 루프가 양변 길이 0으로 **공허하게 통과**한다. Step 1의 첫 테스트가 이것만 겨냥해서 막는다.
- `Spectrum`의 `{ kind: "point"; length: number }`에서 `length`는 **호길이**다(D-E). 이 파일의 퇴화 픽스처 `{ kind: "point", length: 0.4 }`는 그 규약에 맞는 값이다.

Produces — Task 7 `analyze()`가 획별 `OperatorDesc`를 스펙트럼에 적용할 때 그대로 호출한다
```ts
applyOperator(spectrum: Spectrum, symmetry: Symmetry, count: number, copy: number): Spectrum
```
- `count`는 **회전 수**(`stroke.rotationCount`)다. 복사본 수(`copiesFor`의 결과)가 아니다(D-I). `rotate`에서만 쓰이고 `mirrorX`/`mirrorY`에서는 무시되므로 관례상 `2`를 넘긴다. Task 7의 호출 형태는 `applyOperator(spectrum, stroke.symmetry, stroke.rotationCount, copy)`다.

Task 7·8이 의존해도 되는 보증 (전부 아래 스텝에서 테스트로 고정):
- `copy === 0` 또는 `symmetry === "free"` 또는 `spectrum.kind === "point"` → **입력 객체를 그대로 반환** (동일 참조)
- `terms.length`, `stats`(P·arcLength·normS·rmsError·maxError·accuracy·capped) 전부 불변 — 등거리변환은 오차를 만들지 않는다
- `|c_n|`이 보존되므로 Task 4가 정렬해 둔 **진폭 내림차순 순서가 그대로 유지된다.** 재정렬 불필요 (실측 최대 편차 3.55e-15)
- 회전: 복사본 `k`는 `transformPoint`의 복사본 `(count − k) mod count`와 같은 그림. 궤도 전체는 집합으로 동일
- 반사: 복사본 인덱스는 `transformPoint`와 1:1로 일치 (0=항등, 1=반사)

**측정 근거** — 아래 모든 수치는 확정 결정(D-C·D-D·D-E·D-F·D-G의 클램프 `densify`·D-K)을 반영한 참조 구현을 `/private/tmp/claude-501/-Users-yoma-projects-jamcoding-jangyunu/3f4104c7-fa88-4f58-9015-533d06633e7b/scratchpad/{t6ref,t6run,t6run2,t6run3}.mjs`로 node에서 실행해 얻은 실측값이다. 네 픽스처의 적합 결과:

| 픽스처 | kind | 항 | n | L | P | 정확도 | reconstruct(120) |
|---|---|---|---|---|---|---|---|
| circle | closed | 1 | −1 | 188.4882 | 378 | 99.975% | 120점 |
| blob | closed | 5 | −1, 1, 2, −3, −4 | 162.6752 | 326 | 99.006% | 120점 |
| wave | open | 3 | 3, 6, 9 | 103.9594 | 208 | 99.151% | 120점 |
| straight | open | 0 | — | 74.4043 | 150 | 100.000% | 120점 |

---

- [ ] **Step 1: 회전·항등·불변량·T2 테스트를 먼저 쓴다 (빨강)**

`/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.operator.test.ts` 신규 작성.

```ts
// 대칭이 계수 위 연산으로 정확히 유도되는지 — 스펙 §1.7 / T2 / T8 / T9 / E9 / E10.
// 이 파일의 핵심 주장 두 개:
//  (1) applyOperator 로 만든 복사본과 transformPoint 로 만든 복사본이 같은 그림이다.
//  (2) 재샘플 전에 변환하든 후에 변환하든 같은 표본이 나온다 (스펙 §3 → T2).
// 둘 중 하나가 깨지면 화면과 식이 조용히 갈라진다.
import { describe, expect, it } from "vitest";

import { transformPoint, type Closure, type Point, type Symmetry } from "@/lib/geometry";
import { densify, fromComplex, resampleUniform, toComplex, type Complex } from "@/lib/resample";
import { applyOperator, fitStroke, reconstruct, sampleCount, type Spectrum } from "@/lib/fourier";

const TOL = 1e-12;   // 스펙 §1.9-3 대칭 연산자 항등식 허용치. 실측 최악 1.01e-13
const Q = 120;       // 재구성 표본 수. 양변이 같은 q를 쓰기만 하면 값 자체는 무관

// ---- 픽스처 --------------------------------------------------------------
// 실측: 1항 · n = −1 · L = 188.488 · P = 378 · 99.975%
const circle = (radius = 30, n = 48): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    return { x: 50 + radius * Math.cos(a), y: 50 + radius * Math.sin(a) };
  });

// 비대칭 닫힌 획. c_n 과 c_{−n} 이 둘 다 0이 아니어야 인덱스 반전 버그가 드러난다.
// 실측: 5항 · n = [−1, 1, 2, −3, −4] · L = 162.675 · 99.006%
const blob = (n = 64): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    return {
      x: 50 + 28 * Math.cos(a) + 5 * Math.cos(2 * a) + 2 * Math.sin(3 * a) - 3 * Math.sin(a),
      y: 50 + 21 * Math.sin(a) + 4 * Math.sin(2 * a) - 3 * Math.cos(3 * a) + 2 * Math.cos(a)
    };
  });

// 실측: 3항 · n = [3, 6, 9] · 99.151%
const wave = (n = 40): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: 15 + 70 * t, y: 50 + 12 * Math.sin(3 * Math.PI * t) };
  });

// 실측: 0항 · 100.000%. terms 가 빈 배열일 때 z₀·Δ 만 변환되는지 확인하는 픽스처다.
const straight = (): Point[] => [{ x: 20, y: 30 }, { x: 80, y: 74 }];

const FIXTURES: { name: string; points: Point[]; closure: Closure }[] = [
  { name: "circle", points: circle(), closure: "closed" },
  { name: "blob", points: blob(), closure: "closed" },
  { name: "wave", points: wave(), closure: "open" },
  { name: "straight", points: straight(), closure: "open" }
];

const fitAll = () => FIXTURES.map((f) => ({ ...f, spectrum: fitStroke(f.points, f.closure) }));

// ---- 헬퍼 ----------------------------------------------------------------
const maxPointError = (a: Point[], b: Point[]) => {
  expect(a.length).toBe(b.length);
  return a.reduce((worst, p, i) => Math.max(worst, Math.hypot(p.x - b[i].x, p.y - b[i].y)), 0);
};

// 집합 비교는 좌표 정렬이 아니라 최근접 이웃(하우스도르프)으로 한다.
// 대칭 점군에는 x가 거의 같고 y만 다른 점이 흔해서, 정렬 비교는 올바른 구현에서도
// 부동소수점 잡음으로 짝이 어긋난다 — 실측 가짜 오차: 원 6.0e+1, 물결 2.3e+1.
const hausdorff = (a: Point[], b: Point[]) => {
  const oneWay = (from: Point[], to: Point[]) =>
    from.reduce((worst, p) => Math.max(worst, to.reduce(
      (best, q) => Math.min(best, Math.hypot(p.x - q.x, p.y - q.y)), Number.POSITIVE_INFINITY)), 0);
  return Math.max(oneWay(a, b), oneWay(b, a));
};

// 계수 사전. 닫힘은 c₀ 와 n별 항, 열림은 z₀·Δ 와 n별 항을 모두 담는다.
// 열림의 z₀·Δ 를 빼면 straight(0항) 픽스처가 양쪽 다 빈 사전이 되어 공허하게 통과한다.
const coefficients = (spectrum: Spectrum) => {
  const map = new Map<string, Complex>();
  if (spectrum.kind === "point") return map;
  if (spectrum.kind === "closed") map.set("c0", { re: spectrum.c0.re, im: spectrum.c0.im });
  if (spectrum.kind === "open") {
    map.set("z0", { re: spectrum.z0.re, im: spectrum.z0.im });
    map.set("delta", { re: spectrum.delta.re, im: spectrum.delta.im });
  }
  for (const term of spectrum.terms) map.set(`n${term.n}`, { re: term.re, im: term.im });
  return map;
};

const maxCoefError = (a: Spectrum, b: Spectrum) => {
  const left = coefficients(a);
  const right = coefficients(b);
  let worst = 0;
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const x = left.get(key) ?? { re: 0, im: 0 };
    const y = right.get(key) ?? { re: 0, im: 0 };
    worst = Math.max(worst, Math.hypot(x.re - y.re, x.im - y.im));
  }
  return worst;
};

// 수학 좌표에서 e^(iθ)를 곱한다. z = conj(p − 중심)이라 화면으로는 −θ 회전이다.
const rotateMath = (points: Point[], theta: number): Point[] =>
  points.map((p) => {
    const z = toComplex(p);
    return fromComplex({
      re: z.re * Math.cos(theta) - z.im * Math.sin(theta),
      im: z.re * Math.sin(theta) + z.im * Math.cos(theta)
    });
  });

const orbit = (spectrum: Spectrum, symmetry: Symmetry, count: number) =>
  Array.from({ length: count }, (_, k) => reconstruct(applyOperator(spectrum, symmetry, count, k), Q)).flat();

const orbitByPoints = (spectrum: Spectrum, symmetry: Symmetry, count: number) => {
  const source = reconstruct(spectrum, Q);
  return Array.from({ length: count }, (_, k) =>
    source.map((p) => transformPoint(p, symmetry, count, k))).flat();
};

// ---- 테스트 --------------------------------------------------------------
describe("applyOperator — 항등과 불변량", () => {
  // 이 테스트가 이 파일 전체의 전제다. Task 5 가 reconstruct 의 "open" 분기를 채우지 않으면
  // 열린 픽스처가 빈 배열이 되어 아래 모든 루프가 maxPointError([], []) = 0 으로 공허 통과한다.
  it("네 픽스처가 모두 Q개 점으로 재구성된다 — 열린 획이 빈 배열이면 이 파일은 무의미하다", () => {
    for (const { name, spectrum } of fitAll()) {
      expect(spectrum.kind, name).not.toBe("point");
      const drawn = reconstruct(spectrum, Q);
      expect(drawn, name).toHaveLength(Q);
      expect(drawn.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), name).toBe(true);
    }
    // 0항 열린 획은 재구성이 정확히 현이다: t = 0 과 t = 1 이 양 끝점을 지난다.
    const line = fitStroke(straight(), "open");
    if (line.kind !== "open") throw new Error("open 이어야 한다");
    expect(line.terms).toHaveLength(0);
    const drawn = reconstruct(line, Q);
    expect(drawn[0].x).toBeCloseTo(20, 9);
    expect(drawn[0].y).toBeCloseTo(30, 9);
    expect(drawn[Q - 1].x).toBeCloseTo(80, 9);
    expect(drawn[Q - 1].y).toBeCloseTo(74, 9);
  });

  it("copy 0과 free는 입력 객체를 그대로 돌려준다", () => {
    const spectrum = fitStroke(blob(), "closed");
    expect(applyOperator(spectrum, "free", 1, 0)).toBe(spectrum);
    expect(applyOperator(spectrum, "free", 1, 1)).toBe(spectrum);
    expect(applyOperator(spectrum, "rotate", 6, 0)).toBe(spectrum);
    expect(applyOperator(spectrum, "mirrorX", 2, 0)).toBe(spectrum);
    expect(applyOperator(spectrum, "mirrorY", 2, 0)).toBe(spectrum);
  });

  it("퇴화 획은 어떤 연산자에도 그대로다 (E2 NaN 전파 차단)", () => {
    // point 의 length 는 호길이다(확정: 항상 0이 아니다). 0.4 는 커밋 문턱 1.0 미만의 실제 호길이.
    const degenerate: Spectrum = { kind: "point", length: 0.4 };
    expect(applyOperator(degenerate, "rotate", 6, 3)).toBe(degenerate);
    expect(applyOperator(degenerate, "mirrorX", 2, 1)).toBe(degenerate);
  });

  it("항 수와 stats는 연산자에 불변이다 — 등거리변환은 오차를 만들지 않는다", () => {
    const operators: [Symmetry, number, number][] = [
      ["rotate", 6, 2], ["rotate", 8, 5], ["mirrorX", 2, 1], ["mirrorY", 2, 1]
    ];
    for (const { name, spectrum } of fitAll()) {
      if (spectrum.kind === "point") throw new Error(`${name}: 퇴화 픽스처가 아니어야 한다`);
      for (const [symmetry, count, copy] of operators) {
        const moved = applyOperator(spectrum, symmetry, count, copy);
        if (moved.kind === "point") throw new Error(`${name}: kind가 바뀌면 안 된다`);
        expect(moved.kind).toBe(spectrum.kind);
        expect(moved.terms.length).toBe(spectrum.terms.length);
        expect(moved.stats).toEqual(spectrum.stats);
        // |c_n| 보존 → Task 4가 정렬한 진폭 내림차순이 그대로 유지된다. 실측 최대 편차 3.55e-15
        moved.terms.forEach((term, i) => {
          expect(Math.hypot(term.re, term.im))
            .toBeCloseTo(Math.hypot(spectrum.terms[i].re, spectrum.terms[i].im), 12);
        });
      }
    }
  });
});

describe("회전 — T8", () => {
  it("fit(수학좌표 회전) 의 계수가 applyOperator(rotate) 와 같다", () => {
    let worst = 0;
    for (const count of [3, 4, 6, 8]) {
      for (let copy = 1; copy < count; copy += 1) {
        for (const { points, closure } of FIXTURES) {
          const refit = fitStroke(rotateMath(points, (Math.PI * 2 * copy) / count), closure);
          const derived = applyOperator(fitStroke(points, closure), "rotate", count, copy);
          worst = Math.max(worst, maxCoefError(refit, derived));
        }
      }
    }
    expect(worst).toBeLessThan(TOL);   // 실측 1.01e-13 (최악: blob)
  });

  it("회전 궤도가 transformPoint 궤도와 집합으로 같다", () => {
    for (const count of [2, 3, 4, 6, 8]) {
      for (const { name, spectrum } of fitAll()) {
        expect.soft(hausdorff(orbit(spectrum, "rotate", count), orbitByPoints(spectrum, "rotate", count)),
          `${name} m=${count}`).toBeLessThan(TOL);   // 실측 최악 4.55e-14
      }
    }
  });

  it("복사본 k 는 transformPoint 의 복사본 (m−k) mod m 이다 — 켤레 좌표계의 부호 반전", () => {
    let matched = 0;
    let naive = 0;
    for (const count of [3, 4, 6, 8]) {
      for (const { spectrum } of fitAll()) {
        const source = reconstruct(spectrum, Q);
        for (let copy = 1; copy < count; copy += 1) {
          const derived = reconstruct(applyOperator(spectrum, "rotate", count, copy), Q);
          matched = Math.max(matched, maxPointError(derived,
            source.map((p) => transformPoint(p, "rotate", count, (count - copy) % count))));
          naive = Math.max(naive, maxPointError(derived,
            source.map((p) => transformPoint(p, "rotate", count, copy))));
        }
      }
    }
    expect(matched).toBeLessThan(TOL);   // 실측 4.55e-14
    // naive 는 최댓값이다. k = m/2(180°)는 자기 역원이라 그 항만 0에 가깝고, 나머지가 크게 어긋난다.
    expect(naive).toBeGreaterThan(1);    // 실측 7.68e+1
  });

  it("R^a ∘ R^b = R^(a+b)", () => {
    const spectrum = fitStroke(blob(), "closed");
    const twice = applyOperator(applyOperator(spectrum, "rotate", 6, 1), "rotate", 6, 1);
    expect(maxPointError(reconstruct(twice, Q), reconstruct(applyOperator(spectrum, "rotate", 3, 1), Q)))
      .toBeLessThan(TOL);   // 실측 1.59e-14
  });
});

describe("재샘플과 변환의 교환법칙 — T2", () => {
  // 스펙 §3: 렌더는 제어점을 변환하고 분석은 재샘플 후 변환한다. 지금은 대칭이 아핀이라
  // 두 순서가 같지만, 비아핀 대칭(나선, 스케일 그라디언트)을 넣으면 화면과 식이 조용히 갈라진다.
  // 이 테스트는 새 동작을 요구하지 않는다 — 통과가 기대값이고, 깨지는 날이 그 경고다.
  it("resample(transform(points)) 와 transform(resample(points)) 가 같은 표본을 만든다", () => {
    const pipeline = (points: Point[], closure: Closure) => {
      const closed = closure === "closed";
      const { poly, length } = densify(points, closed);
      const P = sampleCount(length);
      return { P, samples: resampleUniform(poly, length, P, closed) };
    };
    const operators: [Symmetry, number, number][] = [
      ["rotate", 3, 1], ["rotate", 4, 1], ["rotate", 6, 5], ["rotate", 8, 3],
      ["mirrorX", 2, 1], ["mirrorY", 2, 1]
    ];
    let worst = 0;
    for (const { name, points, closure } of FIXTURES) {
      const before = pipeline(points, closure);
      for (const [symmetry, count, copy] of operators) {
        const after = pipeline(points.map((p) => transformPoint(p, symmetry, count, copy)), closure);
        // 호길이가 등거리변환에 불변이므로 P 도 같아야 한다. 여기가 갈라지면 표본 수부터 다르다.
        expect(after.P, `${name} ${symmetry}`).toBe(before.P);
        worst = Math.max(worst, maxPointError(after.samples,
          before.samples.map((p) => transformPoint(p, symmetry, count, copy))));
      }
    }
    expect(worst).toBeLessThan(TOL);   // 실측 2.31e-13 (호길이 차 최대 2.84e-13)
  });
});
```

- [ ] **Step 2: 빨강 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit
```
예상 출력 (줄:열은 파일 배치에 따라 달라진다):
```
lib/fourier.operator.test.ts(10,10): error TS2305: Module '"@/lib/fourier"' has no exported member 'applyOperator'.
```

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.operator.test.ts
```
예상 출력 — 모듈 로드 자체가 실패하므로 테스트가 하나도 수집되지 않는다:
```
 FAIL  lib/fourier.operator.test.ts [ lib/fourier.operator.test.ts ]
SyntaxError: The requested module '/lib/fourier.ts' does not provide an export named 'applyOperator'

 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 3: 회전과 항등만 구현한다 (최소 구현)**

`/Users/yoma/projects/jamcoding/jangyunu/lib/fourier.ts` 최상단 import 줄을 고친다 — Task 4가 남긴 목록에 `Symmetry`만 더한다.

```ts
import type { Closure, Point, Symmetry } from "@/lib/geometry";
```

파일 맨 끝, Task 4 Step 15가 만든 `overlayPointCount` 정의 다음에 추가한다.

```ts
// ---- 대칭 연산자 (스펙 §1.7 / D10) ---------------------------------------
// 복사본을 다시 적합하지 않는다. 대칭은 등거리변환이므로 계수 위의 선형(회전)
// 또는 반선형(반사) 연산으로 정확히 유도된다 — 근사가 아니라 항등식이다.
//
// 부호 주의: z = conj(p − 중심) 이라 수학 좌표의 회전 방향이 화면과 반대다.
// 교과서 부호 ω = e^(2πi/m) 을 그대로 쓰므로 applyOperator 의 복사본 k 는
// transformPoint 의 복사본 (m − k) mod m 과 같은 그림이다. 순환군 궤도 {ω^k z} 는
// 집합으로서 동일하므로 화면에 그려지는 마법진은 이 부호 때문에 달라지지 않는다.
//
// count 는 회전 수(stroke.rotationCount)다. 복사본 수(copiesFor 의 결과)가 아니다.

const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re
});

// w·z. 회전은 지수 기저와 사인 기저 모두에서 인덱스를 건드리지 않는다.
// terms 를 그대로 map 하므로 Task 4 가 정렬해 둔 진폭 내림차순이 유지된다.
const mapLinear = (spectrum: Spectrum, w: Complex): Spectrum => {
  if (spectrum.kind === "closed") {
    return { ...spectrum, c0: cMul(w, spectrum.c0),
      terms: spectrum.terms.map((term) => ({ n: term.n, ...cMul(w, term) })) };
  }
  if (spectrum.kind === "open") {
    return { ...spectrum, z0: cMul(w, spectrum.z0), delta: cMul(w, spectrum.delta),
      terms: spectrum.terms.map((term) => ({ n: term.n, ...cMul(w, term) })) };
  }
  return spectrum;
};

export const applyOperator = (spectrum: Spectrum, symmetry: Symmetry, count: number, copy: number): Spectrum => {
  // 항등 분기는 transformPoint 의 항등 분기와 글자 그대로 같은 조건이어야 한다.
  // 여기서 갈라지면 화면과 식이 갈라진다.
  if (spectrum.kind === "point" || copy === 0 || symmetry === "free") return spectrum;
  if (symmetry === "mirrorX" || symmetry === "mirrorY") return spectrum;   // Step 7에서 채운다
  const angle = (Math.PI * 2 * copy) / count;
  return mapLinear(spectrum, { re: Math.cos(angle), im: Math.sin(angle) });
};
```

- [ ] **Step 4: 초록 확인 + 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.operator.test.ts && npx tsc --noEmit
```
예상 출력:
```
 ✓ lib/fourier.operator.test.ts (9)
   ✓ applyOperator — 항등과 불변량 (4)
   ✓ 회전 — T8 (4)
   ✓ 재샘플과 변환의 교환법칙 — T2 (1)

 Test Files  1 passed (1)
      Tests  9 passed (9)
```
`tsc`는 아무것도 출력하지 않고 종료 코드 0이다.

첫 테스트가 `expected [] to have a length of 120` 로 실패하면 Task 5의 `reconstruct` 열림 분기(D-K)가 비어 있는 것이다. 이 파일에서 우회하지 말고 Task 5로 돌아간다 — 우회하면 이 스위트가 열린 획에 대해 아무것도 검증하지 않게 된다.

```
cd /Users/yoma/projects/jamcoding/jangyunu && git add lib/fourier.ts lib/fourier.operator.test.ts && git commit -m "rotate spectra with coefficient operators"
```
예상 출력:
```
[main <해시>] rotate spectra with coefficient operators
 2 files changed, ...
```

- [ ] **Step 5: 반사 테스트를 추가한다 (빨강)**

`lib/fourier.operator.test.ts` 끝에 추가한다.

```ts
// 인덱스를 −n 으로 뒤집지 않는 틀린 반사 규칙. 실제 코드에는 넣지 않는 음성 대조군이다.
// u·conj(c) 를 인덱스 n 자리에 그대로 둔다.
const mirrorWithoutIndexFlip = (spectrum: Spectrum, u: Complex): Spectrum => {
  if (spectrum.kind !== "closed") return spectrum;
  const act = (c: Complex): Complex => ({
    re: u.re * c.re + u.im * c.im,
    im: u.im * c.re - u.re * c.im
  });
  return { ...spectrum, c0: act(spectrum.c0),
    terms: spectrum.terms.map((term) => ({ n: term.n, ...act(term) })) };
};

const MIRRORS: [Symmetry, Complex][] = [
  ["mirrorX", { re: -1, im: 0 }],   // 화면 x→100−x · M z = −z̄
  ["mirrorY", { re: 1, im: 0 }]     // 화면 y→100−y · M z =  z̄
];

describe("반사 — T9 / E9", () => {
  it("fit(반사한 점들) 의 계수가 applyOperator(mirror) 와 같다", () => {
    for (const [symmetry] of MIRRORS) {
      for (const { name, points, closure } of FIXTURES) {
        const refit = fitStroke(points.map((p) => transformPoint(p, symmetry, 2, 1)), closure);
        const derived = applyOperator(fitStroke(points, closure), symmetry, 2, 1);
        expect.soft(maxCoefError(refit, derived), `${symmetry} ${name}`).toBeLessThan(TOL);
      }
    }
  });   // 실측 최악 2.74e-14 (mirrorX blob)

  it("반사 복사본이 transformPoint 복사본과 점 단위로 같다", () => {
    for (const [symmetry] of MIRRORS) {
      for (const { name, spectrum } of fitAll()) {
        const source = reconstruct(spectrum, Q);
        for (let copy = 0; copy < 2; copy += 1) {
          expect.soft(maxPointError(reconstruct(applyOperator(spectrum, symmetry, 2, copy), Q),
            source.map((p) => transformPoint(p, symmetry, 2, copy))), `${symmetry} ${name} ${copy}`)
            .toBeLessThan(TOL);
        }
      }
    }
  });   // 실측 최악 1.42e-14

  it("원의 스펙트럼에서 인덱스가 −1 에서 +1 로 뒤집힌다", () => {
    const base = fitStroke(circle(), "closed");
    if (base.kind !== "closed") throw new Error("closed 여야 한다");
    expect(base.terms).toHaveLength(1);        // T3: 완전한 원은 정확히 1항
    expect(base.terms[0].n).toBe(-1);          // 화면 CW 로 도는 픽스처 → 수학 좌표에서 n = −1
    const mirrored = applyOperator(base, "mirrorX", 2, 1);
    if (mirrored.kind !== "closed") throw new Error("closed 여야 한다");
    expect(mirrored.terms).toHaveLength(1);
    expect(mirrored.terms[0].n).toBe(1);       // 여기가 뒤집히지 않으면 E9 버그다
    expect(mirrored.terms[0].re).toBeCloseTo(-base.terms[0].re, 9);   // 실측 편차 0
    expect(mirrored.terms[0].im).toBeCloseTo(base.terms[0].im, 9);
  });

  it("인덱스를 뒤집지 않으면 원과 비대칭 닫힌 획 둘 다에서 틀린다", () => {
    for (const [symmetry, u] of MIRRORS) {
      for (const points of [circle(), blob()]) {
        const base = fitStroke(points, "closed");
        const target = reconstruct(base, Q).map((p) => transformPoint(p, symmetry, 2, 1));
        expect.soft(maxPointError(target, reconstruct(applyOperator(base, symmetry, 2, 1), Q)))
          .toBeLessThan(TOL);                                                    // 실측 7.11e-15
        expect.soft(maxPointError(target, reconstruct(mirrorWithoutIndexFlip(base, u), Q)))
          .toBeGreaterThan(1);            // 실측 원 6.00e+1 · blob 4.74e+1
      }
    }
  });

  it("집합 비교는 이 버그를 못 잡는다 — 반사 테스트는 반드시 점 단위여야 한다", () => {
    // 틀린 규칙은 c'_n = e^(2iφ)conj(c_n) 이므로 w(t) = e^(2iφ)conj(z(−t)) = right(1−t) 다.
    // 즉 같은 곡선을 반대 방향으로 훑는다 — 어떤 집합 비교에도 걸리지 않는다.
    for (const points of [circle(), blob()]) {
      const base = fitStroke(points, "closed");
      const right = reconstruct(applyOperator(base, "mirrorX", 2, 1), Q);
      const wrong = reconstruct(mirrorWithoutIndexFlip(base, { re: -1, im: 0 }), Q);
      expect.soft(hausdorff(right, wrong)).toBeLessThan(TOL);                    // 실측 3.18e-14
      expect.soft(maxPointError(wrong, right.map((_, i) => right[(Q - i) % Q]))).toBeLessThan(TOL);
      expect.soft(maxPointError(right, wrong)).toBeGreaterThan(1);               // 실측 6.00e+1
    }
  });

  it("M ∘ M = I 이고 인덱스가 원래대로 돌아온다", () => {
    const base = fitStroke(blob(), "closed");
    if (base.kind !== "closed") throw new Error("closed 여야 한다");
    for (const [symmetry] of MIRRORS) {
      const once = applyOperator(base, symmetry, 2, 1);
      const twice = applyOperator(once, symmetry, 2, 1);
      if (twice.kind !== "closed") throw new Error("closed 여야 한다");
      expect(maxPointError(reconstruct(twice, Q), reconstruct(base, Q))).toBeLessThan(TOL);
      expect(twice.terms.map((t) => t.n)).toEqual(base.terms.map((t) => t.n));
      // 한 번만 걸면 항등이 아니어야 한다 — 반사가 미구현일 때를 잡는다
      expect(maxPointError(reconstruct(once, Q), reconstruct(base, Q))).toBeGreaterThan(1);
    }
  });   // 실측: M∘M 편차 0 · 한 번만 걸면 mirrorX 6.64e+1 · mirrorY 5.16e+1

  it("열린 획은 사인이 실수 기저라 인덱스가 뒤집히지 않는다", () => {
    const base = fitStroke(wave(), "open");
    if (base.kind !== "open") throw new Error("open 이어야 한다");
    expect(base.terms.map((t) => t.n)).toEqual([3, 6, 9]);   // 진폭 내림차순 저장(D-C)
    const mirrored = applyOperator(base, "mirrorX", 2, 1);   // b_n ↦ −conj(b_n)
    if (mirrored.kind !== "open") throw new Error("open 이어야 한다");
    expect(mirrored.terms.map((t) => t.n)).toEqual(base.terms.map((t) => t.n));
    mirrored.terms.forEach((term, i) => {
      expect(term.re).toBeCloseTo(-base.terms[i].re, 9);
      expect(term.im).toBeCloseTo(base.terms[i].im, 9);
    });
    expect(mirrored.z0.re).toBeCloseTo(-base.z0.re, 9);
    expect(mirrored.z0.im).toBeCloseTo(base.z0.im, 9);
    expect(mirrored.delta.re).toBeCloseTo(-base.delta.re, 9);
    expect(mirrored.delta.im).toBeCloseTo(base.delta.im, 9);
  });
});
```

- [ ] **Step 6: 빨강 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.operator.test.ts
```
예상 출력 — 반사 7개가 전부 실패하고 앞의 9개는 통과한다:
```
 ❯ lib/fourier.operator.test.ts (16)
   ✓ applyOperator — 항등과 불변량 (4)
   ✓ 회전 — T8 (4)
   ✓ 재샘플과 변환의 교환법칙 — T2 (1)
   ❯ 반사 — T9 / E9 (7)
     × fit(반사한 점들) 의 계수가 applyOperator(mirror) 와 같다
       → mirrorX circle: expected 29.998053611155765 to be less than 1e-12
     × 반사 복사본이 transformPoint 복사본과 점 단위로 같다
       → mirrorX circle 1: expected 59.99610722231153 to be less than 1e-12
     × 원의 스펙트럼에서 인덱스가 −1 에서 +1 로 뒤집힌다
       → expected -1 to be +1
     × 인덱스를 뒤집지 않으면 원과 비대칭 닫힌 획 둘 다에서 틀린다
     × 집합 비교는 이 버그를 못 잡는다 — 반사 테스트는 반드시 점 단위여야 한다
     × M ∘ M = I 이고 인덱스가 원래대로 돌아온다
     × 열린 획은 사인이 실수 기저라 인덱스가 뒤집히지 않는다

 Test Files  1 failed (1)
      Tests  7 failed | 9 passed (16)
```
마지막 세 개가 실패하는 이유를 확인해 둔다: 자리표시자는 항등이므로 `M∘M = I` 는 통과하지만 "한 번만 걸면 달라야 한다"가 0을 내고, 열린 획은 `−b_n` 대신 `b_n` 이 그대로 와서 `n = 6` 항(실측 re = −1.0928)에서 어긋난다. 두 단언 모두 "반사 미구현"만 겨냥한 것이다.

- [ ] **Step 7: 반선형 연산자를 구현한다**

`lib/fourier.ts` 의 `mapLinear` 바로 다음에 추가한다.

```ts
const cConj = (a: Complex): Complex => ({ re: a.re, im: -a.im });

// e^(2iφ)·conj(z). 닫힘은 지수 기저라 인덱스가 −n 으로 뒤집히고,
// 열림은 sin 이 실수 기저라 인덱스가 그대로다 (스펙 §1.5 현 분리의 부수 이득).
// 원본 항 (n, c) 는 새 스펙트럼의 −n 자리에 e^(2iφ)·conj(c) 로 들어간다 —
// c'_n = e^(2iφ)·conj(c_{−n}) 과 같은 말이고, 이렇게 쓰면 A 밖의 계수를 찾을 필요가 없다.
// |c_n| 은 보존되므로 진폭 내림차순 저장 순서도 그대로다.
//
// E10: 후보 대역이 대칭 구간 |n| ≤ K_max 이므로 n = −P/2 별칭 빈은 선택되지 않는다.
// 따라서 −n 사상이 범위 밖으로 나가는 경우가 없고 특수 케이스도 필요 없다.
const mapAntilinear = (spectrum: Spectrum, u: Complex): Spectrum => {
  if (spectrum.kind === "closed") {
    return { ...spectrum, c0: cMul(u, cConj(spectrum.c0)),
      terms: spectrum.terms.map((term) => ({ n: -term.n, ...cMul(u, cConj(term)) })) };
  }
  if (spectrum.kind === "open") {
    return { ...spectrum, z0: cMul(u, cConj(spectrum.z0)), delta: cMul(u, cConj(spectrum.delta)),
      terms: spectrum.terms.map((term) => ({ n: term.n, ...cMul(u, cConj(term)) })) };
  }
  return spectrum;
};
```

그리고 `applyOperator` 의 반사 자리표시자 한 줄
```ts
  if (symmetry === "mirrorX" || symmetry === "mirrorY") return spectrum;   // Step 7에서 채운다
```
를 두 줄로 바꾼다.
```ts
  if (symmetry === "mirrorX") return mapAntilinear(spectrum, { re: -1, im: 0 });   // M z = −z̄
  if (symmetry === "mirrorY") return mapAntilinear(spectrum, { re: 1, im: 0 });    // M z =  z̄
```

- [ ] **Step 8: 전체 초록 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/fourier.operator.test.ts
```
예상 출력:
```
 ✓ lib/fourier.operator.test.ts (16)
   ✓ applyOperator — 항등과 불변량 (4)
   ✓ 회전 — T8 (4)
   ✓ 재샘플과 변환의 교환법칙 — T2 (1)
   ✓ 반사 — T9 / E9 (7)

 Test Files  1 passed (1)
      Tests  16 passed (16)
```

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit
```
예상 출력: 아무것도 출력되지 않고 종료 코드 0.

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run
```
예상 출력: Task 1~5가 만든 파일까지 **전부 통과**하고 `Test Files` 수만 1 늘어난다. `lib/fourier.ts` 에 export 를 더했을 뿐 기존 함수는 한 줄도 바꾸지 않았으므로 앞 태스크의 테스트 개수와 결과는 변하지 않아야 한다. (`npm run build` 는 dev 서버가 쓰는 `.next` 를 건드리므로 돌리지 않는다.)

- [ ] **Step 9: 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu && git add lib/fourier.ts lib/fourier.operator.test.ts && git commit -m "mirror spectra by flipping coefficient index"
```
예상 출력:
```
[main <해시>] mirror spectra by flipping coefficient index
 2 files changed, ...
```

---

Verified every number by running the reference pipeline (Task 3 densify + Task 4/5 fourier + current metrics/polar) in the scratchpad. Here is the rewritten task.

### Task 7: lib/polar.ts 분리와 lib/analysis.ts 오케스트레이터

**Files:**
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/polar.ts`
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/analysis.ts`
- Test (create): `/Users/yoma/projects/jamcoding/jangyunu/lib/polar.test.ts`
- Test (create): `/Users/yoma/projects/jamcoding/jangyunu/lib/metrics.test.ts`
- Test (create): `/Users/yoma/projects/jamcoding/jangyunu/lib/analysis.test.ts`
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/metrics.ts` — 1~8행(헤더 주석·import·상수 3개)과 9~59행(`radialProfile`·`polarFormula`)을 헤더 2줄 + import 2줄로 교체. **`getMetrics` 본문과 반환문은 한 글자도 건드리지 않는다.**
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/page.tsx` — import 블록, `const metrics = useMemo(…)` 한 줄, 복원 effect, `endStroke` 끝의 죽은 타이머 두 줄
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/s/[d]/page.tsx` — import 블록, `getMetrics` 호출부 아래 한 줄 추가, 렌더 루프의 `pathFor` 한 곳, `share-formula` 한 곳
- 확인만: `/Users/yoma/projects/jamcoding/jangyunu/app/s/[d]/opengraph-image.tsx` — `metrics.power/grade/lines/intersections`만 읽는다(39·54·63·72행). **코드 변경 없음**이고 Step 11의 `npx tsc --noEmit`이 그것을 증명한다.

**Interfaces:**

Consumes (앞 태스크 산출물, 그대로 사용):
- `@/lib/geometry` (Task 2) — `type Stroke = { id: string; points: Point[]; symmetry: Symmetry; rotationCount: number; closure: Closure }`, `type Point`, `type Symmetry`, `type Closure`, `copiesFor(symmetry: Symmetry, count: number): number`, `curvePoints(points: Point[]): Point[]`, `transformPoint(p: Point, symmetry: Symmetry, count: number, copy: number): Point`, `pointDistance(a: Point, b: Point): number`, `pathFor(points: Point[], closed?: boolean): string`
- `@/lib/resample` (Task 3) — `classifyClosure(points: Point[]): Closure` (테스트 픽스처 생성용)
- `@/lib/fourier` (Task 4·5) — `fitStroke(points: Point[], closure: Closure, options?: FitOptions): Spectrum`, `type Spectrum`, `type FitOptions`, `type FitStats`
- `@/lib/storage` (Task 2) — `loadDraft(): Stroke[]`, `saveDraft(strokes: Stroke[]): void`
- `app/page.tsx`의 현재 상태: Task 2가 `loadDraft/saveDraft`와 `StrokeLayer`를 배선했고, Task 3이 `endStroke`에서 `closure: classifyClosure(points)`로 동결을 끝냈다(D-J). 이 태스크는 그 위에 얹는다.
- Vitest + `vitest.config.ts`의 `resolve.alias`(`@` → 프로젝트 루트, Task 1). 세 테스트 파일 모두 `@/lib/...`로 import한다. **설정을 다시 만들지 않는다.**

Produces (뒤 태스크가 의존하는 정확한 시그니처):

```ts
// lib/polar.ts
export function radialProfile(strokes: Stroke[]): number[] | null
export function polarFormula(strokes: Stroke[]): { formula: string; accuracy: number }
//   ↑ accuracy 는 존재하지만 UI 어디에서도 읽지 않는다. 읽는 곳은 이 파일의 테스트뿐이다.

// lib/metrics.ts  — 반환 shape 이 바뀌지 않는다(아래 "이 태스크가 하지 않는 것" 참조)
export type Metrics = ReturnType<typeof getMetrics>
export function getMetrics(strokes: Stroke[]): {
  lines: number; length: number; intersections: number; closed: number;
  horizontal: number; vertical: number; rotation: number;
  complexity: number; power: number; grade: string;
  formula: string; accuracy: number        // ← 아직 남아 있다. 마지막 소비처가 사라지는 Task 11에서 뗀다
}

// lib/analysis.ts
export type OperatorDesc = { kind: "rotate" | "mirrorX" | "mirrorY" | "identity"; count: number }
export type StrokeAnalysis = { stroke: Stroke; spectrum: Spectrum; operator: OperatorDesc }
export type CircleAnalysis = {
  metrics: Metrics
  strokes: StrokeAnalysis[]
  totalTerms: number
  accuracy: number | null
  worst: { index: number; accuracy: number } | null
  uniformSymmetry: { symmetry: Symmetry; count: number } | null
  silhouette: string
}
export function fitAll(strokes: Stroke[], options?: FitOptions): Spectrum[]
export function analyzeFitted(strokes: Stroke[], spectra: Spectrum[]): CircleAnalysis
export const analyze: (strokes: Stroke[], options?: FitOptions) => CircleAnalysis
```

**뒤 태스크가 반드시 알아야 할 네 가지.**

1. **`CircleAnalysis.accuracy` 는 `number | null`이다**(0~1 실수). 확정 타입표에는 `number`로 적혀 있었으나 E4가 "유효 획 0이면 0%가 아니라 —"를 요구한다. `0`은 "쟀는데 실패"로 읽히고 `0/0`은 NaN이다. **이 값을 문자열로 바꾸는 함수는 앱 전체에서 `lib/formatting.ts`의 `formatAccuracy(accuracy: number | null): string` 하나뿐이다**(소수점 한 자리, 99.9% 클램프, `null → "—"`). 이 태스크는 정확도 문자열을 만들지 않는다 — `page.tsx`에 `accuracyLabel` 같은 인라인 포맷터를 두지 않는다.
2. **`fitAll`(1단)과 `analyzeFitted`(2단)를 함께 내보낸다.** `analyze = analyzeFitted(s, fitAll(s, options))`이므로 서버 컴포넌트·테스트는 `analyze` 하나만 쓰면 되지만, 스펙 §5.3의 2단 분리를 `page.tsx`에서 실제로 얻으려면 경계가 노출되어야 한다. Step 9가 `page.tsx`에 useMemo 두 개를 그 경계에 붙인다. **뒤 태스크(특히 Task 9)는 이 두 메모를 `analyze` 한 개로 되돌리지 않는다** — 되돌리면 항 수 슬라이더를 움직일 때 변환이 다시 도는 것을 막을 수 없다.
3. **`count`는 전부 "복사본 수"다.** `OperatorDesc.count`와 `uniformSymmetry.count`는 둘 다 `copiesFor(symmetry, rotationCount)`의 결과다 — `rotate 6 → 6`, `mirrorX/mirrorY → 2`(rotationCount와 무관), `free → 1`. `formatOperator(symmetry, rotationCount)`의 두 번째 인자는 **회전 수**이고 회전에서만 두 값이 우연히 같다. `formatStructure`는 `copiesFor`를 다시 적용하지 말고 `uniform.count - 1`을 `⋃(k=0..N)`의 N으로 쓴다.
4. **`worst.index`는 `analysis.strokes` 배열의 0-based 인덱스다.** 화면의 "획 03" 표기는 formatting이 +1 한다. 유효 획이 하나뿐이면 `worst`는 `null`이다(전체 정확도와 같은 값을 두 번 적지 않는다).

**측정 근거.** 아래 모든 기대값은 scratchpad(`/private/tmp/claude-501/-Users-yoma-projects-jamcoding-jangyunu/3f4104c7-fa88-4f58-9015-533d06633e7b/scratchpad/{t7ref,t7check,t7perf}.mjs`)에서 현행 `geometry`/`metrics`와 Task 3~5의 확정 코드를 그대로 옮겨 node로 실행해 얻었다.

```
closure     circle36 → curveL=183.2458 gap=5.2293 limit=5.4974 → "closed"
            line → "open"   dot → "point"
fitStroke   원(36점) → kind=closed, 항=1, n=[-1], |c₁|=29.99564, P=378, L=188.4782,
                      S=29.99565, rms=1.539e-2, maxError=1.033e-1, acc=0.999486863
            직선 → kind=open, 항=0, rms=0, acc=1 (정확히)
            점군 → { kind:"point", length:0 }
analyze     원+직선 accuracy=0.9996107698039299 = (188.4782·0.9994869 + 60·1)/248.4782  ✓ 호길이 가중
            퇴화 획 추가 → accuracy·totalTerms·worst 전부 동일 (가중치 0)
            rotate×8 로 바꿔도 accuracy 차이 = 0 (복사본 비가중)
            worst = { index:0, accuracy:0.9994868625969441 }, 획 1개면 null
            fitAll([a,b]) 뒤 fitAll([b,a]) → 스펙트럼 객체 참조 동일 (WeakMap)
radialProfile  원 180칸 최대 편차 5.6424e-2 → 테스트 허용치 0.1
polarFormula   [] → "r(θ) = —" / 원 → "r(θ) = 30.0" / 원+직선 → 4항 문자열(Step 1에 그대로)
```

**원이 1항으로 끝나는 이유는 D-F의 `absFloor` 조건이다.** 36점 원의 그리디 정지 시점에서 `maxError = 0.1033`, `3·rmsError = 0.0462`이므로 `maxError > 3·rmsError`는 참이다. `maxError > ABS_FLOOR(0.15)`가 함께 걸려 있어야 국소 꺾임 보정이 발동하지 않는다. 이 조건이 빠지면 원이 2항이 되어 아래 `totalTerms === 1` 단언이 깨진다.

---

- [ ] **Step 1: lib/polar.test.ts 와 lib/metrics.test.ts 를 먼저 쓴다 — 이관이 글자 그대로였음을 증명하는 두 장치**

`lib/polar.ts`는 아직 없다. 이 두 파일이 통과하면 (a) `radialProfile`/`polarFormula`가 옮겨지는 동안 한 글자도 바뀌지 않았고, (b) `metrics.ts`에 두 번째 사본이 남지 않았으며, (c) 위력·등급이 움직이지 않았다는 뜻이다. 기대 문자열과 지표 값은 전부 현행 코드를 node로 실행해 얻었다.

`/Users/yoma/projects/jamcoding/jangyunu/lib/polar.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest";

import type { Point, Stroke, Symmetry } from "@/lib/geometry";
import { polarFormula, radialProfile } from "@/lib/polar";

// polar 는 closure 를 보지 않는다. 픽스처에서는 타입을 채우는 용도로만 둔다.
const stroke = (points: Point[], symmetry: Symmetry = "free", rotationCount = 6): Stroke =>
  ({ id: "fixture", points, symmetry, rotationCount, closure: "open" });

const CIRCLE: Point[] = Array.from({ length: 36 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 36;
  return { x: 50 + 30 * Math.cos(angle), y: 50 + 30 * Math.sin(angle) };
});
const LINE: Point[] = [{ x: 50, y: 80 }, { x: 50, y: 50 }, { x: 50, y: 20 }];

describe("radialProfile", () => {
  it("획이 하나도 없으면 null", () => {
    expect(radialProfile([])).toBeNull();
  });

  it("반지름 30 원은 180칸 전부 30 근처", () => {
    const profile = radialProfile([stroke(CIRCLE)]);
    expect(profile).not.toBeNull();
    expect(profile!.length).toBe(180);
    // 실측 최대 편차 5.6424e-2
    expect(Math.max(...profile!.map((radius) => Math.abs(radius - 30)))).toBeLessThan(0.1);
  });
});

describe("polarFormula", () => {
  it("획이 없으면 빈 식", () => {
    expect(polarFormula([])).toEqual({ formula: "r(θ) = —", accuracy: 0 });
  });

  it("원은 상수항만 남는다", () => {
    expect(polarFormula([stroke(CIRCLE)])).toEqual({ formula: "r(θ) = 30.0", accuracy: 100 });
  });

  it("이관 전 출력 문자열을 글자 그대로 유지한다", () => {
    expect(polarFormula([stroke(CIRCLE), stroke(LINE)]).formula).toBe(
      "r(θ) = 29.7 + 0.6cos(4θ + 3.05) + 0.6cos(8θ + 2.96) + 0.6cos(12θ + 2.88) + 0.5cos(16θ + 2.80)"
    );
  });
});
```

`/Users/yoma/projects/jamcoding/jangyunu/lib/metrics.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest";

import type { Point, Stroke, Symmetry } from "@/lib/geometry";
import { getMetrics } from "@/lib/metrics";
import { polarFormula } from "@/lib/polar";

const stroke = (points: Point[], symmetry: Symmetry = "free", rotationCount = 6): Stroke =>
  ({ id: "fixture", points, symmetry, rotationCount, closure: "open" });

const CIRCLE: Point[] = Array.from({ length: 36 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 36;
  return { x: 50 + 30 * Math.cos(angle), y: 50 + 30 * Math.sin(angle) };
});
const LINE: Point[] = [{ x: 50, y: 80 }, { x: 50, y: 50 }, { x: 50, y: 20 }];

const CASES: Stroke[][] = [
  [],
  [stroke(CIRCLE)],
  [stroke(CIRCLE, "rotate", 6)],
  [stroke(CIRCLE), stroke(LINE)]
];

describe("getMetrics", () => {
  it("극좌표식을 lib/polar 에 위임한다 — 이관 중 두 번째 사본이 남지 않았다", () => {
    for (const list of CASES) {
      const metrics = getMetrics(list);
      const polar = polarFormula(list);
      expect(metrics.formula).toBe(polar.formula);
      expect(metrics.accuracy).toBe(polar.accuracy);
    }
  });

  // E8: 분석용 닫힘 임계(classifyClosure)가 게임용 임계의 진부분집합이라는 사실의 반대편 증거다.
  // 아래 네 줄이 움직이면 등급 컷(60/150/260)이 조용히 이동했다는 뜻이다.
  // toMatchObject 를 쓰는 이유: Task 11 이 formula/accuracy 두 필드를 뗄 때 이 스위트를 한 줄도 고칠 필요가 없다.
  it("닫힘 판정과 위력·등급이 이번 변경으로 움직이지 않는다", () => {
    expect(getMetrics([])).toMatchObject({
      lines: 0, length: 0, intersections: 0, closed: 0,
      horizontal: 0, vertical: 0, rotation: 1, complexity: 0, power: 0, grade: "초급"
    });
    expect(getMetrics([stroke(CIRCLE)])).toMatchObject({
      lines: 1, length: 183, intersections: 2, closed: 1,
      horizontal: 12, vertical: 11, rotation: 1, complexity: 25, power: 61, grade: "중급"
    });
    expect(getMetrics([stroke(CIRCLE, "rotate", 6)])).toMatchObject({
      lines: 1, length: 183, intersections: 10, closed: 1,
      horizontal: 12, vertical: 11, rotation: 6, complexity: 41, power: 172, grade: "고급"
    });
    expect(getMetrics([stroke(CIRCLE), stroke(LINE)])).toMatchObject({
      lines: 2, length: 243, intersections: 3, closed: 1,
      horizontal: 15, vertical: 14, rotation: 1, complexity: 36, power: 87, grade: "중급"
    });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/polar.test.ts lib/metrics.test.ts
```

기대 출력 — 두 파일 모두 모듈 해석 단계에서 죽으므로 개별 테스트가 아니라 파일 두 개가 실패한다:

```
 FAIL  lib/metrics.test.ts [ lib/metrics.test.ts ]
 FAIL  lib/polar.test.ts [ lib/polar.test.ts ]
Error: Cannot find package '@/lib/polar' imported from /Users/yoma/projects/jamcoding/jangyunu/lib/polar.test.ts

 Test Files  2 failed (2)
      Tests  no tests
```

판정 기준은 `Test Files 2 failed` 한 줄이다. 오류가 `'@/lib/polar'`가 아니라 `'@/lib/geometry'`를 가리키면 파일이 없는 게 아니라 Task 1의 `vitest.config.ts` 별칭이 빠진 것이다 — 상대 경로로 우회하지 말고 Task 1로 돌아간다.

- [ ] **Step 3: lib/polar.ts 를 만들고 metrics.ts 에서 잘라낸다**

`/Users/yoma/projects/jamcoding/jangyunu/lib/polar.ts` 생성. 본문은 현행 `lib/metrics.ts` 9~59행을 **그대로** 옮기고 `radialProfile`에만 `export`를 붙인다:

```ts
// 마법진 전체의 외곽 실루엣 r(θ). 획별 푸리에는 획을 아무리 정확히 적어도
// "이 마법진이 육각형에 가깝다"는 전역 진술을 못 한다. 그 자리를 이 50줄이 지킨다.
//
// polarFormula 는 accuracy 도 함께 돌려주지만 그 숫자는 UI 어디에도 노출하지 않는다.
// 앱 전체에서 사용자에게 보이는 정확도는 lib/fourier 쪽 하나뿐이다 — 푸터가 87%,
// 모달이 99%면 사용자는 어느 쪽이 거짓말인지 묻게 되고, 정답인 "둘이 다른 것을 잰다"를
// 화면으로 설명할 방법이 없다. r(θ) 는 "외곽 실루엣 근사"로 재정의됐고 그 81~90%는
// 결함이 아니라 이 표현의 정의역이다.

import { copiesFor, curvePoints, transformPoint, type Stroke } from "@/lib/geometry";

const ANGLE_BINS = 180;
const MAX_HARMONIC = 24;
const MAX_TERMS = 4;

// 캔버스 중심을 원점 (0, 0)으로 옮기고 y축을 수학 좌표계 방향으로 뒤집은 뒤, 각도 구간별 평균 반지름을 구한다.
export function radialProfile(strokes: Stroke[]) {
  const sums = new Array<number>(ANGLE_BINS).fill(0);
  const hits = new Array<number>(ANGLE_BINS).fill(0);
  strokes.forEach((stroke) => {
    const shaped = curvePoints(stroke.points);
    for (let copy = 0; copy < copiesFor(stroke.symmetry, stroke.rotationCount); copy += 1) {
      shaped.forEach((point) => {
        const placed = transformPoint(point, stroke.symmetry, stroke.rotationCount, copy);
        const x = placed.x - 50; const y = 50 - placed.y;
        const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
        const bin = Math.min(ANGLE_BINS - 1, Math.floor((angle / (Math.PI * 2)) * ANGLE_BINS));
        sums[bin] += Math.hypot(x, y); hits[bin] += 1;
      });
    }
  });
  if (!hits.some((hit) => hit > 0)) return null;
  const raw = sums.map((sum, bin) => hits[bin] ? sum / hits[bin] : NaN);
  return raw.map((value, bin) => {
    if (!Number.isNaN(value)) return value;
    let back = 1; let forward = 1;
    while (Number.isNaN(raw[(bin - back + ANGLE_BINS) % ANGLE_BINS])) back += 1;
    while (Number.isNaN(raw[(bin + forward) % ANGLE_BINS])) forward += 1;
    const before = raw[(bin - back + ANGLE_BINS) % ANGLE_BINS];
    const after = raw[(bin + forward) % ANGLE_BINS];
    return (before * forward + after * back) / (back + forward);
  });
}

// r(θ)를 푸리에 급수로 전개해 진폭이 큰 항만 남긴다.
export function polarFormula(strokes: Stroke[]) {
  const profile = radialProfile(strokes);
  if (!profile) return { formula: "r(θ) = —", accuracy: 0 };
  const mean = profile.reduce((sum, value) => sum + value, 0) / ANGLE_BINS;
  const harmonics = [];
  for (let k = 1; k <= MAX_HARMONIC; k += 1) {
    let cosine = 0; let sine = 0;
    profile.forEach((value, bin) => {
      const angle = (Math.PI * 2 * bin) / ANGLE_BINS;
      cosine += value * Math.cos(k * angle); sine += value * Math.sin(k * angle);
    });
    harmonics.push({ k, amplitude: Math.hypot(cosine, sine) * (2 / ANGLE_BINS), phase: Math.atan2(sine, cosine) });
  }
  const terms = harmonics.filter((harmonic) => harmonic.amplitude >= 0.05)
    .sort((a, b) => b.amplitude - a.amplitude).slice(0, MAX_TERMS).sort((a, b) => a.k - b.k);
  const approximate = (angle: number) => mean + terms.reduce((sum, term) => sum + term.amplitude * Math.cos(term.k * angle - term.phase), 0);
  const error = profile.reduce((sum, value, bin) => sum + Math.abs(value - approximate((Math.PI * 2 * bin) / ANGLE_BINS)), 0) / ANGLE_BINS;
  const accuracy = mean > 0 ? Math.max(0, Math.min(100, Math.round((1 - error / mean) * 100))) : 0;
  const text = terms.map((term) => `${term.amplitude.toFixed(1)}cos(${term.k}θ ${term.phase >= 0 ? "−" : "+"} ${Math.abs(term.phase).toFixed(2)})`).join(" + ");
  return { formula: `r(θ) = ${mean.toFixed(1)}${terms.length ? ` + ${text}` : ""}`, accuracy };
}
```

이어서 `/Users/yoma/projects/jamcoding/jangyunu/lib/metrics.ts`의 1~8행(헤더 주석·import·세 상수)과 9~59행(`radialProfile`·`polarFormula` 전체)을 다음 네 줄로 교체한다:

```ts
// 마법진의 위력 지표. 공유 링크로 받은 마법진도 같은 값을 내도록 순수 함수로 둔다.

import { copiesFor, curvePoints, pointDistance, type Stroke } from "@/lib/geometry";
import { polarFormula } from "@/lib/polar";
```

`transformPoint`는 `radialProfile`만 쓰던 것이므로 import에서 빠진다. 파일의 나머지(`export type Metrics`와 `getMetrics` 전체, 마지막 두 줄의 `const { formula, accuracy } = polarFormula(strokes);`와 반환문 포함)는 **그대로 둔다.** `if (drawn > 18 && pointDistance(shaped[0], shaped[shaped.length - 1]) < 8)`도 한 글자도 건드리지 않는다 — 분석용 닫힘 임계(`classifyClosure`)가 이것의 진부분집합이라는 사실이 게임 밸런스 불변의 근거다(E8).

- [ ] **Step 4: 통과를 확인하고 커밋한다**

```bash
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/polar.test.ts lib/metrics.test.ts && npx tsc --noEmit
```

기대 출력:

```
 ✓ lib/metrics.test.ts (2 tests)
 ✓ lib/polar.test.ts (5 tests)

 Test Files  2 passed (2)
      Tests  7 passed (7)
```

`tsc`는 아무것도 출력하지 않고 종료 코드 0이다. 앱 코드는 아직 `metrics.formula`/`metrics.accuracy`를 읽고 있고 그 두 필드는 그대로 살아 있다.

```bash
git add lib/polar.ts lib/polar.test.ts lib/metrics.ts lib/metrics.test.ts
git commit -m "move polar profile into lib/polar"
```

- [ ] **Step 5: lib/analysis.test.ts 를 쓴다**

집계 규칙 다섯 개(호길이 가중, 대칭 복사본 비가중, 퇴화 획 가중치 0, worst, uniformSymmetry)와 WeakMap 캐시, 2단 경계를 못 박는다. 정확도 **절대값은 하드코딩하지 않는다** — 그 숫자는 resample/fourier 구현 세부에 딸려 있어 이 파일이 잘못된 이유로 깨진다. 대신 "보고된 전체 정확도가 획별 stats로부터 재계산한 가중평균과 같다"는 내부 정합성을 검사한다.

`/Users/yoma/projects/jamcoding/jangyunu/lib/analysis.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest";

import { analyze, analyzeFitted, fitAll } from "@/lib/analysis";
import type { Point, Stroke, Symmetry } from "@/lib/geometry";
import { classifyClosure } from "@/lib/resample";

let seq = 0;
const stroke = (points: Point[], symmetry: Symmetry = "free", rotationCount = 6): Stroke =>
  ({ id: `fixture-${seq += 1}`, points, symmetry, rotationCount, closure: classifyClosure(points) });

// 반지름 30, 제어점 36개. curvePoints 길이 183.2458, 끝점 간격 5.2293 ≤ min(8, 0.03·183.2458) = 5.4974
// 이므로 closed 로 분류된다. 적합 결과는 1항(n = −1, |c₁| = 29.99564, 정확도 0.9994869)이고,
// 1항에 머무는 근거는 국소 꺾임 보정의 absFloor 조건이다: maxError 0.1033 < ABS_FLOOR 0.15.
const CIRCLE: Point[] = Array.from({ length: 36 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 36;
  return { x: 50 + 30 * Math.cos(angle), y: 50 + 30 * Math.sin(angle) };
});
const LINE: Point[] = [{ x: 50, y: 80 }, { x: 50, y: 50 }, { x: 50, y: 20 }];
const DOT: Point[] = [{ x: 30, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 30 }];

describe("analyze", () => {
  it("획이 없으면 집계 자체를 건너뛰고 정확도는 0이 아니라 null (E4)", () => {
    const result = analyze([]);
    expect(result.strokes).toEqual([]);
    expect(result.totalTerms).toBe(0);
    expect(result.accuracy).toBeNull();
    expect(result.worst).toBeNull();
    expect(result.uniformSymmetry).toBeNull();
    expect(result.silhouette).toBe("r(θ) = —");
    expect(result.metrics.power).toBe(0);
  });

  it("원 한 획은 1항 · 획이 하나면 worst 는 null", () => {
    const result = analyze([stroke(CIRCLE)]);
    expect(result.strokes[0].spectrum.kind).toBe("closed");
    expect(result.strokes[0].operator).toEqual({ kind: "identity", count: 1 });
    expect(result.totalTerms).toBe(1);
    expect(result.accuracy).toBeGreaterThan(0.999);   // 실측 0.9994868625969441
    expect(result.worst).toBeNull();
    expect(result.uniformSymmetry).toEqual({ symmetry: "free", count: 1 });
  });

  it("직선 한 획은 0항 · 정확도 정확히 1", () => {
    const result = analyze([stroke(LINE)]);
    expect(result.strokes[0].spectrum.kind).toBe("open");
    expect(result.totalTerms).toBe(0);
    expect(result.accuracy).toBe(1);
  });

  it("전체 정확도는 획별 stats 의 호길이 가중 평균이다", () => {
    const list = [stroke(CIRCLE), stroke(LINE)];
    const result = analyze(list);
    let weight = 0; let weighted = 0;
    result.strokes.forEach((item) => {
      if (item.spectrum.kind === "point") return;
      weight += item.spectrum.stats.arcLength;
      weighted += item.spectrum.stats.arcLength * item.spectrum.stats.accuracy;
    });
    // 실측 0.9996107698039299 = (188.4782·0.9994869 + 60·1)/248.4782
    expect(result.accuracy).toBeCloseTo(weighted / weight, 12);
    expect(result.totalTerms).toBe(1);
    expect(result.worst).not.toBeNull();
    expect(result.worst!.index).toBe(0);
    expect(result.worst!.accuracy).toBeLessThan(result.accuracy!);
  });

  it("퇴화 획은 호길이 0이라 가중치가 자동으로 0이 된다 (E2)", () => {
    const circle = stroke(CIRCLE); const line = stroke(LINE);
    const withDot = analyze([circle, line, stroke(DOT)]);
    const without = analyze([circle, line]);
    expect(withDot.strokes).toHaveLength(3);
    const degenerate = withDot.strokes[2].spectrum;
    // point 의 length 는 "호길이"다. 이 픽스처는 세 점이 같은 자리라 호길이가 0인 것이지,
    // point 가 항상 0을 뜻하는 것이 아니다 — kind 와 length 를 따로 단언한다.
    expect(degenerate.kind).toBe("point");
    if (degenerate.kind === "point") expect(degenerate.length).toBe(0);
    expect(withDot.accuracy).toBe(without.accuracy);
    expect(withDot.totalTerms).toBe(without.totalTerms);
    expect(withDot.worst).toEqual(without.worst);
  });

  it("대칭 복사본 수를 가중치에 곱하지 않는다 — 등거리변환이라 추가 오차가 0이다", () => {
    const plain = analyze([stroke(CIRCLE), stroke(LINE)]);
    const copied = analyze([stroke(CIRCLE, "rotate", 8), stroke(LINE, "rotate", 8)]);
    expect(copied.accuracy).toBe(plain.accuracy);
    // operator.count 는 회전 수가 아니라 복사본 수다. 반사는 rotationCount 와 무관하게 2다.
    expect(copied.strokes[0].operator).toEqual({ kind: "rotate", count: 8 });
    expect(analyze([stroke(LINE, "mirrorX", 6)]).strokes[0].operator).toEqual({ kind: "mirrorX", count: 2 });
  });

  it("uniformSymmetry 는 전 획이 같을 때만 값을 갖는다", () => {
    expect(analyze([stroke(CIRCLE, "rotate", 6), stroke(LINE, "mirrorX")]).uniformSymmetry).toBeNull();
    expect(analyze([stroke(CIRCLE, "rotate", 6), stroke(LINE, "rotate", 8)]).uniformSymmetry).toBeNull();
    // 반사에서 rotationCount 는 복사본 수에 관여하지 않으므로 달라도 같은 연산자다.
    expect(analyze([stroke(CIRCLE, "mirrorX", 6), stroke(LINE, "mirrorX", 8)]).uniformSymmetry)
      .toEqual({ symmetry: "mirrorX", count: 2 });
  });

  it("WeakMap 캐시는 undo/redo 로 배열만 바뀌어도 같은 스펙트럼 객체를 준다", () => {
    const circle = stroke(CIRCLE); const line = stroke(LINE);
    const first = fitAll([circle, line]);
    const swapped = fitAll([line, circle]);
    expect(swapped[0]).toBe(first[1]);
    expect(swapped[1]).toBe(first[0]);
    // options 를 넘긴 호출은 캐시를 우회한다. 옵션을 키에 섞으면 "참조 == 기하" 등식이 깨진다.
    expect(fitAll([circle], { maxTerms: 1 })[0]).not.toBe(first[0]);
  });

  it("analyzeFitted 는 이미 적합된 스펙트럼을 그대로 쓴다 — page.tsx 의 2단 경계", () => {
    const list = [stroke(CIRCLE), stroke(LINE)];
    expect(analyzeFitted(list, fitAll(list))).toEqual(analyze(list));
  });
});
```

- [ ] **Step 6: 실패를 확인한다**

```bash
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/analysis.test.ts
```

기대 출력:

```
 FAIL  lib/analysis.test.ts [ lib/analysis.test.ts ]
Error: Cannot find package '@/lib/analysis' imported from /Users/yoma/projects/jamcoding/jangyunu/lib/analysis.test.ts

 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 7: lib/analysis.ts 를 구현한다**

`/Users/yoma/projects/jamcoding/jangyunu/lib/analysis.ts` 생성:

```ts
// 획별 스펙트럼을 마법진 하나의 진술로 묶는다. 수치는 여기서 계산하고 문자열 조립은 lib/formatting 이 한다.

import { fitStroke, type FitOptions, type Spectrum } from "@/lib/fourier";
import { copiesFor, type Stroke, type Symmetry } from "@/lib/geometry";
import { getMetrics, type Metrics } from "@/lib/metrics";
import { polarFormula } from "@/lib/polar";

// count 는 전부 "복사본 수"다: rotate 6 → 6, mirrorX/mirrorY → 2, free → 1.
// formatOperator 의 두 번째 인자는 "회전 수"이므로 두 값을 섞지 말 것(회전에서만 우연히 같다).
export type OperatorDesc = { kind: "rotate" | "mirrorX" | "mirrorY" | "identity"; count: number };
export type StrokeAnalysis = { stroke: Stroke; spectrum: Spectrum; operator: OperatorDesc };
export type CircleAnalysis = {
  metrics: Metrics;
  strokes: StrokeAnalysis[];
  totalTerms: number;
  // 유효 획이 하나도 없으면 null. 0 은 "쟀는데 실패했다"로 읽히고 0/0 은 NaN 이다 (E4).
  accuracy: number | null;
  // 가중 평균이 숨기는 최악 획. 유효 획이 하나뿐이면 전체와 같은 값이므로 null.
  worst: { index: number; accuracy: number } | null;
  uniformSymmetry: { symmetry: Symmetry; count: number } | null;
  silhouette: string;
};

// 획은 endStroke 에서 한 번 만들어진 뒤 변형되지 않고, undo/redo 는 같은 객체 참조를 배열 사이에서
// 옮길 뿐이다. 그래서 객체 아이덴티티가 곧 기하 아이덴티티다 — 축출 로직이 필요 없고, 지우개로
// 획이 사라지면 GC 가 캐시까지 회수한다. id 를 키로 쓰면 서로 다른 기하가 같은 키를 갖는 사고가
// 가능하고 그때 증상은 "틀린 식이 표시됨"이라 발견이 늦다.
const spectrumCache = new WeakMap<Stroke, Spectrum>();

export function fitAll(strokes: Stroke[], options?: FitOptions): Spectrum[] {
  // options 를 명시한 호출은 테스트·실험용이다. 옵션을 캐시 키에 섞으면 위의 등식이 깨진다.
  if (options) return strokes.map((stroke) => fitStroke(stroke.points, stroke.closure, options));
  return strokes.map((stroke) => {
    const cached = spectrumCache.get(stroke);
    if (cached) return cached;
    const spectrum = fitStroke(stroke.points, stroke.closure);
    spectrumCache.set(stroke, spectrum);
    return spectrum;
  });
}

const operatorOf = (stroke: Stroke): OperatorDesc => ({
  kind: stroke.symmetry === "free" ? "identity" : stroke.symmetry,
  count: copiesFor(stroke.symmetry, stroke.rotationCount)
});

// 회전 수가 다르면 다른 연산자다. 반사는 rotationCount 가 복사본 수에 관여하지 않으므로 무시한다.
const uniformSymmetryOf = (strokes: Stroke[]) => {
  const first = strokes[0];
  if (!first) return null;
  const same = strokes.every((stroke) => stroke.symmetry === first.symmetry
    && (stroke.symmetry !== "rotate" || stroke.rotationCount === first.rotationCount));
  return same ? { symmetry: first.symmetry, count: copiesFor(first.symmetry, first.rotationCount) } : null;
};

// 1단(fitAll)과 2단(집계)을 따로 부를 수 있게 열어 둔다. page.tsx 의 useMemo 두 개가 이 경계에 붙는다.
export function analyzeFitted(strokes: Stroke[], spectra: Spectrum[]): CircleAnalysis {
  const list: StrokeAnalysis[] = strokes.map((stroke, index) => ({
    stroke, spectrum: spectra[index], operator: operatorOf(stroke)
  }));

  // 퇴화 획은 호길이가 0이라 가중치가 저절로 0이 된다. 여기서 한 번만 좁혀 두면 아래는 분기가 없다.
  const valid: { index: number; length: number; accuracy: number; terms: number }[] = [];
  list.forEach((item, index) => {
    if (item.spectrum.kind === "point") return;
    const { arcLength, accuracy } = item.spectrum.stats;
    if (!(arcLength > 0)) return;
    valid.push({ index, length: arcLength, accuracy, terms: item.spectrum.terms.length });
  });

  let totalTerms = 0;
  let accuracy: number | null = null;
  let worst: { index: number; accuracy: number } | null = null;

  // E4: 유효 획이 없으면 집계를 아예 돌리지 않는다.
  if (valid.length) {
    let weight = 0;
    let weighted = 0;
    valid.forEach((entry) => {
      weight += entry.length;
      weighted += entry.length * entry.accuracy;
      totalTerms += entry.terms;
    });
    // 대칭 복사본 수를 곱하지 않는다. 복사는 등거리변환이라 추가 오차가 정확히 0이다.
    accuracy = weighted / weight;
    if (valid.length > 1) {
      const lowest = valid.reduce((low, entry) => entry.accuracy < low.accuracy ? entry : low);
      worst = { index: lowest.index, accuracy: lowest.accuracy };
    }
  }

  return {
    metrics: getMetrics(strokes),
    strokes: list,
    totalTerms,
    accuracy,
    worst,
    uniformSymmetry: uniformSymmetryOf(strokes),
    // 실루엣은 문자열만 가져온다. polarFormula.accuracy 는 버린다 — 화면의 정확도는 푸리에 것 하나뿐이다.
    silhouette: polarFormula(strokes).formula
  };
}

export const analyze = (strokes: Stroke[], options?: FitOptions): CircleAnalysis =>
  analyzeFitted(strokes, fitAll(strokes, options));
```

- [ ] **Step 8: 통과를 확인하고 커밋한다**

```bash
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/analysis.test.ts && npx tsc --noEmit
```

기대 출력:

```
 ✓ lib/analysis.test.ts (9 tests)

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

`tsc`는 무출력·종료 코드 0.

```bash
git add lib/analysis.ts lib/analysis.test.ts
git commit -m "add circle analysis orchestrator"
```

- [ ] **Step 9: app/page.tsx 의 metrics 소비처를 analysis 로 옮긴다**

Task 1~3이 줄을 밀었으므로 줄 번호가 아니라 아래 앵커 문자열로 찾는다. **푸터(`.stage-footer`)·카드 뒷면(`<dt>극좌표식</dt>`)·`copyFormula`는 한 글자도 건드리지 않는다** — 셋 다 `metrics.formula`/`metrics.accuracy`를 계속 읽고 그 두 필드는 아직 살아 있다. 푸터 문안은 Task 9가, 카드 뒷면은 Task 11이 한 번에 만든다. 여기서 임시 문안을 써 두면 두 태스크가 그것을 통째로 버리게 되고, 그사이 정확도 표기가 앱에 두 벌 존재한다.

**(a) import 교체.** `import { getMetrics } from "@/lib/metrics";` 한 줄을 지우고 맨 위에 analysis 한 줄을 넣는다(경로 알파벳 순서). 교체 후 import 블록:

```tsx
import { analyzeFitted, fitAll, type CircleAnalysis } from "@/lib/analysis";
import { abilityOf, ATTRIBUTES, ATTRIBUTE_ORDER, gradientFrom, toneOf, type Attribute } from "@/lib/attributes";
import { newId, pointDistance, simplify, SIMPLIFY_TOLERANCE, type Stroke, type Symmetry } from "@/lib/geometry";
import { classifyClosure } from "@/lib/resample";
import { encodeShare } from "@/lib/share";
import { loadDraft, saveDraft } from "@/lib/storage";
import StrokeLayer from "@/app/_components/StrokeLayer";
```

(`@/lib/geometry`와 `@/lib/resample` 줄은 Task 2·3이 만든 그대로 둔다. `getMetrics`만 빠진다.)

**(b) 지표 메모 교체.** 아래 한 줄을

```tsx
  const metrics = useMemo(() => getMetrics(strokes), [strokes]);
```

세 줄로 바꾼다.

```tsx
  // 1단: 변환. 획 배열이 바뀔 때만 돈다. WeakMap 이 이미 적합된 획을 건너뛰므로
  // 커밋당 실비용은 새로 그린 획 1개의 적합이다.
  const spectra = useMemo(() => fitAll(strokes), [strokes]);
  // 2단: 집계. 활성 획은 여기 들어오지 않는다 — displayStrokes(렌더용)와 strokes(분석용)를
  // 나눠 두는 진짜 이유가 이 메모 경계다. 그리는 중에 계수가 초당 60회 튀지 않는다.
  const analysis: CircleAnalysis = useMemo(() => analyzeFitted(strokes, spectra), [strokes, spectra]);
  const metrics = analysis.metrics;
```

`metrics`를 지역 상수로 남기므로 `ability`·`power` 패널·`saveCard`·`shareCircle`·푸터·카드 뒷면은 **한 글자도 바뀌지 않는다.** `saveCard`가 `metrics`를 통째로 직렬화하는 것도 shape 이 그대로라 무변경이다(`version: 2`는 이미 붙어 있다 — Q6).

**(c) 복원 effect 를 유휴 시간으로 미룬다.** Task 2가 만든 아래 네 줄을

```tsx
  useEffect(() => {
    const draft = loadDraft();
    if (draft.length) setStrokes(draft);
  }, []);
```

다음으로 바꾼다.

```tsx
  // 냉시작 배치 적합만 유휴 시간으로 미룬다. requestIdleCallback 이 없는 브라우저는 setTimeout 으로 떨어진다.
  useEffect(() => {
    // if (draft.length) 가드는 E20 이다. 로드가 실패해 빈 배열이 와도 setStrokes 를 부르지 않으므로
    // 저장 effect 가 돌아 원본을 덮어쓰는 경로가 생기지 않는다. restored.current 만으로는
    // requestIdleCallback 경로에서 첫 setStrokes 가 두 번째 렌더에 오므로 이 가드를 대신하지 못한다.
    const restore = () => { const draft = loadDraft(); if (draft.length) setStrokes(draft); };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(restore, { timeout: 200 });
      return () => window.cancelIdleCallback(handle);
    }
    idleTimer.current = setTimeout(restore, 0);
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, []);
```

저장 effect(`if (!restored.current) { restored.current = true; return; } saveDraft(strokes);`)와 unmount 정리 effect는 그대로 둔다.

**(d) `endStroke` 끝의 죽은 타이머 두 줄을 삭제한다.** 이 ref 는 이제 (c)의 폴백이 쓴다. Task 2·3이 그 위를 고쳤어도 이 두 줄은 `endStroke`의 마지막 문장 그대로 남아 있다:

```tsx
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => undefined, 100);
```

- [ ] **Step 10: app/s/[d]/page.tsx 를 실루엣으로 옮기고 닫힌 획을 실제로 닫는다**

공유 페이지는 이 태스크만 건드린다. 두 가지를 같이 한다: `metrics.formula` 소비를 `polarFormula`로 옮기고(문자열은 동일하다 — 화면 변화 없음), 닫힘 획을 캔버스와 같은 방식으로 닫는다.

**(a) 5~7행 import 를 바꾼다:**

```tsx
import { pathFor, STROKE_WIDTH, strokeCopies } from "@/lib/geometry";
import { getMetrics } from "@/lib/metrics";
import { polarFormula } from "@/lib/polar";
import { decodeShare } from "@/lib/share";
```

**(b) `const metrics = getMetrics(strokes);`(37행) 바로 아래에 한 줄 추가:**

```tsx
  const metrics = getMetrics(strokes);
  // 공유 페이지는 획별 푸리에를 돌리지 않는다. 카드에 실리는 것은 외곽 실루엣 한 줄뿐이다.
  const silhouette = polarFormula(strokes).formula;
```

**(c) 렌더 루프(58~60행)의 `pathFor` 호출에 닫힘 인자를 준다.** 캔버스의 `StrokeLayer`가 `pathFor(points, stroke.closure === "closed")`를 쓰므로 공유 페이지도 같아야 한다 — 아니면 같은 마법진이 두 화면에서 다르게 그려진다:

```tsx
        {strokes.flatMap((stroke, index) => strokeCopies(stroke).map((points, copy) =>
          <path key={`${index}-${copy}`} d={pathFor(points, stroke.closure === "closed")} fill="none" strokeLinecap="round" strokeLinejoin="round"
            style={{ stroke: "url(#share-gradient)", strokeWidth: STROKE_WIDTH }} />))}
```

**(d) 78행을 바꾼다:**

```tsx
      <code className="share-formula">{silhouette}</code>
```

`generateMetadata`(11~20행)는 `metrics.power`/`grade`/`rotation`만 쓰므로 손대지 않는다.

- [ ] **Step 11: 전체 통과를 확인하고 커밋한다**

```bash
cd /Users/yoma/projects/jamcoding/jangyunu && npm test && npx tsc --noEmit
```

기대 출력 — 앞 태스크들이 만든 스위트까지 **전부 통과**하고, 이 태스크분은 다음 세 줄이다:

```
 ✓ lib/analysis.test.ts (9 tests)
 ✓ lib/metrics.test.ts (2 tests)
 ✓ lib/polar.test.ts (5 tests)
```

`tsc`는 무출력·종료 코드 0. 이것이 `app/s/[d]/opengraph-image.tsx`가 `formula`/`accuracy`를 쓰지 않아 무변경으로 충분하다는 증명이다. (`npm run build`는 돌리지 않는다 — dev 서버가 `.next`를 쓰고 있다.)

이어서 `npm run dev` 상태에서 `http://localhost:3000`을 열고 세 가지를 눈으로 확인한다.

1. 새로고침 직후 저장된 그림이 그대로 복원된다(유휴 콜백으로 미뤄졌으므로 한 프레임 늦게 나타날 수 있다). 콘솔에 hydration 경고가 없다.
2. 원을 하나 그리면 푸터의 극좌표식과 정확도, 우측 위력·등급, 카드 뒷면이 **이번 변경 전과 똑같이** 보인다. 달라 보이면 (b)의 `const metrics = analysis.metrics;`가 빠진 것이다.
3. 「마법진 공유하기」로 만든 링크를 열면 공유 카드의 획이 캔버스와 같은 모양이고(닫힌 획이 실제로 닫혀 있다) 카드 하단 식이 캔버스 푸터의 식과 글자 그대로 같다.

```bash
git fetch origin && git status -sb
git add app/page.tsx "app/s/[d]/page.tsx"
git commit -m "feed page metrics from analysis"
```

`git add .`을 쓰지 않는다. 작업 트리에 추적 중인 `tsconfig.tsbuildinfo`·`next-dev.*.log`가 dev 서버 때문에 항상 더럽다.

---

**이 태스크가 하지 않는 것 (경계를 명시한다).**

- **푸터(`.stage-footer`)를 건드리지 않는다.** 요약 문장·구조식·「식 보기」 버튼·정확도 표기는 Task 9가 `formatSummarySentence`/`formatStructure`/`formatAccuracy`로 한 번에 만든다. Task 9는 이때 Step 9(b)의 2단 메모를 **되돌리지 않고** `hasFormula`/`summarySentence`/`structureExpr` 세 줄을 그 아래에 덧붙이며 `copyFormula`를 지운다.
- **카드 뒷면을 건드리지 않는다.** `<dt>극좌표식</dt>` → `<dt>구조식</dt>` + `<dt>분해</dt>` + 「전체 식 보기」와 `app/_components/ArcanaCard.tsx` 추출은 Task 11 소관이다.
- **정확도 문자열을 만들지 않는다.** `analysis.accuracy`는 0~1 실수 그대로 넘긴다. 이것을 `%`로 바꾸는 함수는 앱 전체에서 `lib/formatting.ts`의 `formatAccuracy` 하나뿐이고 그 파일은 Task 8이 만든다.
- **`Metrics`에서 `formula`/`accuracy`를 떼지 않는다.** 이 커밋 시점에 그 두 필드를 읽는 곳이 셋 남아 있고(푸터, `copyFormula`, 카드 뒷면) 커밋마다 `tsc`가 초록이어야 한다. Task 9가 앞의 둘을, Task 11이 마지막 하나를 없앤다. **마지막 소비처가 사라진 직후(Task 11) 다음 세 줄로 스펙 §2의 "formula/accuracy 제거"를 완료한다**: `lib/metrics.ts`에서 `import { polarFormula } from "@/lib/polar";`와 `const { formula, accuracy } = polarFormula(strokes);`를 지우고, 반환문을 `return { lines, length: Math.round(length), intersections, closed, horizontal, vertical, rotation, complexity, power, grade };`로 바꾼다. `lib/metrics.test.ts`는 그때 첫 번째 `it`(위임 검사)만 지우면 되고 밸런스 동결은 `toMatchObject`라 그대로 통과한다.
- 그때까지 `analyze` 한 번에 `polarFormula`가 두 번 돈다(`getMetrics` 안에서 한 번, `silhouette`으로 한 번). 실전 규모(7획 · 회전 6)에서 실측 비용은 `getMetrics` 0.387ms / `polarFormula` 단독 0.246ms이고, 이 중복은 위 세 줄로 사라진다.

---

All 25 expected strings verified by execution. Now the rewritten task.

### Task 8: lib/formatting.ts — 수식 문자열 조립 (정확도 표기의 유일한 정의처)

**Files:**
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/formatting.ts`
- Test: `/Users/yoma/projects/jamcoding/jangyunu/lib/formatting.test.ts`
- Modify: 없음. 이 태스크는 기존 파일을 한 줄도 건드리지 않는다. 푸터 배선은 Task 9, 모달은 Task 10, 카드 뒷면은 Task 11의 일이다.

**Interfaces:**

Consumes
- `@/lib/analysis` (Task 7): `type CircleAnalysis`, `type StrokeAnalysis`, `type OperatorDesc` — **타입만** import한다(`import type`). `CircleAnalysis.accuracy`는 **`number | null`**이다(Task 7이 E4 때문에 확정한 유일한 널러블 필드).
- `@/lib/fourier` (Task 4·5): `type Term`, `type FitStats`, `type Spectrum`. `Spectrum`은 `StrokeAnalysis.spectrum`을 통해 판별 유니온으로만 좁힌다.
  - `Spectrum.terms`는 **진폭 내림차순**으로 저장되어 있다(D-C). formatting은 이 순서를 **재정렬하지 않고 그대로 적는다** — LaTeX 본문의 항 순서가 곧 "이 획에서 중요한 순서"다. 표시용 `n` 정렬이 필요한 곳은 Task 10의 `coefficientRows`가 자기 안에서 한다.
  - `Spectrum`이 `{ kind: "point"; length: number }`일 때 `length`는 **호길이**다(D-E). 0이라는 보장이 없으므로 formatting은 이 값을 읽지 않는다 — `kind`만 본다.
- `@/lib/geometry` (Task 2): `type Symmetry`, `type Closure`, `type Stroke` — **전부 타입만**. `copiesFor`를 **import하지 않는다**(D-I). `uniformSymmetry.count`와 `OperatorDesc.count`는 Task 7이 이미 `copiesFor`를 적용해 넣은 **복사본 수**이므로, 여기서 다시 `copiesFor`를 씌우면 이중 적용이다(회전에서만 우연히 항등이라 지금까지 안 들켰다).
- `@/lib/metrics` (Task 7): 값 `getMetrics` — 테스트 픽스처에서 `getMetrics([])`로 `Metrics` 자리를 채운다. `Metrics` 필드가 뒤에 바뀌어도 이 테스트가 깨지지 않게 하는 장치다.
- Task 1이 만든 `vitest.config.ts`. **전제**: `resolve.alias`로 `@` → 프로젝트 루트가 잡혀 있다(D-H). Task 1이 이걸 안 했으면 Task 8은 Step 2에서 멈춘다 — 진행하지 말고 Task 1로 돌아간다.

Produces (뒤 태스크가 이 시그니처에 의존한다 — 공개 표면은 이 6개가 전부다)
```ts
formatOperator(symmetry: Symmetry, rotationCount: number): string   // "R₆" | "R₁₂" | "M_x" | "M_y" | "I"
formatAccuracy(accuracy: number | null): string                     // "—" | "100%" | "99.9%" | … | "0.0%"
formatStructure(analysis: CircleAnalysis): string
formatSummarySentence(analysis: CircleAnalysis): string
formatStrokeExpr(item: StrokeAnalysis, index: number): string       // index는 0-based, 표시는 index+1
formatLatex(analysis: CircleAnalysis): string
```

**`formatAccuracy`가 앱 전체에서 정확도를 문자열로 만드는 유일한 함수다 (D-B).**
- `null → "—"`. 유효 획이 0이면 "실패한 0%"가 아니라 "아직 없음"이다(E4). `0/0`은 NaN이고 `0%`는 앱이 고장난 것으로 읽힌다.
- `accuracy >= 1 → "100%"`. 잔차가 배정도에서 정확히 0인 경우(직선 0항)만 여기에 온다.
- 그 외는 **소수점 한 자리 내림 + 99.9% 클램프**. 내림 하나가 "미달을 위로 반올림하지 않는다"(E5)와 "근사식에 100%를 찍지 않는다"(§4.4)를 동시에 만족한다.
- `0`·음수·`NaN → "0.0%"`. "쟀는데 실패"는 `—`와 다른 글자여야 한다.

이 함수를 **다시 만드는 태스크가 있으면 그 태스크가 틀린 것이다.** Task 7은 `page.tsx`에 인라인 `accuracyLabel`을 만들지 않고, Task 9는 푸터에서 `formatAccuracy`를 여기서 import하며, Task 10의 `lib/sheet.ts`는 자기 `formatAccuracy` 정의와 그 단언들을 두지 않고 여기서 import한다. 같은 화면의 푸터와 모달이 `99%`/`99.4%`로 갈라지는 것이 이 규칙의 존재 이유다.

확정 출력(전부 `scratchpad/fmt-verify.mjs`로 실행 검증):

| 입력 | formatStructure | formatSummarySentence |
|---|---|---|
| 유효 획 0 (빈 배열 또는 전부 `kind:"point"`) | `Z(t) = ∅` | `획을 그리면 식이 나타납니다` |
| 전 획 rotate×6 | `Z(t) = ⋃(k=0..5) R^k z_j(t)` | `6겹 회전 · 1획 · 1항으로 재현` |
| 전 획 mirrorX | `Z(t) = ⋃(k=0..1) M_x^k z_j(t)` | `좌우 대칭 · 1획 · 2항으로 재현` |
| 전 획 free | `Z(t) = ⋃_j z_j(t)` | `대칭 없음 · 1획 · 0항으로 재현` |
| 대칭 혼합 | `Z(t) = ⋃_j S_j[z_j(t)]` | `혼합 대칭 · 3획 · 3항으로 재현` |

`formatStrokeExpr`: `z₁(t) = c₀ + Σ c_n e^(2πint)` / `z₂(t) = z₀ + Δt + Σ b_n sin(πnt)` / 0항이면 `z₃(t) = z₀ + Δt` / 퇴화면 `z₁(t) = 상수 · 퇴화 획`.

내부 규약
- 퇴화 획(`spectrum.kind === "point"`)은 획 수·LaTeX 본문에서 제외한다. `Z(t) = ∅` 분기가 "획 0개"와 "전부 퇴화"를 같은 화면으로 묶는다(E4).
- **`accuracy === null`인데 유효 획이 있는 경로가 실재한다**: `kind !== "point"`인데 `stats.arcLength === 0`이면 Task 7의 `valid`가 비어 `accuracy`가 `null`로 남는다. 이 경우 LaTeX 머리글은 `% 재현: 1획 · 1항 · 정확도 —`가 되어야 하고, 아래 `UNWEIGHTED` 픽스처가 그 경로를 실제로 탄다.
- 스펙 §8.2 Q3: **"같은 모양이면 같은 식"이라는 문구를 문자열·주석·테스트 이름 어디에도 쓰지 않는다.**

---

- [ ] **Step 1: 실패하는 테스트 작성**

`/Users/yoma/projects/jamcoding/jangyunu/lib/formatting.test.ts`를 새로 만든다. formatting은 수치를 만들지 않고 타입만 읽으므로 픽스처를 손으로 적는다 — `fitStroke`를 돌리지 않는 것이 이 모듈을 fourier에서 떼어낸 이유다.

```ts
import { describe, expect, it } from "vitest";

import type { CircleAnalysis, OperatorDesc, StrokeAnalysis } from "@/lib/analysis";
import { formatAccuracy, formatLatex, formatOperator, formatStrokeExpr, formatStructure, formatSummarySentence } from "@/lib/formatting";
import type { FitStats, Spectrum } from "@/lib/fourier";
import type { Closure, Stroke, Symmetry } from "@/lib/geometry";
import { getMetrics } from "@/lib/metrics";

// formatting은 타입만 읽으므로 픽스처를 손으로 적는다. 적합을 돌리지 않는 것이 이 모듈을 분리한 이유다.
const stats = (P: number, accuracy: number, arcLength = 60): FitStats =>
  ({ P, arcLength, normS: 30, rmsError: 0.1, maxError: 0.2, accuracy, capped: false });

// terms는 진폭 내림차순으로 저장된다(D-C). WAVE의 |b₁|=3.2 > |b₃|=0.90 순서가 그것이다.
// formatting은 이 순서를 재정렬하지 않고 그대로 적는다.
const CIRCLE: Spectrum = { kind: "closed", c0: { re: 0, im: 0 }, terms: [{ n: 1, re: 30, im: 0 }], stats: stats(384, 0.9999) };
const LINE: Spectrum = { kind: "open", z0: { re: -20, im: 0 }, delta: { re: 40, im: 0 }, terms: [], stats: stats(128, 1) };
const WAVE: Spectrum = {
  kind: "open", z0: { re: -30, im: -5.25 }, delta: { re: 60, im: 0 },
  terms: [{ n: 1, re: 0, im: -3.2 }, { n: 3, re: 0.8, im: 0.42 }], stats: stats(160, 0.9921)
};
// point의 length는 호길이다(D-E). 0이 아니라 임계(1e-6) 아래 값이다. formatting은 이 값을 읽지 않는다.
const DOT: Spectrum = { kind: "point", length: 4e-7 };
// kind는 closed인데 호길이가 0 — Task 7의 가중 평균에서 valid가 비어 accuracy가 null로 남는 경로다.
const FROZEN: Spectrum = { kind: "closed", c0: { re: 0, im: 0 }, terms: [{ n: 1, re: 30, im: 0 }], stats: stats(384, 0, 0) };

const ROTATE: OperatorDesc = { kind: "rotate", count: 6 };
const MIRROR_X: OperatorDesc = { kind: "mirrorX", count: 2 };
const IDENTITY: OperatorDesc = { kind: "identity", count: 1 };

const stroke = (id: string, symmetry: Symmetry, closure: Closure): Stroke =>
  ({ id, points: [{ x: 20, y: 50 }, { x: 80, y: 50 }], symmetry, rotationCount: 6, closure });
const item = (id: string, symmetry: Symmetry, closure: Closure, spectrum: Spectrum, operator: OperatorDesc): StrokeAnalysis =>
  ({ stroke: stroke(id, symmetry, closure), spectrum, operator });

// uniformSymmetry.count와 OperatorDesc.count는 "복사본 수"다(D-I). rotate×6 → 6, mirrorX → 2, free → 1.
const analysis = (over: Partial<CircleAnalysis>): CircleAnalysis => ({
  metrics: getMetrics([]), strokes: [], totalTerms: 0, accuracy: null,
  worst: null, uniformSymmetry: null, silhouette: "", ...over
});

const EMPTY = analysis({});
const SINGLE = analysis({
  strokes: [item("a", "rotate", "closed", CIRCLE, ROTATE)],
  uniformSymmetry: { symmetry: "rotate", count: 6 }, totalTerms: 1, accuracy: 0.9999, silhouette: "r(θ) = 29.6"
});
const MIRRORED = analysis({
  strokes: [item("a", "mirrorX", "open", WAVE, MIRROR_X)],
  uniformSymmetry: { symmetry: "mirrorX", count: 2 }, totalTerms: 2, accuracy: 0.9921, silhouette: "r(θ) = 20.1"
});
const MIXED = analysis({
  strokes: [
    item("a", "rotate", "closed", CIRCLE, ROTATE),
    item("b", "mirrorX", "open", WAVE, MIRROR_X),
    item("c", "free", "open", LINE, IDENTITY)
  ],
  uniformSymmetry: null, totalTerms: 3, accuracy: 0.9932,
  worst: { index: 1, accuracy: 0.9921 }, silhouette: "r(θ) = 29.6 + 3.2cos(12θ − 1.29)"
});
const DEGENERATE = analysis({
  strokes: [item("a", "free", "point", DOT, IDENTITY), item("b", "free", "open", LINE, IDENTITY)],
  uniformSymmetry: { symmetry: "free", count: 1 }, totalTerms: 0, accuracy: 1, silhouette: "r(θ) = 12.0"
});
const ALL_DEGENERATE = analysis({
  strokes: [item("a", "free", "point", DOT, IDENTITY)],
  uniformSymmetry: { symmetry: "free", count: 1 }
});
// 유효 획이 있는데 accuracy가 null인 유일한 경로. 이 픽스처가 없으면 null 분기가 한 번도 실행되지 않는다.
const UNWEIGHTED = analysis({
  strokes: [item("a", "free", "closed", FROZEN, IDENTITY)],
  uniformSymmetry: { symmetry: "free", count: 1 }, totalTerms: 1, accuracy: null, silhouette: "r(θ) = 0.0"
});

describe("formatOperator", () => {
  it("두 번째 인자는 회전 수다 — 복사본 수를 넘기지 않는다", () => {
    expect(formatOperator("rotate", 6)).toBe("R₆");
    expect(formatOperator("rotate", 12)).toBe("R₁₂");
    expect(formatOperator("mirrorX", 2)).toBe("M_x");
    expect(formatOperator("mirrorY", 2)).toBe("M_y");
    expect(formatOperator("free", 1)).toBe("I");
  });
});

describe("formatAccuracy", () => {
  it("유효 획이 없으면 0%가 아니라 —", () => {
    expect(formatAccuracy(null)).toBe("—");
  });

  it("잔차가 정확히 0인 획만 100%", () => {
    expect(formatAccuracy(1)).toBe("100%");
    expect(formatAccuracy(1.0000001)).toBe("100%");
  });

  it("근사식에 100%를 찍지 않는다 — 99.9%로 클램프", () => {
    expect(formatAccuracy(0.9999999999999999)).toBe("99.9%");
    expect(formatAccuracy(0.999999)).toBe("99.9%");
    expect(formatAccuracy(0.9999)).toBe("99.9%");
  });

  it("미달을 위로 반올림하지 않고 소수 한 자리로 내린다", () => {
    expect(formatAccuracy(0.9932)).toBe("99.3%");
    expect(formatAccuracy(0.99)).toBe("99.0%");
    expect(formatAccuracy(0.98999999999)).toBe("98.9%");
    expect(formatAccuracy(0.94159)).toBe("94.1%");
  });

  it("쟀는데 실패한 0%는 —와 구분된다", () => {
    expect(formatAccuracy(0)).toBe("0.0%");
    expect(formatAccuracy(-0.2)).toBe("0.0%");
    expect(formatAccuracy(Number.NaN)).toBe("0.0%");
  });
});

describe("formatStructure", () => {
  it("획이 없으면 공집합", () => expect(formatStructure(EMPTY)).toBe("Z(t) = ∅"));
  it("전부 퇴화여도 공집합", () => expect(formatStructure(ALL_DEGENERATE)).toBe("Z(t) = ∅"));
  it("대칭이 같으면 복사본 범위를 적는다 — count는 이미 복사본 수라 -1만 한다", () => {
    expect(formatStructure(SINGLE)).toBe("Z(t) = ⋃(k=0..5) R^k z_j(t)");
    expect(formatStructure(MIRRORED)).toBe("Z(t) = ⋃(k=0..1) M_x^k z_j(t)");
    expect(formatStructure(DEGENERATE)).toBe("Z(t) = ⋃_j z_j(t)");
  });
  it("대칭이 섞이면 연산자를 획별로 낮춘다", () => expect(formatStructure(MIXED)).toBe("Z(t) = ⋃_j S_j[z_j(t)]"));
});

describe("formatSummarySentence", () => {
  it("획이 없으면 실패가 아니라 안내", () => expect(formatSummarySentence(EMPTY)).toBe("획을 그리면 식이 나타납니다"));
  it("전부 퇴화여도 같은 안내", () => expect(formatSummarySentence(ALL_DEGENERATE)).toBe("획을 그리면 식이 나타납니다"));
  it("대칭 · 획 수 · 항 수를 적는다", () => {
    expect(formatSummarySentence(SINGLE)).toBe("6겹 회전 · 1획 · 1항으로 재현");
    expect(formatSummarySentence(MIRRORED)).toBe("좌우 대칭 · 1획 · 2항으로 재현");
    expect(formatSummarySentence(MIXED)).toBe("혼합 대칭 · 3획 · 3항으로 재현");
  });
  it("퇴화 획은 획 수에서 뺀다", () => expect(formatSummarySentence(DEGENERATE)).toBe("대칭 없음 · 1획 · 0항으로 재현"));
  it("정확도가 null이어도 문장은 나온다 — 문장은 accuracy를 읽지 않는다", () =>
    expect(formatSummarySentence(UNWEIGHTED)).toBe("대칭 없음 · 1획 · 1항으로 재현"));
});

describe("formatStrokeExpr", () => {
  it("닫힌 획은 지수급수", () => expect(formatStrokeExpr(MIXED.strokes[0], 0)).toBe("z₁(t) = c₀ + Σ c_n e^(2πint)"));
  it("열린 획은 아핀 항 + 사인급수", () => expect(formatStrokeExpr(MIXED.strokes[1], 1)).toBe("z₂(t) = z₀ + Δt + Σ b_n sin(πnt)"));
  it("직선은 0항이라 급수 자체가 없다", () => expect(formatStrokeExpr(MIXED.strokes[2], 2)).toBe("z₃(t) = z₀ + Δt"));
  it("퇴화 획은 상수라고 밝힌다", () => expect(formatStrokeExpr(DEGENERATE.strokes[0], 0)).toBe("z₁(t) = 상수 · 퇴화 획"));
  it("두 자리 번호도 아래첨자", () => expect(formatStrokeExpr(MIXED.strokes[0], 11)).toBe("z₁₂(t) = c₀ + Σ c_n e^(2πint)"));
});

describe("formatLatex", () => {
  it("획이 없으면 좌표계와 공집합만", () => expect(formatLatex(EMPTY)).toBe([
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100",
    "\\[ Z(t) = \\emptyset \\]"
  ].join("\n")));

  it("단일 획은 계수를 그대로 적는다", () => expect(formatLatex(SINGLE)).toBe([
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100",
    "% 연산자: R_{6}z = e^{2\\pi i/6}z",
    "% 재현: 1획 · 1항 · 정확도 99.9%",
    "% 외곽 실루엣: r(θ) = 29.6",
    "\\[",
    "\\begin{aligned}",
    "Z(t) &= \\bigcup_{j}\\bigcup_{k=0}^{5} R^{k} z_{j}(t) \\\\",
    "z_{1}(t) &= (0.00 + 0.00i) + (30.00 + 0.00i)\\,e^{2\\pi i (1) t}",
    "\\end{aligned}",
    "\\]"
  ].join("\n")));

  it("혼합 대칭은 획마다 연산자를 붙인다", () => expect(formatLatex(MIXED)).toBe([
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100",
    "% 연산자: R_{6}z = e^{2\\pi i/6}z · M_{x}z = -\\overline{z} · I z = z",
    "% 재현: 3획 · 3항 · 정확도 99.3%",
    "% 외곽 실루엣: r(θ) = 29.6 + 3.2cos(12θ − 1.29)",
    "\\[",
    "\\begin{aligned}",
    "Z(t) &= \\bigcup_{j} S_{j}[z_{j}(t)] \\\\",
    "z_{1}(t) &= (0.00 + 0.00i) + (30.00 + 0.00i)\\,e^{2\\pi i (1) t} \\quad (S_{1} = R_{6}) \\\\",
    "z_{2}(t) &= (-30.00 - 5.25i) + (60.00 + 0.00i)\\,t + (0.00 - 3.20i)\\,\\sin(\\pi (1) t) + (0.80 + 0.42i)\\,\\sin(\\pi (3) t) \\quad (S_{2} = M_{x}) \\\\",
    "z_{3}(t) &= (-20.00 + 0.00i) + (40.00 + 0.00i)\\,t \\quad (S_{3} = I)",
    "\\end{aligned}",
    "\\]"
  ].join("\n")));

  it("퇴화 획은 주석으로 빼고 본문 번호는 유지한다", () => expect(formatLatex(DEGENERATE)).toBe([
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100",
    "% 연산자: I z = z",
    "% 재현: 1획 · 0항 · 정확도 100%",
    "% 외곽 실루엣: r(θ) = 12.0",
    "% 퇴화 획(계수 없음): z_{1}",
    "\\[",
    "\\begin{aligned}",
    "Z(t) &= \\bigcup_{j} z_{j}(t) \\\\",
    "z_{2}(t) &= (-20.00 + 0.00i) + (40.00 + 0.00i)\\,t",
    "\\end{aligned}",
    "\\]"
  ].join("\n")));

  it("유효 획이 있어도 정확도가 null이면 —로 적는다", () => expect(formatLatex(UNWEIGHTED)).toBe([
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100",
    "% 연산자: I z = z",
    "% 재현: 1획 · 1항 · 정확도 —",
    "% 외곽 실루엣: r(θ) = 0.0",
    "\\[",
    "\\begin{aligned}",
    "Z(t) &= \\bigcup_{j} z_{j}(t) \\\\",
    "z_{1}(t) &= (0.00 + 0.00i) + (30.00 + 0.00i)\\,e^{2\\pi i (1) t}",
    "\\end{aligned}",
    "\\]"
  ].join("\n")));
});
```

- [ ] **Step 2: 실패 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/formatting.test.ts
```

예상 출력 (모듈이 아직 없으므로 스위트 전체가 수집 단계에서 실패한다):

```
 FAIL  lib/formatting.test.ts [ lib/formatting.test.ts ]
Error: Failed to resolve import "@/lib/formatting" from "lib/formatting.test.ts". Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

**게이트**: `@/lib/analysis`나 `@/lib/metrics`(Task 7 산출물, 이미 디스크에 있다)까지 못 찾겠다고 나오면 그건 Task 1의 `vitest.config.ts` 별칭(D-H)이 빠진 것이다. 그때는 Task 8을 진행하지 말고 Task 1로 돌아간다.

- [ ] **Step 3: 유니코드 생성기 5개 구현 (LaTeX는 스텁)**

`/Users/yoma/projects/jamcoding/jangyunu/lib/formatting.ts`를 만든다. LaTeX는 다음 스텝에서 채우되, import가 깨지지 않도록 빈 문자열 스텁을 먼저 둔다.

```ts
// 스펙트럼을 사람이 읽는 문자열로 옮긴다. 수치는 analysis가 정한 것을 옮겨 적기만 하고 여기서 새로 계산하지 않는다.

import type { CircleAnalysis, StrokeAnalysis } from "@/lib/analysis";
import type { Symmetry } from "@/lib/geometry";

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const subscript = (value: number) => String(value).split("").map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit).join("");

const SYMMETRY_LABEL: Record<Exclude<Symmetry, "rotate">, string> = { free: "대칭 없음", mirrorX: "좌우 대칭", mirrorY: "상하 대칭" };
const OPERATOR_SIGN: Record<Exclude<Symmetry, "free">, string> = { rotate: "R", mirrorX: "M_x", mirrorY: "M_y" };

// 두 번째 인자는 회전 수(Stroke.rotationCount)다. 복사본 수(copiesFor의 결과)를 넘기면 안 된다 —
// 회전에서만 두 값이 같아서 반사·자유 대칭에서 조용히 틀린다.
export const formatOperator = (symmetry: Symmetry, rotationCount: number) =>
  symmetry === "rotate" ? `R${subscript(rotationCount)}`
    : symmetry === "mirrorX" ? "M_x"
      : symmetry === "mirrorY" ? "M_y" : "I";

// 앱 전체에서 정확도를 문자열로 만드는 유일한 함수다. 푸터·모달·카드·LaTeX가 전부 이것을 부른다 —
// 같은 화면에서 99%와 99.4%가 동시에 보이면 사용자는 어느 쪽이 거짓말인지 묻게 된다.
// null은 "아직 없음", 0%는 "쟀는데 실패"다(E4). 내림 한 번이 "미달을 위로 반올림하지 않는다"(E5)와
// "근사식에 100%를 찍지 않는다"(§4.4)를 동시에 만족한다. 100%는 잔차가 배정도에서 정확히 0일 때만 나온다.
export const formatAccuracy = (accuracy: number | null): string => {
  if (accuracy === null) return "—";
  if (!Number.isFinite(accuracy) || accuracy <= 0) return "0.0%";
  if (accuracy >= 1) return "100%";
  return `${(Math.min(999, Math.floor(accuracy * 1000 + 1e-9)) / 10).toFixed(1)}%`;
};

// 퇴화 획은 그릴 것도 적을 것도 없다. "획 0개"와 "전부 퇴화"는 같은 화면을 내야 한다(E4).
const drawn = (analysis: CircleAnalysis) => analysis.strokes.filter((item) => item.spectrum.kind !== "point");

export const formatStructure = (analysis: CircleAnalysis) => {
  if (!drawn(analysis).length) return "Z(t) = ∅";
  const uniform = analysis.uniformSymmetry;
  if (!uniform) return "Z(t) = ⋃_j S_j[z_j(t)]";
  if (uniform.symmetry === "free") return "Z(t) = ⋃_j z_j(t)";
  // uniform.count 는 이미 복사본 수다(analysis가 copiesFor를 적용해 넣었다). 여기서 다시 씌우면 이중 적용이다.
  return `Z(t) = ⋃(k=0..${uniform.count - 1}) ${OPERATOR_SIGN[uniform.symmetry]}^k z_j(t)`;
};

export const formatSummarySentence = (analysis: CircleAnalysis) => {
  const strokes = drawn(analysis);
  if (!strokes.length) return "획을 그리면 식이 나타납니다";
  const uniform = analysis.uniformSymmetry;
  const head = !uniform ? "혼합 대칭"
    : uniform.symmetry === "rotate" ? `${uniform.count}겹 회전` : SYMMETRY_LABEL[uniform.symmetry];
  return `${head} · ${strokes.length}획 · ${analysis.totalTerms}항으로 재현`;
};

export const formatStrokeExpr = (item: StrokeAnalysis, index: number) => {
  const name = `z${subscript(index + 1)}(t)`;
  if (item.spectrum.kind === "point") return `${name} = 상수 · 퇴화 획`;
  if (item.spectrum.kind === "closed") return item.spectrum.terms.length ? `${name} = c₀ + Σ c_n e^(2πint)` : `${name} = c₀`;
  return item.spectrum.terms.length ? `${name} = z₀ + Δt + Σ b_n sin(πnt)` : `${name} = z₀ + Δt`;
};

export const formatLatex = (analysis: CircleAnalysis) => "";
```

- [ ] **Step 4: 부분 통과 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/formatting.test.ts
```

예상 출력 (유니코드 20개 통과, LaTeX 5개 실패):

```
 Test Files  1 failed (1)
      Tests  5 failed | 20 passed (25)
```

실패 5건은 전부 `formatLatex` describe 안이고 diff가 `expected ""`여야 한다. 다른 describe의 테스트가 섞여 실패하면 Step 3의 문자열에 오타가 있는 것이다. 특히 `formatAccuracy`가 빨간불이면 클램프/내림 순서를 확인한다 — `Math.floor` 전에 `Math.min(999, …)`을 적용하면 `0.9999999999999999`에서 `1000`이 나와 `100.0%`가 찍힌다.

- [ ] **Step 5: LaTeX 생성기 구현**

`lib/formatting.ts`의 `export const formatLatex = (analysis: CircleAnalysis) => "";` 한 줄을 아래 블록으로 교체하고, 파일 상단 import 두 줄을 함께 고친다.

상단 import (교체 후):
```ts
import type { CircleAnalysis, OperatorDesc, StrokeAnalysis } from "@/lib/analysis";
import type { Term } from "@/lib/fourier";
import type { Symmetry } from "@/lib/geometry";
```

스텁 교체 블록:
```ts
// ---- 여기부터 LaTeX 전용. 위 유니코드 생성기와 문자열을 한 조각도 공유하지 않는다 ----
// 단 하나의 예외가 formatAccuracy다 — 정확도 표기는 포맷을 가리지 않고 하나여야 한다.

const fixed = (value: number) => { const text = value.toFixed(2); return text === "-0.00" ? "0.00" : text; };
const latexComplex = (z: { re: number; im: number }) => `(${fixed(z.re)} ${z.im < 0 ? "-" : "+"} ${fixed(Math.abs(z.im))}i)`;
const latexClosedTerm = (term: Term) => `${latexComplex(term)}\\,e^{2\\pi i (${term.n}) t}`;
const latexOpenTerm = (term: Term) => `${latexComplex(term)}\\,\\sin(\\pi (${term.n}) t)`;

const LATEX_SIGN: Record<OperatorDesc["kind"], string> = { rotate: "R", mirrorX: "M_{x}", mirrorY: "M_{y}", identity: "I" };
// OperatorDesc.count 는 복사본 수다. 회전에서만 회전 수와 같고, 회전 연산자 정의에 필요한 것이 바로 그 값이다.
const latexOperator = (operator: OperatorDesc) => operator.kind === "rotate" ? `R_{${operator.count}}` : LATEX_SIGN[operator.kind];
const latexOperatorDef = (operator: OperatorDesc) =>
  operator.kind === "rotate" ? `R_{${operator.count}}z = e^{2\\pi i/${operator.count}}z`
    : operator.kind === "mirrorX" ? "M_{x}z = -\\overline{z}"
      : operator.kind === "mirrorY" ? "M_{y}z = \\overline{z}" : "I z = z";

const latexStructure = (analysis: CircleAnalysis) => {
  const uniform = analysis.uniformSymmetry;
  if (!uniform) return "Z(t) &= \\bigcup_{j} S_{j}[z_{j}(t)]";
  if (uniform.symmetry === "free") return "Z(t) &= \\bigcup_{j} z_{j}(t)";
  return `Z(t) &= \\bigcup_{j}\\bigcup_{k=0}^{${uniform.count - 1}} ${LATEX_SIGN[uniform.symmetry]}^{k} z_{j}(t)`;
};

// 퇴화 획은 본문에 넣지 않는다. kind "point"에는 적을 계수가 없고, 수식 안의 한글은 한글 패키지 없이 컴파일되지 않는다.
// terms는 진폭 내림차순으로 저장된 그대로 적는다 — 정렬을 다시 하면 "중요한 순서"라는 정보가 사라진다.
const latexStroke = (item: StrokeAnalysis, index: number, mixed: boolean) => {
  const tail = mixed ? ` \\quad (S_{${index + 1}} = ${latexOperator(item.operator)})` : "";
  const parts = item.spectrum.kind === "closed"
    ? [latexComplex(item.spectrum.c0), ...item.spectrum.terms.map(latexClosedTerm)]
    : item.spectrum.kind === "open"
      ? [latexComplex(item.spectrum.z0), `${latexComplex(item.spectrum.delta)}\\,t`, ...item.spectrum.terms.map(latexOpenTerm)]
      : [];
  return `z_{${index + 1}}(t) &= ${parts.join(" + ")}${tail}`;
};

export const formatLatex = (analysis: CircleAnalysis) => {
  const head = [
    "% 마법연산자 · 복소 푸리에 분해",
    "% 좌표계: z = \\overline{p - (50 + 50i)},\\ p = x + iy,\\ viewBox 0..100"
  ];
  const drawnCount = drawn(analysis).length;
  if (!drawnCount) return [...head, "\\[ Z(t) = \\emptyset \\]"].join("\n");
  const defs: string[] = [];
  analysis.strokes.forEach((item) => {
    if (item.spectrum.kind === "point") return;
    const def = latexOperatorDef(item.operator);
    if (!defs.includes(def)) defs.push(def);
  });
  head.push(`% 연산자: ${defs.join(" · ")}`);
  // 유효 획이 있는데 호길이 가중이 0이면 accuracy가 null로 온다. 그때는 "0.0%"가 아니라 "—"다.
  head.push(`% 재현: ${drawnCount}획 · ${analysis.totalTerms}항 · 정확도 ${formatAccuracy(analysis.accuracy)}`);
  if (analysis.silhouette) head.push(`% 외곽 실루엣: ${analysis.silhouette}`);
  const degenerate = analysis.strokes
    .map((item, index) => item.spectrum.kind === "point" ? `z_{${index + 1}}` : "")
    .filter((name) => name);
  if (degenerate.length) head.push(`% 퇴화 획(계수 없음): ${degenerate.join(", ")}`);
  const mixed = !analysis.uniformSymmetry;
  const lines = [latexStructure(analysis)];
  analysis.strokes.forEach((item, index) => { if (item.spectrum.kind !== "point") lines.push(latexStroke(item, index, mixed)); });
  return [...head, "\\[", "\\begin{aligned}", lines.join(" \\\\\n"), "\\end{aligned}", "\\]"].join("\n");
};
```

설계 근거 메모(코드에 안 적는 것):
- `\[ \begin{aligned} … \end{aligned} \]`로 감싸는 이유는 `aligned`가 단독으로는 컴파일되지 않기 때문이다. 붙여넣으면 그대로 돌아가는 것이 복사 기능의 목적이다.
- 지수는 `e^{2\pi i (1) t}` 형태로 `n`을 괄호에 그대로 넣는다. `2n`을 계산해 `e^{2\pi i t}`로 줄이지 않는다 — formatting에서 산술을 하지 않는다는 규칙이 이 지점에서 지켜진다.
- 한글은 `%` 주석 안에만 둔다. 본문에 `\text{퇴화 획}`을 넣으면 kotex 없는 환경에서 컴파일이 깨진다.
- `fixed`의 `-0.00` 가드는 실행 확인 결과 `(-0).toFixed(2) === "0.00"`, `(-0.001).toFixed(2) === "-0.00"`이므로 후자만 걸러낸다.

- [ ] **Step 6: 전체 통과 확인 + 타입 검사 + 중복/금지 문구 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/formatting.test.ts
```
예상 출력:
```
 Test Files  1 passed (1)
      Tests  25 passed (25)
```

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run
```
예상 출력: Task 1~7이 만든 파일까지 포함해 **전부 통과**(개수는 선행 태스크 진행 상황에 따라 달라지므로 단언하지 않는다). 빨간불이 하나라도 있으면 이 태스크가 아니라 선행 태스크가 미완인 것이다 — 이 태스크는 기존 파일을 한 줄도 고치지 않았다.

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit
```
예상 출력: 아무것도 출력되지 않고 종료 코드 0. (dev 서버가 `.next`를 쓰므로 `npm run build`는 돌리지 않는다.)

```
cd /Users/yoma/projects/jamcoding/jangyunu && grep -rn "같은 모양이면" lib app
```
예상 출력: 아무것도 출력되지 않음(종료 코드 1). 스펙 §8.2 Q3 — 정준화를 하지 않으므로 이 문구는 거짓이다.

```
cd /Users/yoma/projects/jamcoding/jangyunu && grep -rn "formatAccuracy\|accuracyLabel\|toFixed(1)}%" lib app
```
예상 출력 — 정확히 이 두 파일만 나온다:
```
lib/formatting.ts:...:export const formatAccuracy = (accuracy: number | null): string => {
lib/formatting.ts:...:  head.push(`% 재현: ${drawnCount}획 · ${analysis.totalTerms}항 · 정확도 ${formatAccuracy(analysis.accuracy)}`);
lib/formatting.test.ts:...:import { formatAccuracy, formatLatex, ... } from "@/lib/formatting";
lib/formatting.test.ts:...:describe("formatAccuracy", () => {
lib/formatting.test.ts:...:    expect(formatAccuracy(null)).toBe("—");
...
```
`app/page.tsx`에 `accuracyLabel`이 남아 있으면 Task 7이 지우기로 한 인라인 구현이 살아 있는 것이다(D-B). 그 줄을 지우고 `formatAccuracy(analysis.accuracy)`로 바꾼 뒤 `npx tsc --noEmit`을 다시 돌린다.

- [ ] **Step 7: 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu
git status -sb
git add lib/formatting.ts lib/formatting.test.ts
git commit -m "format magic circle formula strings"
```

`git add -A`를 쓰지 않는다. 작업 트리에 추적 중인 `next-dev.err.log` / `next-dev.out.log` / `tsconfig.tsbuildinfo`가 dev 서버 때문에 계속 더러워져 있어 전부 딸려 들어간다. 커밋 후 `git status`에 `lib/` 관련 변경이 남아 있지 않아야 한다. 이 태스크는 `app/`과 `package.json`을 건드리지 않는다.

---

**이 태스크가 하지 않는 것 (경계 명시)**

- 푸터·모달·카드 뒷면 배선은 각각 Task 9·10·11이 한다. 여기서 만드는 것은 순수 문자열 함수 6개뿐이다.
- `formatAccuracy`를 **다시 정의하는 태스크는 없다**. Task 9는 `@/lib/formatting`에서 import하고, Task 10의 `lib/sheet.ts`도 자기 `formatAccuracy`를 만들지 않는다(D-B). Task 10의 `sheetPlainText`가 부르는 `formatOperator(item.stroke.symmetry, item.stroke.rotationCount)`는 D-I가 확정한 대로 **회전 수**를 넘기는 올바른 호출이다.
- `terms` 정렬을 여기서 바꾸지 않는다. 저장 순서(진폭 내림차순, D-C)가 곧 표시 순서다. `n` 오름차순 표시가 필요한 곳은 Task 10의 `coefficientRows`가 자기 안에서 정렬한다.

**검증 기록.** 위 25개 기대 문자열은 전부 `/private/tmp/claude-501/-Users-yoma-projects-jamcoding-jangyunu/3f4104c7-fa88-4f58-9015-533d06633e7b/scratchpad/fmt-verify.mjs`에 확정본 구현과 픽스처를 그대로 옮겨 `node`로 실행해 얻었다. 주요 값:

```
formatAccuracy  null→"—"  1→"100%"  1.0000001→"100%"  0.9999999999999999→"99.9%"
                0.9999→"99.9%"  0.9932→"99.3%"  0.99→"99.0%"  0.98999999999→"98.9%"
                0.9921→"99.2%"  0.94159→"94.1%"  0→"0.0%"  -0.2→"0.0%"  NaN→"0.0%"
formatStructure SINGLE→"Z(t) = ⋃(k=0..5) R^k z_j(t)"   (uniform.count=6 → 6-1=5, copiesFor 재적용 없음)
                MIRRORED→"Z(t) = ⋃(k=0..1) M_x^k z_j(t)"  (uniform.count=2 → 1)
formatLatex     UNWEIGHTED 머리글 4행 = "% 재현: 1획 · 1항 · 정확도 —"   ← null 분기 실제 실행됨
fixed 가드      (-0).toFixed(2)="0.00"  (-0.001).toFixed(2)="-0.00" → 후자만 "0.00"으로 교정
```

---

### Task 9: 푸터를 요약 문장 + 구조식으로 교체하고 항 수를 analysis 패널에 올린다

**Files:**
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/page.tsx` — 상태 블록(`cardOpen` 인접), unmount effect, `copyFormula`, `.stage-footer` 요소 전체, `.stat-grid` 첫 자식. **Task 1~8이 줄을 밀었으므로 줄 번호가 아니라 각 스텝의 앵커 문자열로 찾는다.**
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/globals.css` — 4행 안의 `.stage-footer{color:#909b91}` ~ `.copy-formula:disabled{opacity:.35}` 구간, 5행 안의 `.stat-grid{…}`, 8행 `@media(max-width:480px)` 안의 선택자 한 개
- Test: **새 테스트 파일 없음.** 스펙 §7이 컴포넌트 테스트를 금지하고, 이 태스크가 바꾸는 것은 JSX와 CSS뿐이다. 문자열을 만드는 세 함수는 전부 Task 8의 `lib/formatting.test.ts`가 이미 잡고 있다. 이 태스크의 red는 `npx tsc --noEmit`이 낸다 — Step 3에서 `copied`/`copyFormula`를 지우면 옛 푸터가 없는 이름을 참조하게 되고(Step 4에서 확인), Step 5의 푸터 교체가 그것을 green으로 만든다.

**Interfaces:**

Consumes
- `app/page.tsx` (Task 7 적용 후 상태): `const spectra = useMemo(() => fitAll(strokes), [strokes]);` / `const analysis: CircleAnalysis = useMemo(() => analyzeFitted(strokes, spectra), [strokes, spectra]);` / `const metrics = analysis.metrics;` 세 줄이 **이미 있다**. 이 태스크는 그 위에 세 줄을 얹기만 한다 — **`analysis` 선언을 다시 만들거나 `analyze(strokes)` 한 개짜리 메모로 접지 않는다**(D-O, 리뷰 5-A). 스펙 §5.3의 2단 분리는 Task 10의 항 수 슬라이더가 변환을 다시 돌리지 않게 하는 유일한 장치다.
- `@/lib/analysis` (Task 7): 이 태스크가 읽는 것은 `analysis.accuracy`(`number | null`), `analysis.strokes[].spectrum.kind`, `analysis.totalTerms` 셋뿐이다.
- `@/lib/formatting` (Task 8) — **세 함수 모두 Task 8이 이미 만들어 두었다. 이 태스크는 import만 한다**(D-B):
  ```ts
  formatSummarySentence(a: CircleAnalysis): string
  //  "6겹 회전 · 1획 · 1항으로 재현" / "혼합 대칭 · 3획 · 3항으로 재현" / 유효 획 0 → "획을 그리면 식이 나타납니다"
  formatStructure(a: CircleAnalysis): string
  //  "Z(t) = ⋃(k=0..5) R^k z_j(t)" / "Z(t) = ⋃(k=0..1) M_x^k z_j(t)" / "Z(t) = ⋃_j z_j(t)"
  //  / 혼합 "Z(t) = ⋃_j S_j[z_j(t)]" / 유효 획 0 → "Z(t) = ∅"
  formatAccuracy(accuracy: number | null): string
  //  null → "—",  1 → "100%",  그 외 소수점 한 자리 · 99.9% 클램프
  //  (0.999487 → "99.9%",  0.985 → "98.5%",  0 → "0.0%")
  ```
  `formatStructure`가 내는 문자열에는 `⋃(k=0..5)`처럼 **복사본 범위가 들어 있다**(스펙 §4.2 스케치의 `Z(t) = ⋃ R^k z_j(t)`는 축약이다). 푸터는 Task 8이 내는 문자열을 그대로 찍는다.
  정확도를 문자열로 만드는 함수는 앱 전체에 `formatAccuracy` 하나뿐이다(D-B). 푸터에서 다시 만들지 않고, Task 10의 모달 헤드도 같은 함수를 쓴다 — 같은 화면에서 푸터가 `99%`, 모달이 `99.4%`로 갈리는 것이 리뷰 4-A가 지적한 결함이다.
- `@/` 별칭: 앱 코드가 이미 쓰고 있고 Task 1이 `vitest.config.ts`의 `resolve.alias`로 테스트 쪽도 같은 문을 쓰게 해 두었다(D-H). 이 태스크는 테스트 파일을 만들지 않으므로 상대 경로 논의 자체가 없다.

Produces
- `app/page.tsx`: `const [formulaOpen, setFormulaOpen] = useState(false)` — **Task 10은 이 선언을 다시 만들지 않는다**(D-Q, 리뷰 5-B). Task 10은 바로 아래에 `openFormula`/`openCard` 두 헬퍼만 추가하고 버튼의 `onClick`만 바꾼다.
- `app/page.tsx`: 푸터의 `<button className="open-formula" … disabled={!hasFormula} aria-haspopup="dialog" aria-expanded={formulaOpen}>식 보기</button>` — **`disabled`와 aria 두 속성은 이 태스크가 확정한 것이고 Task 10이 `!strokes.length`로 되돌리지 않는다.**
- `app/page.tsx`: `hasFormula`, `summarySentence`, `structureExpr`
- `app/page.tsx`: analysis 패널 `.stat-grid`의 `푸리에 항 수` 칸(D-R, 스펙 §8.2 Q1 — v1은 표시만, `power` 공식은 한 글자도 건드리지 않는다)
- `app/globals.css`: `.footer-frame`, `.footer-formula`, `.footer-actions`, `.footer-accuracy`, `.open-formula`, `.pending`, `.stat-terms`
- **삭제되는 것**: `copied` 상태, `copyTimer` ref, `copyFormula` 함수, `.copy-formula` CSS. 구조식 한 줄을 클립보드에 넣는 것은 가치가 거의 없다(스펙 §4.2). 복사는 Task 10의 모달이 좌표 프레임·연산자 정의를 포함한 평문/LaTeX 두 포맷으로 다시 만든다. `lib/metrics.ts`는 건드리지 않는다.

**이 태스크가 하지 않는 것**: 카드 뒷면(`<dt>구조식</dt>`·`<dt>분해</dt>`·「전체 식 보기」)은 Task 11 소관이다(D-N). 모달 본체와 `openFormula` 배선은 Task 10이다. `formatAccuracy` 정의는 Task 8이다.

---

- [ ] **Step 1: 선행 계약 게이트**

이 태스크는 앞 두 태스크의 산출물 위에 얹히기만 한다. 셋 중 하나라도 없으면 진행하지 않는다.

```
cd /Users/yoma/projects/jamcoding/jangyunu
grep -n "export const formatSummarySentence\|export const formatStructure\|export const formatAccuracy" lib/formatting.ts
grep -n "fitAll\|analyzeFitted\|const metrics = analysis.metrics" app/page.tsx
npx vitest run lib/formatting.test.ts
```

첫 `grep`은 **세 줄**이 나와야 한다. `formatAccuracy`가 없으면 Task 8이 끝나지 않은 것이다 — 여기서 만들지 말고 Task 8로 돌아간다(D-B: 정의는 앱에 하나뿐이고 그 자리는 `lib/formatting.ts`다).

둘째 `grep`은 Task 7이 만든 2단 메모 세 줄이 나와야 한다. 아무것도 안 나오면 Task 7이 적용되지 않은 것이고, 이 태스크의 앵커가 전부 어긋난다.

`npx vitest run lib/formatting.test.ts`는 전부 통과해야 한다.

- [ ] **Step 2: page.tsx — import와 상태 세 줄 추가**

**(a)** `@/lib/attributes` import 줄 바로 아래에 한 줄을 넣는다(경로 알파벳 순서: analysis → attributes → formatting → geometry → share → storage).

```tsx
import { formatAccuracy, formatStructure, formatSummarySentence } from "@/lib/formatting";
```

**(b)** `  const [cardOpen, setCardOpen] = useState(false);` 바로 아래에 한 줄을 넣는다.

```tsx
  const [formulaOpen, setFormulaOpen] = useState(false);
```

**(c)** Task 7이 만든 `  const metrics = analysis.metrics;` 바로 아래에 네 줄을 넣는다.

```tsx
  // 유효 획이 0이면(획이 없거나 전부 퇴화) "실패한 0%"가 아니라 "아직 없음"이다 (E4).
  const hasFormula = analysis.strokes.some((item) => item.spectrum.kind !== "point");
  const summarySentence = useMemo(() => formatSummarySentence(analysis), [analysis]);
  const structureExpr = useMemo(() => formatStructure(analysis), [analysis]);
```

`analysis`가 안정 참조라 두 문자열은 드래그 중 pointermove에서 다시 만들어지지 않는다. `hasFormula`는 배열 한 번 훑기라 메모하지 않는다.

- [ ] **Step 3: page.tsx — 복사 기능 제거**

**(a)** 상태·ref 두 줄을 **삭제한다**.

```tsx
  const [copied, setCopied] = useState(false);
```
```tsx
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

**(b)** unmount effect에서 `copyTimer` 줄을 뺀다. 교체 후 전체:

```tsx
  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (shareTimer.current) clearTimeout(shareTimer.current);
  }, []);
```

**(c)** `const copyFormula = async () => {`로 시작하는 함수 **전체를 삭제한다**(Task 7이 클립보드 인자를 `analysis.silhouette`로 바꿔 두었을 수 있다 — 어느 쪽이든 통째로 지운다).

- [ ] **Step 4: 실패 확인**

```
npx tsc --noEmit
```

예상 출력 — 아직 옛 푸터가 방금 지운 두 이름을 참조하고 있다. 줄·열 번호는 Task 1~8이 얼마나 밀었는지에 따라 달라지므로 **오류 코드와 이름만 본다**:

```
app/page.tsx(…): error TS2304: Cannot find name 'copyFormula'.
app/page.tsx(…): error TS2304: Cannot find name 'copied'.
```

이 두 개 말고 다른 오류가 섞이면 Step 2가 잘못된 것이다. `formatSummarySentence` 계열이 "Cannot find module"로 나오면 Step 1의 게이트를 건너뛴 것이다.

- [ ] **Step 5: 푸터 JSX 교체**

`<div className="stage-footer">`로 시작해 짝이 되는 `</div>`까지 **요소 하나를 통째로** 아래 한 줄로 갈아끼운다. Task 7이 그 안에 무엇을 남겨 두었든(`외곽 실루엣`·`analysis.silhouette`·복사 버튼) 전부 버린다 — 푸터 문안은 여기서 한 번에 만든다(D-O).

```tsx
        <div className="stage-footer"><span className="footer-frame">복소 푸리에 · 중심 원점</span><div className="footer-formula"><b className={active ? "pending" : undefined}>{summarySentence}</b>{active && <i>+1 대기</i>}<code>{structureExpr}</code></div><div className="footer-actions"><button className="open-formula" onClick={() => setFormulaOpen(true)} disabled={!hasFormula} aria-haspopup="dialog" aria-expanded={formulaOpen}>식 보기</button><span className={active ? "footer-accuracy pending" : "footer-accuracy"}>정확도 {formatAccuracy(analysis.accuracy)}</span></div></div>
```

설계 근거 다섯 가지:
- 문장이 앞, 구조식이 뒤(스펙 §4.2). `Z(t) = ⋃ R^k z_j(t)`는 정직하지만 누가 무엇을 그려도 같게 나오는 템플릿이라 주인공 자리에 두면 안 된다.
- `+1 대기`를 `<b>` **바깥**에 둔다. 안에 넣으면 `.pending`의 `opacity:.5`가 상속돼 "왜 흐린지 설명하는 글자"까지 같이 흐려진다(스펙 §4.2 비판 C-10 대응).
- `disabled={!hasFormula}`는 획 0개와 전부 퇴화(`kind: "point"`)를 함께 막는다. `!strokes.length`는 후자를 놓친다.
- 정확도는 `formatAccuracy(analysis.accuracy)` 한 번이면 끝난다. `hasFormula ? … : null` 삼항을 겹치지 않는다 — `accuracy`가 이미 유효 획 0에서 `null`이고(E4) `formatAccuracy`의 `null → "—"` 분기가 그것을 받는다. 유효 획이 있는데 값이 0이면 `0.0%`가 그대로 찍힌다("없음"과 "실패"의 구분).
- `aria-expanded={formulaOpen}`가 없으면 `formulaOpen`을 읽는 곳이 이 태스크에 하나도 없다. dialog 트리거로서 맞는 마크업이면서 상태가 Task 10까지 떠 있는 것을 막는다. 이 시점에 버튼을 눌러도 아직 아무것도 열리지 않는다 — 시트는 Task 10이 연결한다.

- [ ] **Step 6: 통과 확인**

```
npx tsc --noEmit
npx vitest run
```

`tsc`는 아무것도 출력하지 않고 종료 코드 0. `vitest`는 선행 태스크가 만든 파일까지 **전부 통과**한다(이 태스크는 테스트를 추가하지도 지우지도 않으므로 개수가 Task 8 끝 시점과 같아야 한다). 개수가 줄었으면 이 태스크가 lib을 건드린 것이다 — 되돌린다.

- [ ] **Step 7: analysis 패널에 항 수 한 칸 (D-R)**

`.stat-grid`의 첫 자식 앞에 칸 하나를 넣는다. 앵커는 아래 문자열이고 파일에 한 번만 나온다:

```tsx
<div className="stat-grid"><div><span>선의 개수</span>
```

를

```tsx
<div className="stat-grid"><div className="stat-terms"><span>푸리에 항 수</span><b>{analysis.totalTerms}</b></div><div><span>선의 개수</span>
```

로 바꾼다. 나머지 여섯 칸은 한 글자도 건드리지 않는다.

- 맨 앞에 두는 이유는 스펙 §4.1(b)다 — 정확도는 목표까지 항을 늘리므로 99.x%에 고정되고, 실제로 변하는 유일한 수치가 항 수다. 2열 그리드에 일곱 번째 칸을 뒤에 붙이면 마지막 줄에 홀로 남아 "덧붙인 것"으로 보인다.
- **`power`·`complexity`·등급 컷(60/150/260)은 손대지 않는다.** 스펙 §8.2 Q1이 v1을 표시만으로 확정했고, Task 7의 `lib/metrics.test.ts`가 그 불변을 이미 동결하고 있다(E8).
- 그리는 중에도 흐려지지 않는다. 이 칸은 `metrics`의 여섯 칸과 같은 판(활성 획 제외)에서 나오고 그 여섯 칸도 흐려지지 않는다. 개수 불일치를 설명하는 자리는 푸터 한 곳이다.

- [ ] **Step 8: globals.css 교체**

**8-a.** 4행 안의 아래 구간(정확히 이 문자열, 파일에 한 번만 나온다)

```
.stage-footer{color:#909b91}.stage-footer code{color:var(--accent);font-size:11px;margin-left:12px}.stage-footer>span{flex:none;white-space:nowrap}.copy-formula{align-self:center;flex:none;margin:0 10px;border:1px solid #4a5a52;background:transparent;color:#b7c1b5;padding:4px 9px;font:9px 'DM Mono';letter-spacing:.1em;white-space:nowrap}.copy-formula:disabled{opacity:.35}
```

를 아래로 바꾼다.

```
.stage-footer{color:#909b91;gap:12px;align-items:center}.stage-footer>span{flex:none;white-space:nowrap}.footer-formula{flex:1;min-width:0;display:flex;align-items:baseline;gap:10px}.footer-formula b{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 10px/1.5 'DM Mono';letter-spacing:.04em;color:#d6dcd4}.footer-formula b.pending{opacity:.5}.footer-formula i{flex:none;font-style:normal;color:var(--accent);opacity:.85}.stage-footer code{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;color:#79857c}.footer-actions{flex:none;display:flex;align-items:center;gap:10px}.footer-accuracy{white-space:nowrap}.footer-accuracy.pending{opacity:.5}.open-formula{flex:none;border:1px solid #4a5a52;background:transparent;color:#b7c1b5;padding:4px 9px;font:9px 'DM Mono';letter-spacing:.1em;white-space:nowrap}.open-formula:disabled{opacity:.35}
```

- `.footer-formula{flex:1;min-width:0}` + 자식 둘의 `min-width:0;overflow:hidden;text-overflow:ellipsis`가 "식이 길어지면 버튼이 밀린다"(스펙 §4.2 주의)를 없앤다. flex 아이템의 기본 `min-width:auto` 때문에 `overflow:hidden`만으로는 줄어들지 않는다 — `min-width:0`이 실제 수정이다.
- 요약 문장 `#d6dcd4`(푸터 기본색 `#909b91`보다 밝게), 구조식 `#79857c`(더 어둡게). 문장이 주인공, 구조식이 배경이라는 위계가 색으로 드러난다. 기존 `code`의 `color:var(--accent);font-size:11px`를 그대로 두면 구조식이 계속 주인공 자리에 남는다.
- `+1 대기`만 `var(--accent)`를 쓴다. 지금 살아 움직이는 것이 그것 하나다.
- `.open-formula`는 `.copy-formula`의 테두리·패딩·폰트를 그대로 승계하고 `margin:0 10px`만 뺀다(간격은 `.footer-actions`의 `gap:10px`이 담당). 스펙 §4.2의 "버튼 CSS는 `.open-formula`가 승계한다"가 이것이다.

**8-b.** 5행 안의

```
.stat-grid{display:grid;grid-template-columns:1fr 1fr;margin-top:12px}
```

를

```
.stat-grid{display:grid;grid-template-columns:1fr 1fr;margin-top:12px}.stat-terms{grid-column:1/-1;display:flex;align-items:baseline;justify-content:space-between}
```

로 바꾼다. `grid-column:1/-1`이 항 수 칸을 한 줄 통으로 쓰게 해 아래 여섯 칸의 2열 짝(선의 개수|선의 길이, 교차점|닫힌 공간, 좌우|상하)을 그대로 유지한다. `.stat-grid>div`의 `border-bottom`을 그대로 받으므로 이 줄이 머리 행처럼 읽힌다.

**8-c.** 8행 `@media(max-width:480px)` 안의

```
.stage-footer span:last-child{display:none}
```

를

```
.footer-frame{display:none}
```

로 바꾼다. 위치 기반 `span:last-child`는 새 마크업에서 `.footer-accuracy`를 가리키게 되어 **모바일에서 정확히 살려야 할 것을 지운다**(스펙 §4.2: "정확도는 모바일에서도 살린다"). 클래스로 바꿔 좌측 프레임 라벨만 숨긴다.

- [ ] **Step 9: 손 검증**

```
npx tsc --noEmit
```

출력 없이 종료 코드 0. (`npm run build`는 돌리지 않는다 — dev 서버가 `.next`를 쓰고 있다.)

이어서 `npm run dev` 상태에서 `http://localhost:3000`을 열고 다섯 가지를 눈으로 확인한다.

1. **획 0개**(새로고침 직후, 저장된 드래프트가 있으면 「전체 지우기」): 푸터 가운데에 `획을 그리면 식이 나타납니다`, 그 오른쪽에 작고 흐린 `Z(t) = ∅`, 우측에 `정확도 —`, 「식 보기」는 `opacity .35`로 눌리지 않는다. `0.0%`가 보이면 `analysis.accuracy`가 `null`이 아닌 것이다(Task 7의 E4 처리를 확인한다). analysis 패널 맨 위 `푸리에 항 수`는 `0`.
2. **회전 6 + 원 1획**: `6겹 회전 · 1획 · N항으로 재현`(손으로 그린 원이면 N은 1~4) + `Z(t) = ⋃(k=0..5) R^k z_j(t)` + `정확도 99.x%`, 「식 보기」 활성, `푸리에 항 수`가 N. 정확도가 `100%`로 찍히면 `formatAccuracy`가 반올림하고 있는 것이다 — 잔차가 정확히 0인 획(직선 0항)만 100%가 허용된다(스펙 §4.4).
3. **그리는 중**: 포인터를 누른 채 유지하면 요약 문장과 정확도가 절반 밝기로 내려앉고 문장 오른쪽에 accent 색 `+1 대기`가 붙는다. `+1 대기` 자신은 흐려지지 않는다. 손을 떼는 즉시 밝기가 돌아오고 획 수가 1 늘어난다.
4. **좁은 화면**: 개발자도구로 너비 400px. 좌측 `복소 푸리에 · 중심 원점`이 사라지고 `정확도 …`는 남는다. 「자유」 대칭으로 획을 6~7개 그려 문장을 길게 만들어도 「식 보기」가 화면 밖으로 밀리지 않고 문장/구조식 끝이 `…`로 잘린다.
5. **등급 불변**: 회전 6 + 원 1획에서 MAGIC POWER 숫자와 등급이 이 커밋 전후로 같다(스펙 §8.2 Q1). `푸리에 항 수` 칸은 그 아래 여섯 칸과 같은 구분선 위에 한 줄로 놓이고 가로 스크롤을 만들지 않는다.

- [ ] **Step 10: 커밋**

```
git fetch origin
git status -sb
git add app/page.tsx app/globals.css
git commit -m "show fourier summary in footer"
```

`git add -A`를 쓰지 않는다. 작업 트리에 추적 중인 `next-dev.err.log` / `next-dev.out.log` / `tsconfig.tsbuildinfo`가 dev 서버 때문에 계속 더러워져 있어 전부 딸려 들어간다.

---

### Task 10: FormulaSheet 모달 — 재구성 오버레이와 항 수 슬라이더

**Files:**
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/sheet.ts`
- Create: `/Users/yoma/projects/jamcoding/jangyunu/lib/sheet.test.ts`
- Create: `/Users/yoma/projects/jamcoding/jangyunu/app/_components/useOverlayShell.ts`
- Create: `/Users/yoma/projects/jamcoding/jangyunu/app/_components/FormulaSheet.tsx`
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/globals.css` — 파일 **끝**(`.share-circle:disabled{opacity:.5}` 다음 줄)에 추가. 기존 줄은 한 글자도 고치지 않는다
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/page.tsx` — 4곳. Task 7·9가 이미 이 파일을 고쳤으므로 **줄 번호가 아니라 Step 9의 앵커 문자열로 찾는다**
- Modify 안 함: `lib/formatting.ts`, `lib/fourier.ts`, `lib/analysis.ts`, `app/s/[d]/page.tsx`

시트 자체는 `lib/sheet.ts`(순수)와 `FormulaSheet.tsx`(DOM)로 쪼갠다. §7이 컴포넌트 테스트를 금지했으므로, 테스트로 지킬 수 있는 계산을 전부 `lib/sheet.ts`로 내려 컴포넌트에는 계산을 한 줄도 남기지 않는다. 이것이 이 태스크에서 lib 모듈을 하나 더 만드는 유일한 이유다.

**Interfaces:**

Consumes (앞 태스크가 이미 만들어 둔 것. 시그니처가 다르면 이 태스크는 시작하지 않는다):

```ts
// @/lib/geometry  (Task 1에서 closed 인자 추가 · Task 2에서 Stroke 확장)
type Closure = "closed" | "open" | "point"
type Stroke = { id: string; points: Point[]; symmetry: Symmetry; rotationCount: number; closure: Closure }
const STROKE_WIDTH: number                                    // 0.5
pathFor(points: Point[], closed?: boolean): string             // closed면 반환 문자열 끝에 " Z"
copiesFor(symmetry: Symmetry, count: number): number           // count는 회전 수. 반사 2, free 1
strokeCopies(stroke: Stroke): Point[][]                        // 렌더 진입점 (단일화)

// @/lib/fourier  (Task 4: 타입·닫힘·truncate·reconstruct·overlayPointCount / Task 5: "open" 분기 / Task 6: applyOperator)
type Term = { n: number; re: number; im: number }
type FitStats = { P: number; arcLength: number; normS: number; rmsError: number; maxError: number; accuracy: number; capped: boolean }
type Spectrum = { kind:"point"; length:number } | { kind:"closed"; c0:Complex; terms:Term[]; stats:FitStats } | { kind:"open"; z0:Complex; delta:Complex; terms:Term[]; stats:FitStats }
truncate(spectrum: Spectrum, termCount: number): Spectrum      // 재변환 없음. terms는 진폭 내림차순 저장(D-C)이라 slice(0,k) = 진폭 상위 k개
reconstruct(spectrum: Spectrum, q: number): Point[]            // 캔버스 좌표. 닫힘 q개(끝점 중복 없음) / 열림 q개(t = j/(q−1), 양 끝점 포함)
applyOperator(spectrum: Spectrum, symmetry: Symmetry, count: number, copy: number): Spectrum
overlayPointCount(spectrum: Spectrum): number                  // Q = clamp(8·max|n|, 64, 512). kind "point"면 0

// @/lib/analysis  (Task 7)
type OperatorDesc = { kind: "rotate" | "mirrorX" | "mirrorY" | "identity"; count: number }   // count는 "복사본 수"(D-I)
type StrokeAnalysis = { stroke: Stroke; spectrum: Spectrum; operator: OperatorDesc }
type CircleAnalysis = {
  metrics: Metrics; strokes: StrokeAnalysis[]; totalTerms: number;
  accuracy: number | null;                                     // ← E4. null은 "유효 획 0"
  worst: { index: number; accuracy: number } | null;           // index는 analysis.strokes 기준 0-based
  uniformSymmetry: { symmetry: Symmetry; count: number } | null;
  silhouette: string
}

// @/lib/formatting  (Task 8: 구조식·요약·획식·LaTeX / Task 9: formatAccuracy)
formatOperator(symmetry: Symmetry, rotationCount: number): string   // "R₆" | "M_x" | "M_y" | "I" — 두 번째 인자는 회전 수다(D-I)
formatStructure(a: CircleAnalysis): string                          // "Z(t) = ⋃(k=0..5) R^k z_j(t)" | "Z(t) = ⋃_j S_j[z_j(t)]" | "Z(t) = ∅"
formatSummarySentence(a: CircleAnalysis): string                    // "6겹 회전 · 1획 · 3항으로 재현"
formatStrokeExpr(s: StrokeAnalysis, index: number): string          // 식 한 줄만 (머리글 없음)
formatLatex(a: CircleAnalysis): string
formatAccuracy(accuracy: number | null): string                     // null → "—" · accuracy >= 1 → "100%" · 그 외 소수점 한 자리, 99.9% 클램프

// app/page.tsx  (Task 7이 만든 2단 메모 · Task 9가 만든 상태와 푸터)
const analysis: CircleAnalysis                                      // fitAll → analyzeFitted 2단 useMemo 결과
const [formulaOpen, setFormulaOpen] = useState(false)               // ← Task 9가 이미 선언했다
const hasFormula: boolean                                           // 유효 획이 하나라도 있는가 (E4)
<button className="open-formula" onClick={() => setFormulaOpen(true)} disabled={!hasFormula} aria-haspopup="dialog" aria-expanded={formulaOpen}>식 보기</button>

// 테스트 러너 (Task 1)
npx vitest run 이 동작하고 vitest.config.ts 의 resolve.alias 로 "@/lib/*" 가 해석된다
```

Produces (뒤 태스크가 의존할 것):

```ts
// @/lib/sheet
type SheetPath = { key: string; strokeIndex: number; copy: number; d: string }
type CoefficientRow = { n: number; magnitude: number; phase: number; ratio: number }
type BaseRow = { label: string; magnitude: number; phase: number }
const FRAME_LINE: string
const SIN_IDENTITY_LINE: string
termCountOf(spectrum: Spectrum): number
accuracyOf(item: StrokeAnalysis): number | null                 // 퇴화 획은 null — "실패한 0%"가 아니다
isCapped(item: StrokeAnalysis): boolean
strokeNumber(index: number): string                            // 0-based → "01"
maxTermCount(analysis: CircleAnalysis): number
termsAtCap(analysis: CircleAnalysis, cap: number): number
operatorLabel(operator: OperatorDesc): string
legendLines(analysis: CircleAnalysis): string[]                 // [0] 프레임, [1] 연산자, 열린 획이 있으면 [2] sin 항등식
originalPaths(analysis: CircleAnalysis): SheetPath[]
reconstructedPaths(analysis: CircleAnalysis, cap: number): SheetPath[]
coefficientRows(spectrum: Spectrum): CoefficientRow[]
baseRows(spectrum: Spectrum): BaseRow[]
sheetPlainText(analysis: CircleAnalysis): string

// @/app/_components/useOverlayShell
useOverlayShell(onClose: () => void): RefObject<HTMLButtonElement | null>   // Escape + 포커스 + body 스크롤 잠금
//   ↑ Task 11(ArcanaCard)이 .card-overlay 를 이 훅으로 이관한다. 잠금 카운터가 이 훅의 존재 이유다(§4.6)

// @/app/_components/FormulaSheet
export default function FormulaSheet({ analysis, onClose }: { analysis: CircleAnalysis; onClose: () => void }): JSX.Element

// app/page.tsx
const openFormula: () => void      // Task 11의 카드 뒷면 「전체 식 보기」가 이것을 호출한다
const openCard: () => void
```

**이 태스크가 확정하는 두 가지 (스펙 §4.3 스케치의 모호함을 닫는다):**

1. **슬라이더는 획당 항 수 상한이다.** 전역 항 예산은 D9가 폐기했고, 전역 슬라이더를 두면 1항일 때 7획 중 1획만 살아남아 "1항이어도 원은 이미 원"이라는 이 슬라이더의 교육 가치가 사라진다. 범위는 `1 … maxTermCount(analysis)`, 기본값은 최댓값(= 자동 결정된 상태), 옆에 `획당 최대 n항 · 합계 T항`을 붙여 헤드의 총 항 수와 이어 준다.
2. **헤드 배지는 목표(99%)가 아니라 달성치다.** 스케치의 `99% ✓`와 `전체 98.2%`를 같이 두면 같은 화면에서 두 숫자가 서로를 부정한다(E5). 배지 = `formatAccuracy(analysis.accuracy)`, `✓`는 **capped 획이 하나도 없고** 전체가 0.99 이상일 때만. 둘째 줄은 `worst`가 있을 때만.

**정확도 문자열은 이 태스크에서 만들지 않는다.** `lib/sheet.ts`에 `formatAccuracy`를 정의하면 푸터(`lib/formatting`)와 모달이 같은 값에 다른 글자를 찍는다. 앱 전체에서 정확도를 문자열로 만드는 함수는 `lib/formatting.ts`의 `formatAccuracy` 하나뿐이고, 시트는 그것을 import한다. 같은 이유로 `overlayQ`도 만들지 않는다 — Task 4의 `overlayPointCount`가 같은 식(`clamp(8·max|n|, 64, 512)`)이므로 import한다.

**실행 검증 완료** — `scratchpad/sheet-verify2.mjs`에 상류 함수(pathFor+closed / truncate / reconstruct 닫힘·열림 / applyOperator / overlayPointCount / formatAccuracy·formatStructure·formatSummarySentence)를 스펙대로 최소 구현해 붙이고 node로 돌렸다. 아래 스텝의 기대 출력은 전부 그 실행 결과다.

```
[slider] max=8 cap1=3 cap4=9 cap8=15 cap999=15 cap0=0 empty=0
[paths] 원 1항 + 회전×4 → 4개, 전부 " Z" 로 끝남, 시작점 {M80.00 50.00, M50.00 20.00, M20.00 50.00, M50.00 80.00}
        q=64(=overlayPointCount), C 세그먼트 63개, 재구성 반지름 min=max=30.000000000
[open]  열린 획 mirrorX → 2개, 빈 d 없음, " Z" 로 끝나지 않음, 시작점 {M20.00 50.00, M80.00 50.00}
        cap 0 이면 좌표의 y가 전부 50.00(직선 현), cap 1 ≠ cap 2 (슬라이더가 열린 획에도 먹는다)
[coef]  n=[-1,2,5] mag=[3,2,1] phase=[4.71238898, 3.14159265, 0] ratio=[1, 0.667, 0.333]
[legend] 열린 획이 섞이면 3번째 줄로 sin(πnt) = (e^(iπnt) − e^(−iπnt)) / 2i 가 붙는다
```

---

- [ ] **Step 1: `lib/sheet.test.ts` 작성 — 시트가 계산하는 것 전부를 고정한다**

새 파일 `/Users/yoma/projects/jamcoding/jangyunu/lib/sheet.test.ts`:

```ts
// 시트의 계산은 전부 여기서 고정한다. 컴포넌트에는 계산을 남기지 않는다(§7: jsdom 없음).
// 정확도 문자열(formatAccuracy)은 lib/formatting 소유라 여기서 다시 단언하지 않는다 —
// 이 파일이 검사하는 것은 "시트가 그 함수를 부른다"는 것뿐이고, 평문 복사 테스트가 그것을 본다.

import { describe, expect, it } from "vitest";

import type { CircleAnalysis, StrokeAnalysis } from "@/lib/analysis";
import type { FitStats, Spectrum, Term } from "@/lib/fourier";
import type { Stroke, Symmetry } from "@/lib/geometry";
import type { Metrics } from "@/lib/metrics";
import {
  baseRows, coefficientRows, legendLines, maxTermCount, originalPaths,
  reconstructedPaths, sheetPlainText, termCountOf, termsAtCap
} from "@/lib/sheet";

const STATS: FitStats = { P: 128, arcLength: 60, normS: 20, rmsError: 0.1, maxError: 0.3, accuracy: 0.995, capped: false };

const strokeOf = (id: string, symmetry: Symmetry, rotationCount = 6, closure: Stroke["closure"] = "closed"): Stroke =>
  ({ id, points: [{ x: 20, y: 50 }, { x: 80, y: 50 }], symmetry, rotationCount, closure });

const closed = (terms: Term[]): Spectrum => ({ kind: "closed", c0: { re: 0, im: 0 }, terms, stats: STATS });
// 진폭 내림차순 저장이 fourier 의 계약이다(D-C). 픽스처도 그 순서를 지킨다.
const band = (count: number): Term[] => Array.from({ length: count }, (_, index) => ({ n: index + 1, re: count - index, im: 0 }));

const operatorOf = (symmetry: Symmetry, rotationCount: number) =>
  symmetry === "rotate" ? { kind: "rotate" as const, count: rotationCount }
    : symmetry === "mirrorX" ? { kind: "mirrorX" as const, count: 2 }
      : symmetry === "mirrorY" ? { kind: "mirrorY" as const, count: 2 }
        : { kind: "identity" as const, count: 1 };

const item = (id: string, terms: Term[], symmetry: Symmetry = "free", rotationCount = 6): StrokeAnalysis =>
  ({ stroke: strokeOf(id, symmetry, rotationCount), spectrum: closed(terms), operator: operatorOf(symmetry, rotationCount) });

// 열린 획: z(t) = z₀ + Δt + Σ b_n sin(πnt). 항은 진폭 내림차순(14 → 2).
const openItem = (id: string, symmetry: Symmetry = "free", rotationCount = 6): StrokeAnalysis => ({
  stroke: strokeOf(id, symmetry, rotationCount, "open"),
  spectrum: {
    kind: "open", z0: { re: -30, im: 0 }, delta: { re: 60, im: 0 },
    terms: [{ n: 1, re: 0, im: 14 }, { n: 3, re: 0, im: 2 }], stats: STATS
  },
  operator: operatorOf(symmetry, rotationCount)
});

// point 의 length 는 호길이다. 0 이 아니다(D-E).
const pointItem = (id: string): StrokeAnalysis => ({
  stroke: strokeOf(id, "free", 6, "point"),
  spectrum: { kind: "point", length: 0.4 },
  operator: { kind: "identity", count: 1 }
});

const circleOf = (strokes: StrokeAnalysis[], over: Partial<CircleAnalysis> = {}): CircleAnalysis => ({
  metrics: {} as Metrics, strokes,
  totalTerms: strokes.reduce((sum, one) => sum + termCountOf(one.spectrum), 0),
  accuracy: 0.99, worst: null, uniformSymmetry: null, silhouette: "r(θ) = 30.0", ...over
});

describe("항 수 슬라이더 산술", () => {
  it("획당 상한을 획별로 자른 뒤 합으로 접는다", () => {
    const analysis = circleOf([item("a", band(6)), item("b", band(8)), item("c", band(1)), pointItem("d")]);
    expect(maxTermCount(analysis)).toBe(8);
    expect(termsAtCap(analysis, 1)).toBe(3);
    expect(termsAtCap(analysis, 4)).toBe(9);
    expect(termsAtCap(analysis, 8)).toBe(15);
    expect(termsAtCap(analysis, 999)).toBe(15);
    expect(termsAtCap(analysis, 0)).toBe(0);
    expect(maxTermCount(circleOf([]))).toBe(0);
  });
});

describe("계수표", () => {
  it("진폭 내림차순으로 세우고 위상을 [0,2π)로 정규화한다", () => {
    const rows = coefficientRows(closed([{ n: 5, re: 1, im: 0 }, { n: -1, re: 0, im: -3 }, { n: 2, re: -2, im: 0 }]));
    expect(rows.map((row) => row.n)).toEqual([-1, 2, 5]);
    expect(rows[0].magnitude).toBeCloseTo(3, 12);
    expect(rows[0].phase).toBeCloseTo((3 * Math.PI) / 2, 12);
    expect(rows[1].phase).toBeCloseTo(Math.PI, 12);
    expect(rows[2].phase).toBe(0);
    expect(rows.map((row) => Number(row.ratio.toFixed(3)))).toEqual([1, 0.667, 0.333]);
    expect(coefficientRows({ kind: "point", length: 0.4 })).toEqual([]);
  });

  it("기저 행은 닫힘이 c₀ 하나, 열림이 z₀와 Δ 둘이다", () => {
    const open = openItem("o").spectrum;
    expect(baseRows(closed([])).map((row) => row.label)).toEqual(["c₀"]);
    expect(baseRows(open).map((row) => row.label)).toEqual(["z₀", "Δ"]);
    expect(baseRows(open)[1].magnitude).toBeCloseTo(60, 12);
    expect(baseRows({ kind: "point", length: 0.4 })).toEqual([]);
  });
});

describe("오버레이 경로", () => {
  it("닫힌 획은 복사본을 전부 내고 Z로 닫는다 — 원 1항 + 회전 ×4", () => {
    const analysis = circleOf([item("c", [{ n: 1, re: 30, im: 0 }], "rotate", 4)]);
    const paths = reconstructedPaths(analysis, 1);
    expect(paths).toHaveLength(4);
    expect(new Set(paths.map((path) => path.key)).size).toBe(4);
    expect(paths.every((path) => !path.d.includes("NaN"))).toBe(true);
    expect(paths.every((path) => path.d.endsWith(" Z"))).toBe(true);
    // 점 수는 overlayPointCount(=64)에서 온다. 세그먼트가 63개라는 것이 그 증거다.
    expect(paths[0].d.split(" C").length - 1).toBe(63);
    expect(new Set(paths.map((path) => path.d.slice(0, path.d.indexOf(" C")))))
      .toEqual(new Set(["M80.00 50.00", "M50.00 20.00", "M20.00 50.00", "M50.00 80.00"]));
  });

  it("열린 획도 실제로 그려지고 Z로 닫지 않는다", () => {
    const analysis = circleOf([openItem("o", "mirrorX")]);
    const paths = reconstructedPaths(analysis, 2);
    expect(paths).toHaveLength(2);
    expect(paths.every((path) => path.d.length > 0)).toBe(true);
    expect(paths.some((path) => path.d.endsWith(" Z"))).toBe(false);
    expect(paths.map((path) => path.d.slice(0, path.d.indexOf(" C"))))
      .toEqual(["M20.00 50.00", "M80.00 50.00"]);
    // cap 0 이면 사인 항이 전부 빠져 z₀ + Δt, 즉 y가 전부 50.00 인 직선 현이다.
    const chord = reconstructedPaths(analysis, 0)[0].d;
    expect(new Set([...chord.matchAll(/-?\d+\.\d\d (\d+\.\d\d)/g)].map((match) => match[1]))).toEqual(new Set(["50.00"]));
    // 슬라이더가 열린 획에도 먹는다. 이게 같으면 truncate 의 "open" 분기가 비어 있는 것이다.
    expect(reconstructedPaths(analysis, 1)[0].d).not.toBe(paths[0].d);
  });

  it("퇴화 획은 재구성에서 빠지고 원본에는 남는다", () => {
    const analysis = circleOf([pointItem("p"), item("q", band(2), "mirrorY")]);
    expect(reconstructedPaths(analysis, 2).map((path) => path.strokeIndex)).toEqual([1, 1]);
    expect(originalPaths(analysis)).toHaveLength(3);
    // 원본은 화면과 같은 규칙으로 닫는다(D-A): closed 획만 " Z".
    expect(originalPaths(analysis).map((path) => path.d.endsWith(" Z"))).toEqual([false, true, true]);
  });
});

describe("범례와 복사 문안", () => {
  it("이 마법진이 실제로 쓴 연산자만 적는다", () => {
    expect(legendLines(circleOf([item("a", band(1), "rotate", 6), item("b", band(1))]))[1])
      .toBe("R_k z = e^(2πik/6) z");
    expect(legendLines(circleOf([item("a", band(1), "rotate", 6), item("b", band(1), "rotate", 4), item("c", band(1), "mirrorX")]))[1])
      .toBe("R_k z = e^(2πik/4) z  ·  R_k z = e^(2πik/6) z  ·  M_x z = −z̄");
    expect(legendLines(circleOf([item("a", band(1))]))[1]).toBe("I z = z");
    expect(legendLines(circleOf([]))[1]).toBe("I z = z");
    expect(legendLines(circleOf([]))[0]).toBe("원점 = 캔버스 중심 (50,50) · y축 위쪽이 양수");
  });

  it("열린 획이 있으면 사인이 같은 복소 푸리에임을 병기한다 (R1)", () => {
    expect(legendLines(circleOf([item("a", band(1), "rotate", 6)]))).toHaveLength(2);
    expect(legendLines(circleOf([openItem("o"), item("a", band(1), "rotate", 6)]))).toEqual([
      "원점 = 캔버스 중심 (50,50) · y축 위쪽이 양수",
      "R_k z = e^(2πik/6) z",
      "sin(πnt) = (e^(iπnt) − e^(−iπnt)) / 2i"
    ]);
  });

  it("평문 복사에 좌표 프레임·연산자 정의·획별 식이 들어간다", () => {
    const analysis = circleOf(
      [item("a", band(3), "rotate", 6), openItem("o", "rotate", 6), pointItem("p")],
      { uniformSymmetry: { symmetry: "rotate", count: 6 }, accuracy: 0.9932 }
    );
    expect(sheetPlainText(analysis)).toBe([
      "마법연산자 · 획별 복소 푸리에 분해",
      "원점 = 캔버스 중심 (50,50) · y축 위쪽이 양수",
      "R_k z = e^(2πik/6) z",
      "sin(πnt) = (e^(iπnt) − e^(−iπnt)) / 2i",
      "Z(t) = ⋃(k=0..5) R^k z_j(t)",
      "6겹 회전 · 2획 · 5항으로 재현 · 정확도 99.3%",
      "",
      "획 01 · R₆ · 3항 · 99.5%",
      "z₁(t) = c₀ + Σ c_n e^(2πint)",
      "획 02 · R₆ · 2항 · 99.5%",
      "z₂(t) = z₀ + Δt + Σ b_n sin(πnt)",
      "획 03 · I · 0항 · —",
      "z₃(t) = 상수 · 퇴화 획"
    ].join("\n"));
  });
});
```

- [ ] **Step 2: 실패 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/sheet.test.ts
```

기대 출력 — 모듈이 없어 파일 수집 단계에서 죽는다:

```
 FAIL  lib/sheet.test.ts [ lib/sheet.test.ts ]
Error: Failed to resolve import "@/lib/sheet" from "lib/sheet.test.ts". Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

`@/lib/analysis`·`@/lib/fourier`·`@/lib/formatting`을 못 찾겠다고 나오면 앞 태스크가 끝나지 않은 것이다. 그 경우 이 태스크를 진행하지 않는다.

- [ ] **Step 3: `lib/sheet.ts` 구현**

새 파일 `/Users/yoma/projects/jamcoding/jangyunu/lib/sheet.ts`:

```ts
// FormulaSheet 의 순수 모델. 컴포넌트 테스트를 두지 않기로 했으므로(§7) 시트의 계산은 전부 여기 모인다.
// 여기서 만들지 않는 것 둘: 정확도 문자열(lib/formatting.formatAccuracy 하나뿐이다)과
// 오버레이 점 수(lib/fourier.overlayPointCount 하나뿐이다). 둘 다 다시 만들면 같은 값에 두 답이 생긴다.

import type { CircleAnalysis, OperatorDesc, StrokeAnalysis } from "@/lib/analysis";
import { formatAccuracy, formatOperator, formatStrokeExpr, formatStructure, formatSummarySentence } from "@/lib/formatting";
import { applyOperator, overlayPointCount, reconstruct, truncate, type Spectrum } from "@/lib/fourier";
import { copiesFor, pathFor, strokeCopies } from "@/lib/geometry";

export type SheetPath = { key: string; strokeIndex: number; copy: number; d: string };
export type CoefficientRow = { n: number; magnitude: number; phase: number; ratio: number };
export type BaseRow = { label: string; magnitude: number; phase: number };

export const FRAME_LINE = "원점 = 캔버스 중심 (50,50) · y축 위쪽이 양수";
// 열린 획의 아핀 항 + 사인급수가 승인된 지수급수와 같은 복소 푸리에임을 밝힌다(스펙 §1.5 · R1).
export const SIN_IDENTITY_LINE = "sin(πnt) = (e^(iπnt) − e^(−iπnt)) / 2i";

export const termCountOf = (spectrum: Spectrum): number => spectrum.kind === "point" ? 0 : spectrum.terms.length;

// 퇴화 획은 "실패한 0%"가 아니라 "잰 것이 없음"이다. null 을 그대로 넘겨 formatAccuracy 가 "—"를 찍게 한다(E4).
export const accuracyOf = (item: StrokeAnalysis): number | null =>
  item.spectrum.kind === "point" ? null : item.spectrum.stats.accuracy;

export const isCapped = (item: StrokeAnalysis): boolean =>
  item.spectrum.kind !== "point" && item.spectrum.stats.capped;

export const strokeNumber = (index: number): string => String(index + 1).padStart(2, "0");

// 슬라이더는 획당 상한이다. 전역 예산은 D9가 폐기했고, 전역으로 두면 1항에서 한 획만 살아남아 슬라이더의 교육 가치가 사라진다.
export const maxTermCount = (analysis: CircleAnalysis): number =>
  analysis.strokes.reduce((most, item) => Math.max(most, termCountOf(item.spectrum)), 0);

export const termsAtCap = (analysis: CircleAnalysis, cap: number): number =>
  analysis.strokes.reduce((sum, item) => sum + Math.min(Math.max(0, cap), termCountOf(item.spectrum)), 0);

// operator.count 는 복사본 수다(D-I). 회전에서만 회전 수와 같은 값이라 라벨에 그대로 쓸 수 있다.
export const operatorLabel = (operator: OperatorDesc): string =>
  operator.kind === "rotate" ? `회전 ×${operator.count}`
    : operator.kind === "mirrorX" ? "좌우 대칭"
      : operator.kind === "mirrorY" ? "상하 대칭" : "대칭 없음";

export const legendLines = (analysis: CircleAnalysis): string[] => {
  const operators = analysis.strokes.map((item) => item.operator);
  // 회전 연산자의 지수는 회전 수다. operator.count 는 회전에서 복사본 수 = 회전 수라 그대로 쓴다(D-I).
  const counts = [...new Set(operators.filter((one) => one.kind === "rotate").map((one) => one.count))].sort((a, b) => a - b);
  const parts = counts.map((count) => `R_k z = e^(2πik/${count}) z`);
  if (operators.some((one) => one.kind === "mirrorX")) parts.push("M_x z = −z̄");
  if (operators.some((one) => one.kind === "mirrorY")) parts.push("M_y z = z̄");
  if (!parts.length) parts.push("I z = z");
  const lines = [FRAME_LINE, parts.join("  ·  ")];
  if (analysis.strokes.some((item) => item.spectrum.kind === "open")) lines.push(SIN_IDENTITY_LINE);
  return lines;
};

// 원본은 화면과 같은 진입점(strokeCopies)으로만 그리고, 화면과 같은 규칙으로 닫는다(D-A).
// 여기서 갈라지면 오버레이가 거짓말을 한다 — 모달의 신뢰는 전부 이 겹침에서 나온다(§4.1-a).
export const originalPaths = (analysis: CircleAnalysis): SheetPath[] =>
  analysis.strokes.flatMap((item, strokeIndex) =>
    strokeCopies(item.stroke).map((points, copy) => ({
      key: `${item.stroke.id}-${copy}`, strokeIndex, copy,
      d: pathFor(points, item.stroke.closure === "closed")
    })));

// 대칭 복사본은 계수 위 연산자로 만든다(D10). 복사본을 다시 적합하지 않는다.
// 복사본 수는 strokeCopies 와 같은 copiesFor 에서 나온다(= item.operator.count). 두 블록의 개수와 순서가 어긋나면 겹침이 깨진다.
export const reconstructedPaths = (analysis: CircleAnalysis, cap: number): SheetPath[] =>
  analysis.strokes.flatMap((item, strokeIndex) => {
    if (item.spectrum.kind === "point") return [];
    const cut = truncate(item.spectrum, cap);
    const q = overlayPointCount(cut);
    return Array.from({ length: copiesFor(item.stroke.symmetry, item.stroke.rotationCount) }, (_, copy) => ({
      key: `${item.stroke.id}-${copy}`, strokeIndex, copy,
      d: pathFor(
        reconstruct(applyOperator(cut, item.stroke.symmetry, item.stroke.rotationCount, copy), q),
        item.stroke.closure === "closed"
      )
    }));
  });

// 위상은 [0,2π)로 정규화한다. ±π 근처에서 −3.14와 +3.14가 오가는 깜빡임을 막는다(E15).
const polar = (re: number, im: number) => ({
  magnitude: Math.hypot(re, im),
  phase: (Math.atan2(im, re) + Math.PI * 2) % (Math.PI * 2)
});

// 선택은 진폭 기준(fourier), 표시도 진폭 기준이지만 두 축은 독립이다(§4.3 정정).
// terms 는 이미 진폭 내림차순이지만(D-C) 표시 정렬을 여기서 다시 확정한다 — 표시 규칙이 저장 순서에 매달리지 않게.
export const coefficientRows = (spectrum: Spectrum): CoefficientRow[] => {
  if (spectrum.kind === "point" || !spectrum.terms.length) return [];
  const rows = spectrum.terms.map((term) => ({ n: term.n, ...polar(term.re, term.im) }))
    .sort((a, b) => b.magnitude - a.magnitude || a.n - b.n);
  const top = rows[0].magnitude;
  return rows.map((row) => ({ ...row, ratio: top > 0 ? row.magnitude / top : 0 }));
};

export const baseRows = (spectrum: Spectrum): BaseRow[] => {
  if (spectrum.kind === "point") return [];
  if (spectrum.kind === "closed") return [{ label: "c₀", ...polar(spectrum.c0.re, spectrum.c0.im) }];
  return [{ label: "z₀", ...polar(spectrum.z0.re, spectrum.z0.im) }, { label: "Δ", ...polar(spectrum.delta.re, spectrum.delta.im) }];
};

// 복사 텍스트에 좌표 프레임과 연산자 정의를 반드시 넣는다. 빠지면 이 식은 다른 곳에서 재현 불가능하다(§4.7).
export const sheetPlainText = (analysis: CircleAnalysis): string => {
  const head = [
    "마법연산자 · 획별 복소 푸리에 분해",
    ...legendLines(analysis),
    formatStructure(analysis),
    `${formatSummarySentence(analysis)} · 정확도 ${formatAccuracy(analysis.accuracy)}`
  ];
  // formatOperator 의 두 번째 인자는 회전 수다(D-I). operator.count(복사본 수)를 넣지 않는다.
  const body = analysis.strokes.map((item, index) => [
    `획 ${strokeNumber(index)} · ${formatOperator(item.stroke.symmetry, item.stroke.rotationCount)} · ${termCountOf(item.spectrum)}항 · ${formatAccuracy(accuracyOf(item))}`,
    formatStrokeExpr(item, index)
  ].join("\n"));
  return [...head, "", ...body].join("\n");
};
```

- [ ] **Step 4: 통과 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/sheet.test.ts && npx tsc --noEmit
```

기대 출력:

```
 ✓ lib/sheet.test.ts (9 tests)

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

`tsc`는 아무것도 출력하지 않고 종료 코드 0. (`npm run build`는 돌리지 않는다 — dev 서버가 `.next`를 쓰고 있다.)

- [ ] **Step 5: 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu
git add lib/sheet.ts lib/sheet.test.ts
git commit -m "pure model for formula sheet"
```

`git add -A`를 쓰지 않는다. 작업 트리에 추적 중인 `next-dev.err.log` / `next-dev.out.log` / `tsconfig.tsbuildinfo`가 dev 서버 때문에 계속 더러워져 있어 전부 딸려 들어간다.

---

여기부터(Step 6~9)는 DOM이라 §7이 자동 테스트를 금지한 구간이다. TDD 대신 Step 10의 손 검증 체크리스트가 유일한 검증 장치이므로, **Step 10을 건너뛰고 커밋하지 않는다.**

- [ ] **Step 6: `app/_components/useOverlayShell.ts` — 두 오버레이가 공유하는 껍데기**

새 파일 `/Users/yoma/projects/jamcoding/jangyunu/app/_components/useOverlayShell.ts`:

```ts
"use client";

import { useEffect, useRef, type RefObject } from "react";

// 모듈 스코프 카운터로 잠근다. .magic-card 와 .formula-sheet 는 상호 배타지만
// 닫힘/열림이 한 커밋 안에서 겹치면 저장/복원 순서가 뒤집혀 스크롤이 영구 잠긴다(§4.6).
// Task 11 이 .card-overlay 를 이 훅으로 옮기면 그 경로가 실제로 생긴다.
let locks = 0;

export function useOverlayShell(onClose: () => void): RefObject<HTMLButtonElement | null> {
  const focusRef = useRef<HTMLButtonElement>(null);
  const latest = useRef(onClose);
  useEffect(() => { latest.current = onClose; }, [onClose]);
  // 의존성이 비어 있어야 한다. onClose 를 넣으면 부모가 렌더될 때마다 포커스를 다시 뺏는다.
  useEffect(() => {
    focusRef.current?.focus();
    if (locks === 0) document.body.style.overflow = "hidden";
    locks += 1;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") latest.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      locks -= 1;
      if (locks === 0) document.body.style.overflow = "";
    };
  }, []);
  return focusRef;
}
```

- [ ] **Step 7: `app/_components/FormulaSheet.tsx` — 시트 본체**

새 파일 `/Users/yoma/projects/jamcoding/jangyunu/app/_components/FormulaSheet.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";

import { useOverlayShell } from "@/app/_components/useOverlayShell";
import type { CircleAnalysis } from "@/lib/analysis";
import { formatAccuracy, formatLatex, formatStrokeExpr } from "@/lib/formatting";
import { STROKE_WIDTH } from "@/lib/geometry";
import {
  accuracyOf, baseRows, coefficientRows, isCapped, legendLines, maxTermCount, operatorLabel,
  originalPaths, reconstructedPaths, sheetPlainText, strokeNumber, termCountOf, termsAtCap
} from "@/lib/sheet";

const TARGET = 0.99;

export default function FormulaSheet({ analysis, onClose }: { analysis: CircleAnalysis; onClose: () => void }) {
  const maxTerms = maxTermCount(analysis);
  // 시트는 열릴 때만 마운트되므로 초기값이 곧 "자동 결정된 항 수"다. 동기화 effect가 필요 없다.
  const [cap, setCap] = useState(Math.max(1, maxTerms));
  const [focus, setFocus] = useState<number | null>(null);
  const [format, setFormat] = useState<"plain" | "latex">("plain");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const closeRef = useOverlayShell(onClose);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const originals = useMemo(() => originalPaths(analysis), [analysis]);
  // 슬라이더를 움직여도 변환은 다시 돌지 않는다. truncate + reconstruct 만 재실행된다(§5.3).
  const reconstructed = useMemo(() => reconstructedPaths(analysis, cap), [analysis, cap]);
  const legend = useMemo(() => legendLines(analysis), [analysis]);
  const capped = analysis.strokes.some(isCapped);
  // accuracy 는 number | null 이다. null(유효 획 0)은 달성이 아니라 "없음"이다(E4).
  const achieved = !capped && analysis.accuracy !== null && analysis.accuracy >= TARGET;
  const worst = analysis.worst;

  const jumpTo = (index: number) => {
    setFocus(index);
    itemRefs.current[index]?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const copy = async () => {
    const text = format === "latex" ? formatLatex(analysis) : sheetPlainText(analysis);
    // 모달은 복사의 의도된 목적지다. 조용히 return 하지 않는다(§4.7).
    try { await navigator.clipboard.writeText(text); setCopyState("copied"); }
    catch { setCopyState("failed"); }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState("idle"), 1800);
  };

  return <div className="card-overlay" onClick={onClose}>
    <section className="formula-sheet" role="dialog" aria-modal="true" aria-labelledby="formula-sheet-title" onClick={(event) => event.stopPropagation()}>
      <button className="sheet-close" ref={closeRef} onClick={onClose} aria-label="닫기">✕</button>

      <header className="sheet-head">
        <small>FOURIER DECOMPOSITION</small>
        <h2 id="formula-sheet-title">마법진의 식</h2>
        <p className="sheet-headline">
          <b>{analysis.totalTerms}</b>항으로 재현
          <span className={achieved ? "sheet-badge" : "sheet-badge miss"}>{formatAccuracy(analysis.accuracy)}{achieved ? " ✓" : ""}</span>
        </p>
        {worst && <button className="sheet-worst" onClick={() => jumpTo(worst.index)}>최저 획 {strokeNumber(worst.index)} · {formatAccuracy(worst.accuracy)}</button>}
      </header>

      <figure className="sheet-overlay">
        <svg viewBox="0 0 100 100" aria-label="원본 획 위에 재구성 곡선을 겹쳐 그린 그림">
          {originals.map((path) => <path key={`o-${path.key}`} className="sheet-original" d={path.d} style={{ strokeWidth: STROKE_WIDTH }} />)}
          {reconstructed.map((path) => <path key={`r-${path.key}`} className="sheet-recon" d={path.d} style={{ strokeWidth: STROKE_WIDTH }} />)}
        </svg>
        <figcaption>원본 획 위에 식이 그린 곡선을 겹쳤습니다</figcaption>
      </figure>

      {maxTerms > 0
        ? <div className="sheet-slider">
            <label htmlFor="sheet-terms">항 수</label>
            <span>1</span>
            <input id="sheet-terms" type="range" min={1} max={maxTerms} step={1} value={cap} onChange={(event) => setCap(Number(event.target.value))} />
            <span>{maxTerms}</span>
            <b>획당 최대 {cap}항 · 합계 {termsAtCap(analysis, cap)}항</b>
          </div>
        : <p className="sheet-slider empty">직선만으로 이루어진 마법진이라 항이 필요 없습니다</p>}

      <div className="sheet-legend">{legend.map((line) => <span key={line}>{line}</span>)}</div>

      <div className="sheet-body">
        <div className="sheet-map">
          <svg viewBox="0 0 100 100" className={focus === null ? undefined : "focused"} aria-hidden="true">
            {originals.map((path) => <path key={path.key} className={focus === path.strokeIndex ? "map-path on" : "map-path"} d={path.d} style={{ strokeWidth: STROKE_WIDTH }} />)}
          </svg>
        </div>
        <ol className="sheet-list">
          {analysis.strokes.map((item, index) => {
            const rows = coefficientRows(item.spectrum);
            const value = accuracyOf(item);
            const reached = !isCapped(item) && value !== null && value >= TARGET;
            return <li key={item.stroke.id} ref={(node) => { itemRefs.current[index] = node; }}
              className={focus === index ? "sheet-item on" : "sheet-item"} tabIndex={0}
              onMouseEnter={() => setFocus(index)} onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(index)} onBlur={() => setFocus(null)}
              onClick={() => setFocus((current) => current === index ? null : index)}>
              <p className="sheet-item-head">
                획 {strokeNumber(index)}
                <i>{operatorLabel(item.operator)}</i>
                <i>{termCountOf(item.spectrum)}항</i>
                <em className={reached ? undefined : "miss"}>{formatAccuracy(value)}{reached ? " ✓" : ""}</em>
              </p>
              <code className="sheet-expr">{formatStrokeExpr(item, index)}</code>
              {isCapped(item) && <p className="sheet-note">이 획은 너무 복잡해서 여기까지 적었습니다</p>}
              {rows.length > 0 && <details className="sheet-coef" open={analysis.strokes.length === 1}>
                <summary onClick={(event) => event.stopPropagation()}>계수 {rows.length}개 보기 <i>고급</i></summary>
                <table className="sheet-table">
                  <thead><tr><th scope="col">n</th><th scope="col">|c_n|</th><th scope="col">arg c_n</th><th scope="col" /></tr></thead>
                  <tbody>
                    {baseRows(item.spectrum).map((row) => <tr key={row.label} className="base">
                      <th scope="row">{row.label}</th><td>{row.magnitude.toFixed(2)}</td><td>{row.phase.toFixed(2)}</td><td />
                    </tr>)}
                    {rows.map((row) => <tr key={row.n}>
                      <th scope="row">{row.n}</th><td>{row.magnitude.toFixed(2)}</td><td>{row.phase.toFixed(2)}</td>
                      <td><i style={{ width: `${Math.round(row.ratio * 100)}%` }} /></td>
                    </tr>)}
                  </tbody>
                </table>
              </details>}
            </li>;
          })}
        </ol>
      </div>

      {analysis.silhouette && <p className="sheet-silhouette"><span>외곽 실루엣 (참고)</span><code>{analysis.silhouette}</code></p>}

      <footer className="sheet-actions">
        <div className="sheet-format" role="group" aria-label="복사 형식">
          <button className={format === "plain" ? "on" : undefined} onClick={() => setFormat("plain")}>평문</button>
          <button className={format === "latex" ? "on" : undefined} onClick={() => setFormat("latex")}>LaTeX</button>
        </div>
        <button className="sheet-copy" onClick={copy}>{copyState === "copied" ? "복사됨" : copyState === "failed" ? "복사 실패" : "식 복사"}</button>
      </footer>
    </section>
  </div>;
}
```

- [ ] **Step 8: `app/globals.css` — `.formula-sheet` 계열 추가**

`/Users/yoma/projects/jamcoding/jangyunu/app/globals.css`의 마지막 줄(`.share-circle:disabled{opacity:.5}`) **뒤에** 아래를 붙인다. 기존 줄은 하나도 고치지 않는다(푸터·`.open-formula` 규칙은 Task 9가 이미 넣었으므로 여기서 다시 쓰지 않는다). `.magic-card`에서 금테(`1px solid #c9b16b` + 이중 링 `0 0 0 6px #19221f,0 0 0 7px #ad9158`)만 승계하고 방사형 그라디언트는 빼서 평평한 스테이지 배경(`#172321`)으로 간다 — 수집품이 아니라 계측 결과라는 위계다.

```css

.formula-sheet{position:relative;width:min(780px,100%);max-height:min(88vh,760px);overflow-y:auto;padding:26px 26px 22px;text-align:left;color:#e6e2d4;background:#172321;border:1px solid #c9b16b;box-shadow:0 0 0 6px #19221f,0 0 0 7px #ad9158}
.dark .formula-sheet{background:#19121f}
.sheet-close{position:absolute;top:14px;right:14px;width:28px;height:28px;line-height:1;border:1px solid #4a5a52;background:transparent;color:#b7c1b5}
.sheet-head small{font:10px 'DM Mono';letter-spacing:.14em;color:#cbb37a}
.sheet-head h2{margin:6px 0 14px;font:600 25px 'Playfair Display'}
.sheet-headline{margin:0;font-size:13px;color:#b7c1b5}
.sheet-headline b{margin-right:5px;font:700 34px/1 'Playfair Display';color:#f2e8d2}
.sheet-badge{display:inline-block;margin-left:12px;padding:4px 10px;border:1px solid #4a5a52;background:#20302c;color:var(--accent);font:11px 'DM Mono';letter-spacing:.06em}
.sheet-badge.miss{opacity:.45}
.sheet-worst{margin-top:9px;padding:0 0 2px;border:0;border-bottom:1px dotted #7d8b80;background:transparent;color:#9aa79c;font:10px 'DM Mono';letter-spacing:.06em;cursor:pointer}
.sheet-overlay{margin:16px 0 0;text-align:center}
.sheet-overlay svg{width:min(320px,100%);aspect-ratio:1;background:radial-gradient(circle at 50% 50%,#20302c 0,#101817 72%);border:1px solid #3a4a44}
.sheet-overlay figcaption{margin-top:7px;color:#8e9a91;font-size:10px}
.sheet-original,.map-path{fill:none;stroke:var(--accent);stroke:url(#arcana-gradient) var(--accent);stroke-linecap:round;stroke-linejoin:round}
.sheet-recon{fill:none;stroke:#f4ecd4;opacity:.62;stroke-linecap:round;stroke-linejoin:round}
.sheet-slider{display:flex;align-items:center;gap:9px;margin-top:15px;padding:11px 12px;background:#1d2b28;border:1px solid #33443e;color:#9aa79c;font:10px 'DM Mono';letter-spacing:.06em}
.sheet-slider input{flex:1;accent-color:var(--accent)}
.sheet-slider b{color:#e6e2d4;font-weight:400;white-space:nowrap}
.sheet-slider.empty{display:block;margin:15px 0 0;color:#8e9a91}
.sheet-legend{margin-top:12px;padding:10px 12px;background:#141e1c;border-left:2px solid #ad9158}
.sheet-legend span{display:block;font:10px/1.7 'DM Mono';color:#a8b3a8;word-break:break-word}
.sheet-body{display:grid;grid-template-columns:240px 1fr;gap:18px;align-items:start;margin-top:16px}
.sheet-map{position:sticky;top:0}
.sheet-map svg{width:100%;aspect-ratio:1;background:#101817;border:1px solid #3a4a44}
.map-path{transition:opacity .18s}
.sheet-map svg.focused .map-path{opacity:.18}
.sheet-map svg.focused .map-path.on{opacity:1}
.sheet-list{margin:0;padding:0;list-style:none}
.sheet-item{padding:11px 12px;background:#16211f;border:1px solid #2c3b36;border-bottom:0;outline:0}
.sheet-item:last-child{border-bottom:1px solid #2c3b36}
.sheet-item.on{background:#1d2b28;border-color:#4a5a52}
.sheet-item-head{display:flex;align-items:baseline;gap:8px;margin:0;color:#e6e2d4;font:11px 'DM Mono';letter-spacing:.06em}
.sheet-item-head i{font-style:normal;color:#8e9a91}
.sheet-item-head em{margin-left:auto;font-style:normal;color:var(--accent)}
.sheet-item-head em.miss{opacity:.45}
.sheet-expr{display:block;margin-top:6px;color:#cfd6cc;font:11px/1.6 'DM Mono';word-break:break-all}
.sheet-note{margin:6px 0 0;color:#c9b16b;font-size:10px}
.sheet-coef{margin-top:7px}
.sheet-coef summary{color:#8e9a91;font-size:10px;cursor:pointer}
.sheet-coef summary i{font-style:normal;color:#6f7d73}
.sheet-table{width:100%;margin-top:6px;border-collapse:collapse;color:#b7c1b5;font:10px 'DM Mono';font-variant-numeric:tabular-nums}
.sheet-table th,.sheet-table td{padding:3px 5px;text-align:right;font-weight:400;border-bottom:1px solid #26332f}
.sheet-table thead th{color:#7f8c82}
.sheet-table tr.base th,.sheet-table tr.base td{color:#8e9a91}
.sheet-table td:last-child{width:34%}
.sheet-table td i{display:block;height:4px;background:var(--accent-gradient)}
.sheet-silhouette{display:flex;align-items:baseline;gap:10px;margin:16px 0 0;padding-top:12px;border-top:1px solid #2c3b36}
.sheet-silhouette span{flex:none;color:#7f8c82;font:9px 'DM Mono';letter-spacing:.1em}
.sheet-silhouette code{color:#9aa79c;font:10px/1.6 'DM Mono';word-break:break-all}
.sheet-actions{display:flex;gap:8px;margin-top:14px}
.sheet-format{display:flex;gap:4px}
.sheet-format button{padding:8px 12px;border:1px solid #4a5a52;background:transparent;color:#b7c1b5;font:10px 'DM Mono';letter-spacing:.08em}
.sheet-format button.on{background:#e9e3d7;color:#1d2422;border-color:#e9e3d7}
.sheet-copy{margin-left:auto;padding:8px 18px;border:1px solid #c9b16b;background:#20302c;color:#f2e8d2;font:10px 'DM Mono';letter-spacing:.08em}
@media(max-width:700px){.formula-sheet{padding:20px 16px 16px}.sheet-body{grid-template-columns:1fr}.sheet-map{position:sticky;top:-1px;z-index:2;padding:6px 0 8px;background:#172321;border-bottom:1px solid #2c3b36}.dark .sheet-map{background:#19121f}.sheet-map svg{display:block;width:150px;margin:auto}}
```

두 가지가 의도된 선택이다. (1) `stroke`를 두 번 선언하는 것은 폴백이다 — 앞줄이 단색 accent, 뒷줄이 페인트 폴백 문법(`url(#id) <color>`)이고, `#arcana-gradient`는 `page.tsx` 캔버스의 `<defs>`에 있다. 오버레이가 열려 있는 동안 캔버스는 계속 마운트돼 있으므로 문서 스코프 참조가 산다. (2) `.sheet-map`의 sticky 기준 스크롤 컨테이너는 `.formula-sheet` 자신이다.

- [ ] **Step 9: `app/page.tsx` 연결 — 헬퍼 두 개와 상호 배타**

Task 9가 이미 `formulaOpen` 상태와 푸터 버튼(`disabled={!hasFormula}` + aria)을 만들어 두었다. **`formulaOpen`을 다시 선언하지 않고, `disabled`와 aria 속성을 지우지 않는다** — 다시 선언하면 TS2451이고, `!strokes.length`로 되돌리면 "전부 퇴화 획"인 경우를 놓친다(E4).

앵커로 찾아 네 곳을 고친다.

**(1)** import 블록 끝(`import { encodeShare } from "@/lib/share";` 아래)에 추가:

```tsx
import FormulaSheet from "@/app/_components/FormulaSheet";
```

**(2)** Task 9가 넣은 `const [formulaOpen, setFormulaOpen] = useState(false);` **바로 아래**에 헬퍼 두 개만 추가한다(상태 선언은 그대로 둔다):

```tsx
  // 두 오버레이는 상호 배타다. 한쪽을 열면 다른 쪽을 닫는다(§4.3).
  // Task 11 의 카드 뒷면 「전체 식 보기」가 openFormula 를 그대로 호출한다(§4.5).
  const openFormula = () => { setCardOpen(false); setFormulaOpen(true); };
  const openCard = () => { setFormulaOpen(false); setCardOpen(true); };
```

**(3)** 푸터 「식 보기」 버튼의 핸들러만 바꾼다. `.stage-footer` 줄 안의 정확히 이 조각

```tsx
onClick={() => setFormulaOpen(true)}
```

을

```tsx
onClick={openFormula}
```

으로 바꾼다. **같은 버튼의 `className="open-formula"` · `disabled={!hasFormula}` · `aria-haspopup="dialog"` · `aria-expanded={formulaOpen}`는 한 글자도 건드리지 않는다.**

**(4)** 「마법진 완성」 버튼(`className="finish"`)의

```tsx
onClick={() => setCardOpen(true)}
```

을

```tsx
onClick={openCard}
```

으로 바꾸고, `{cardOpen && <div className="card-overlay" …>}` 블록 **뒤**, `</main>` **앞**에 한 줄 추가한다:

```tsx
    {formulaOpen && <FormulaSheet analysis={analysis} onClose={() => setFormulaOpen(false)} />}
```

- [ ] **Step 10: 타입 검사와 손 검증**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit && npx vitest run
```

기대 출력: `tsc`는 아무것도 출력하지 않고 종료 코드 0. `vitest run`은 Task 1~9가 만든 스위트까지 **전부 통과**한다(이 태스크는 `lib/sheet.test.ts` 9개를 더한다). `npm run build`는 돌리지 않는다 — dev 서버가 `.next`를 쓰고 있다.

그다음 `npm run dev`가 띄운 http://localhost:3000 에서 확인한다. 컴포넌트 테스트가 없으므로 이 체크리스트가 유일한 검증이다.

1. 회전 6으로 원을 하나 그리고 「식 보기」 → 시트가 열리고 오버레이의 파치먼트색 곡선이 그라디언트 획을 **정확히 덮는다**. 슬라이더는 `[1 ─●─ 1]`이고 옆에 `획당 최대 1항 · 합계 1항`.
2. **직선을 하나 그린다(열린 획)** → 재구성 곡선이 원본 위에 그려진다. **빈 화면이면 Task 5의 `reconstruct`/`truncate` "open" 분기가 비어 있는 것이다**(D-K). 이어서 물결 모양 열린 획을 추가하고 슬라이더를 1까지 내리면 물결이 완만해지고, 0으로는 내려가지 않는다(슬라이더 최솟값 1).
3. 열린 획이 하나라도 있으면 범례가 **3줄**이 되고 셋째 줄이 `sin(πnt) = (e^(iπnt) − e^(−iπnt)) / 2i`다. 닫힌 획만 있으면 2줄이다.
4. 별 모양 닫힌 획을 추가하고 슬라이더를 1까지 내린다 → 별의 재구성이 원으로 뭉개지고, 밀어 올리면 뾰족해진다. 이때 **원본 획은 미동도 하지 않는다**(슬라이더가 저장 상태를 바꾸지 않는다는 Q2의 증거). 닫힌 획의 재구성 곡선은 시작점과 끝점이 이어져 있다(`Z`로 닫힌다).
5. 획 목록의 정확도 표기가 **푸터의 정확도와 같은 글자 규칙**이다(같은 `formatAccuracy`). 직선만 그린 마법진이면 획 항목이 `0항 · 100% ✓`이고 슬라이더 자리에 `직선만으로 이루어진 마법진이라 항이 필요 없습니다`.
6. 점만 찍어 만든 퇴화 획을 섞으면 그 획의 정확도 칸이 `0.0%`가 아니라 `—`이고, 오버레이에서 그 획의 재구성 곡선만 빠진다(원본은 남는다).
7. 획 목록 항목에 마우스를 올리면 미니맵에서 그 획의 **모든 복사본만** 진하고 나머지는 흐려진다. Tab으로 이동해도 같다. 터치(반응형 도구)에서는 탭으로 토글된다.
8. Escape로 닫힌다. 열려 있는 동안 뒤 페이지가 스크롤되지 않고, 닫으면 스크롤이 돌아온다. 시트 바깥 어두운 영역을 클릭하면 닫히고, 시트 안을 클릭하면 닫히지 않는다.
9. 「마법진 완성」으로 카드를 연 뒤 카드를 닫고 「식 보기」 → 두 오버레이가 동시에 뜨지 않는다. 획을 전부 지우면 「식 보기」가 `opacity .35`로 눌리지 않는다(Task 9의 `hasFormula`가 살아 있다는 증거).
10. 「평문」/「LaTeX」을 각각 골라 「식 복사」 → 버튼이 `복사됨`으로 바뀌고, 붙여넣은 평문 첫 줄들에 `원점 = 캔버스 중심 (50,50) · y축 위쪽이 양수`와 `R_k z = e^(2πik/6) z`가 들어 있다.
11. 창을 700px 아래로 줄이면 미니맵이 상단 스트립으로 올라가고 목록이 그 아래 한 단으로 선다. 가로 스크롤이 생기지 않는다.
12. 브라우저 콘솔에 경고 0건. 특히 `NaN`이 들어간 `d` 속성 경고가 없어야 한다.

- [ ] **Step 11: 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu
git add app/_components/FormulaSheet.tsx app/_components/useOverlayShell.ts app/globals.css app/page.tsx
git commit -m "formula sheet with reconstruction overlay"
```

---

**이 태스크가 하지 않는 것 (다른 태스크 소관이므로 여기서 손대면 충돌한다).**

- 카드 뒷면 `<dt>구조식</dt>`·`<dt>분해</dt>`, 「전체 식 보기」 버튼, `app/_components/ArcanaCard.tsx` 추출, `.card-overlay`의 `useOverlayShell` 이관 → **Task 11**. 이 태스크는 그 태스크가 쓸 `openFormula`와 `useOverlayShell`을 남겨 둘 뿐이다.
- 푸터 문안·`.footer-*` CSS·`formatAccuracy` 정의·analysis 패널 항 수 칸 → **Task 9**.
- `truncate`/`reconstruct`의 `"open"` 분기 → **Task 5**(D-K). Step 10-2가 그 구현을 화면에서 확인하는 지점이다.

---

### Task 11: ArcanaCard 추출 — 카드 뒷면 구조식·분해와 「전체 식 보기」 진입 경로

**Files:**
- Create: `/Users/yoma/projects/jamcoding/jangyunu/app/_components/ArcanaCard.tsx`
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/formatting.ts` — 파일 끝에 `formatDecomposition` 추가
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/lib/formatting.test.ts` — import 줄 한 곳 + 파일 끝에 `describe("formatDecomposition", …)` 추가
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/globals.css` — **파일 맨 끝에 추가**(Task 10이 붙인 `@media(max-width:700px){.formula-sheet…}` 줄 **뒤**). 기존 줄은 한 글자도 고치지 않는다 — 7행의 `.card-*` 규칙들은 그대로 두고 뒤에서 덮어쓴다
- Modify: `/Users/yoma/projects/jamcoding/jangyunu/app/page.tsx` — 2곳. import 블록 한 줄 추가, `{cardOpen && <div className="card-overlay" …>}` 한 줄을 `<ArcanaCard …/>`로 교체

**이 태스크는 계획의 마지막이다.** Task 10의 `useOverlayShell`·`openFormula`·`openCard`, Task 9의 `hasFormula`·`formatAccuracy`, Task 8의 `formatStructure`, Task 7의 `analysis`가 전부 있어야 시작할 수 있다.

컴포넌트 테스트는 §7이 금지했으므로(jsdom 없음), 이 태스크에서 **테스트로 지킬 수 있는 것은 카드 뒷면에 찍히는 문자열 하나뿐**이다. 그래서 그 한 줄(`7획 · 43항 · 99.0%`)을 `lib/formatting.ts`로 내리고 나머지(마크업 이동·훅 이관)는 Step 10의 손 검증 체크리스트로 받는다. 이것이 이 태스크가 formatting에 함수를 하나 더 추가하는 유일한 이유다.

**Interfaces:**

Consumes (앞 태스크 산출물. 시그니처가 다르면 이 태스크를 시작하지 않는다):
```ts
// @/lib/analysis  (Task 7)
type CircleAnalysis = {
  metrics: Metrics; strokes: StrokeAnalysis[]; totalTerms: number;
  accuracy: number | null; worst: { index: number; accuracy: number } | null;
  uniformSymmetry: { symmetry: Symmetry; count: number } | null; silhouette: string
}
// StrokeAnalysis.spectrum.kind === "point" 인 획이 퇴화 획이다

// @/lib/formatting  (Task 8)
formatStructure(analysis: CircleAnalysis): string   // "Z(t) = ⋃(k=0..5) R^k z_j(t)" | "Z(t) = ⋃_j S_j[z_j(t)]" | "Z(t) = ∅"
formatSummarySentence(analysis: CircleAnalysis): string
// @/lib/formatting  (Task 9)
formatAccuracy(accuracy: number | null): string     // null → "—", 1 → "100%", 그 외 소수 한 자리 내림 + 99.9% 클램프

// @/app/_components/useOverlayShell  (Task 10)
useOverlayShell(onClose: () => void): RefObject<HTMLButtonElement | null>
//   Escape 닫기 + 반환 ref 에 포커스 + 모듈 스코프 카운터로 body 스크롤 잠금

// app/page.tsx  (Task 9 · Task 10 이 이미 선언해 둔 것 — 다시 선언하지 않는다)
const analysis: CircleAnalysis
const hasFormula: boolean                            // analysis.strokes.some(i => i.spectrum.kind !== "point")
const openFormula: () => void                        // setCardOpen(false); setFormulaOpen(true)
const openCard: () => void                           // setFormulaOpen(false); setCardOpen(true)
const shareCircle: () => Promise<void>
const shareState: "idle" | "working" | "copied" | "failed"
const ability / attributeLabel / attributeGlyphs / description: string
```

Produces:
```ts
// @/lib/formatting
formatDecomposition(analysis: CircleAnalysis): string   // "3획 · 43항 · 99.0%" | 유효 획 0이면 "—"

// @/app/_components/ArcanaCard  (default export)
export default function ArcanaCard(props: {
  ability: string; attributeLabel: string; attributeGlyphs: string; description: string;
  analysis: CircleAnalysis; hasFormula: boolean;
  shareState: "idle" | "working" | "copied" | "failed";
  onShare: () => void; onClose: () => void; onOpenFormula: () => void;
}): JSX.Element

// app/globals.css: .card-close, .card-open-formula, .card-back 여백 재정의
```

**이 태스크에서 확정한 세 가지:**

1. **「N획」은 유효 획 수다.** `formatSummarySentence`가 퇴화 획을 획 수에서 빼므로(Task 8), 카드가 `analysis.strokes.length`를 쓰면 같은 그림에 대해 푸터는 `3획`, 카드는 `4획`이 된다. Step 1의 세 번째 테스트가 이 일치를 못 박는다.
2. **뒤집기를 `classList.toggle`에서 React 상태로 바꾼다.** 뒷면에 버튼이 생겼으므로 "지금 어느 면인가"를 렌더가 알아야 한다 — `backface-visibility:hidden`은 눈에서만 지우고 Tab 순서에서는 지우지 않아서, 상태 없이는 보이지 않는 「전체 식 보기」로 포커스가 들어간다. 숨은 면에 `inert`를 건다(`@types/react` 19.0.8이 `inert?: boolean`을 지원한다 — 실제 파일에서 확인함).
3. **카드에 닫기 버튼을 만든다.** `useOverlayShell`은 마운트 시 반환 ref에 포커스하는데 현재 `.card-overlay`에는 포커스할 버튼이 없다. 스펙 §4.6의 "오픈 시 닫기 버튼에 포커스"를 만족시키려면 버튼이 존재해야 한다. `.magic-card` **바깥**(오버레이 직속, `position:absolute`)에 둔다 — 안에 두면 뒤집힐 때 같이 거울에 비친다.

---

- [ ] **Step 1: 실패하는 테스트 — `formatDecomposition`**

`/Users/yoma/projects/jamcoding/jangyunu/lib/formatting.test.ts`의 formatting import 줄을 아래로 바꾼다(Task 9가 `formatAccuracy`를 넣어 둔 그 줄이다).

```ts
import { formatAccuracy, formatDecomposition, formatLatex, formatOperator, formatStrokeExpr, formatStructure, formatSummarySentence } from "@/lib/formatting";
```

그리고 파일 **끝**에 아래 블록을 붙인다. 픽스처(`EMPTY`/`SINGLE`/`MIRRORED`/`MIXED`/`DEGENERATE`/`ALL_DEGENERATE`)는 Task 8이 파일 상단에 만들어 둔 것을 그대로 쓴다.

```ts
// 카드 뒷면의 <dd>분해</dd> 한 줄. 카드는 수집품이라 계수를 싣지 않는다(§4.5) —
// 이 줄이 카드가 식에 대해 말하는 전부다.
describe("formatDecomposition", () => {
  it("유효 획이 없으면 0획이 아니라 —", () => {
    expect(formatDecomposition(EMPTY)).toBe("—");
    expect(formatDecomposition(ALL_DEGENERATE)).toBe("—");
  });

  it("퇴화 획을 뺀 획 수 · 항 수 · 정확도를 한 줄로 적는다", () => {
    expect(formatDecomposition(SINGLE)).toBe("1획 · 1항 · 99.9%");
    expect(formatDecomposition(MIXED)).toBe("3획 · 3항 · 99.3%");
    expect(formatDecomposition(DEGENERATE)).toBe("1획 · 0항 · 100%");
  });

  // 푸터(문장)와 카드(숫자)가 같은 그림에 대해 다른 획 수를 말하면 둘 다 신뢰를 잃는다.
  it("푸터 요약 문장과 획 수가 어긋나지 않는다", () => {
    for (const one of [SINGLE, MIRRORED, MIXED, DEGENERATE]) {
      const count = formatDecomposition(one).split(" · ")[0];
      expect(formatSummarySentence(one)).toContain(`· ${count} ·`);
    }
  });
});
```

기대값 근거(scratchpad에서 실행해 확인함 — `formatAccuracy` 확정 구현 + Task 8 픽스처):
```
EMPTY "—"  ALL_DEGENERATE "—"
SINGLE "1획 · 1항 · 99.9%"   (accuracy 0.9999 → 99.9%)
MIRRORED "1획 · 2항 · 99.2%" (accuracy 0.9921)
MIXED "3획 · 3항 · 99.3%"    (accuracy 0.9932)
DEGENERATE "1획 · 0항 · 100%" (accuracy 1 — 직선만 남아 잔차가 정확히 0)
```

- [ ] **Step 2: 실패 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/formatting.test.ts
```

기대 출력 — 앞선 케이스는 그대로 초록이고 이 태스크가 추가한 3건만 붉다:
```
 ❯ lib/formatting.test.ts (N tests | 3 failed)
     × formatDecomposition > 유효 획이 없으면 0획이 아니라 —
     × formatDecomposition > 퇴화 획을 뺀 획 수 · 항 수 · 정확도를 한 줄로 적는다
     × formatDecomposition > 푸터 요약 문장과 획 수가 어긋나지 않는다

TypeError: formatDecomposition is not a function
```

`SyntaxError … does not provide an export named`이 아니라 `TypeError: … is not a function`이 나오는 것이 정상이다(Vitest의 SSR 변환이 named import를 프로퍼티 접근으로 바꾼다). `Cannot find module "@/lib/formatting"`이 나오면 Task 1의 `vitest.config.ts` 별칭이 없는 것이므로 이 태스크를 진행하지 않는다.

- [ ] **Step 3: 최소 구현**

`/Users/yoma/projects/jamcoding/jangyunu/lib/formatting.ts` **끝**에 추가한다. `formatAccuracy`는 Task 9가 이 파일에 이미 만들어 두었으므로 다시 만들지 않고 호출만 한다(앱 전체에서 정확도를 문자열로 만드는 함수는 그것 하나다).

```ts
// 카드 뒷면 <dt>분해</dt> 의 값. 퇴화 획은 획 수에서 뺀다 — formatSummarySentence 와 같은 셈법이라
// 푸터의 "3획"과 카드의 "3획"이 같은 수를 가리킨다.
export const formatDecomposition = (analysis: CircleAnalysis): string => {
  const live = analysis.strokes.filter((item) => item.spectrum.kind !== "point").length;
  if (!live) return "—";
  return `${live}획 · ${analysis.totalTerms}항 · ${formatAccuracy(analysis.accuracy)}`;
};
```

- [ ] **Step 4: 통과 확인**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx vitest run lib/formatting.test.ts && npx tsc --noEmit
```

`lib/formatting.test.ts`가 전부 통과하고(이 태스크가 더한 3건 포함), `tsc`는 아무것도 출력하지 않고 종료 코드 0.

- [ ] **Step 5: 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu
git status -sb
git add lib/formatting.ts lib/formatting.test.ts
git commit -m "add card decomposition line"
```

`git add -A`를 쓰지 않는다 — 추적 중인 `next-dev.err.log` / `next-dev.out.log` / `tsconfig.tsbuildinfo`가 dev 서버 때문에 계속 더러워져 있다.

- [ ] **Step 6: 옮길 마크업의 앵커를 확정한다**

카드는 `app/page.tsx`에서 **한 물리적 줄**이다(현재 171행). Task 7~10이 그 줄 안쪽을 고쳤을 뿐 줄을 쪼개지 않았다. 옮기기 전에 위치와 개수를 확인한다.

```
cd /Users/yoma/projects/jamcoding/jangyunu
grep -c 'cardOpen && <div className="card-overlay"' app/page.tsx
grep -n 'className="card-overlay"' app/page.tsx
grep -o '<dt>[^<]*</dt>' app/page.tsx
```

기대: 첫 명령이 `1`. 두 번째가 한 줄만(FormulaSheet는 자기 파일 안에 있으므로 `page.tsx`에는 `.card-overlay`가 이 한 곳뿐이다). 세 번째가 `<dt>속성</dt>` / `<dt>외곽 실루엣</dt>`(또는 `<dt>극좌표식</dt>`) / `<dt>복잡도</dt>` / `<dt>등급</dt>` 네 개.

세 번째의 두 번째 항목이 어느 라벨이든 상관없다 — Task 7은 `Metrics`에서 `formula`를 떼면서 그 자리의 값만 `analysis.silhouette`로 갈아끼웠고(카드 뒷면 **설계**는 이 태스크 몫이다), Step 9에서 그 행 자체가 사라진다. 실루엣은 카드가 아니라 `FormulaSheet`의 `.sheet-silhouette`가 맡는다(§4.5: 카드는 수집품, 시트는 계측 결과).

첫 명령이 `0`이면 Task 10 Step 9가 끝나지 않은 것이고, `2` 이상이면 다른 태스크가 카드를 복제한 것이다. 둘 다 이 태스크를 진행하지 않는다.

- [ ] **Step 7: `app/_components/ArcanaCard.tsx` 생성**

새 파일 `/Users/yoma/projects/jamcoding/jangyunu/app/_components/ArcanaCard.tsx`:

```tsx
"use client";

import { useState } from "react";

import { useOverlayShell } from "@/app/_components/useOverlayShell";
import type { CircleAnalysis } from "@/lib/analysis";
import { formatDecomposition, formatStructure } from "@/lib/formatting";

export default function ArcanaCard({
  ability, attributeLabel, attributeGlyphs, description,
  analysis, hasFormula, shareState, onShare, onClose, onOpenFormula
}: {
  ability: string;
  attributeLabel: string;
  attributeGlyphs: string;
  description: string;
  analysis: CircleAnalysis;
  hasFormula: boolean;
  shareState: "idle" | "working" | "copied" | "failed";
  onShare: () => void;
  onClose: () => void;
  onOpenFormula: () => void;
}) {
  // 뒤집힘을 classList.toggle 대신 상태로 든다. 뒷면에 버튼이 생겼으므로 "지금 어느 면인가"를
  // 렌더가 알아야 숨은 면의 포커스를 막을 수 있다.
  const [flipped, setFlipped] = useState(false);
  // Escape 닫기 · 닫기 버튼 포커스 · body 스크롤 잠금을 시트와 같은 훅에서 받는다(§4.6).
  const closeRef = useOverlayShell(onClose);
  const metrics = analysis.metrics;

  return <div className="card-overlay" role="dialog" aria-modal="true" aria-labelledby="arcana-card-title" onClick={onClose}>
    <button className="card-close" ref={closeRef} onClick={onClose} aria-label="닫기">✕</button>
    <article className={flipped ? "magic-card flipped" : "magic-card"}
      onClick={(event) => { event.stopPropagation(); setFlipped((current) => !current); }}>
      <div className="card-face card-front">
        <small>ARCANA CARD</small>
        <h2 id="arcana-card-title">{ability}</h2>
        <div className="mini-circle">{attributeGlyphs}</div>
        <p>{attributeLabel} · {metrics.grade}</p>
        <strong>{metrics.power}</strong>
        <span>MAGIC POWER</span>
        <footer>카드를 클릭해 뒷면 보기</footer>
      </div>
      {/* backface-visibility 는 눈에서만 지우고 Tab 순서에서는 지우지 않는다. inert 가 없으면
          앞면을 보는 동안 Tab 이 보이지 않는 「전체 식 보기」로 들어간다. */}
      <div className="card-face card-back" inert={!flipped}>
        <small>ANALYSIS RECORD</small>
        <h2>{ability}</h2>
        <p>{description}</p>
        <dl>
          <div><dt>속성</dt><dd>{attributeLabel}</dd></div>
          <div><dt>구조식</dt><dd>{formatStructure(analysis)}</dd></div>
          <div><dt>분해</dt><dd>{formatDecomposition(analysis)}</dd></div>
          <div><dt>복잡도</dt><dd>{metrics.complexity}</dd></div>
          <div><dt>등급</dt><dd>{metrics.grade}</dd></div>
        </dl>
        {/* 자기 도형의 식을 가장 듣고 싶은 순간은 그리는 도중이 아니라 완성 직후다(§4.5).
            stopPropagation 이 없으면 이 클릭이 카드를 도로 뒤집는다. */}
        <button className="card-open-formula" aria-haspopup="dialog" disabled={!hasFormula}
          onClick={(event) => { event.stopPropagation(); onOpenFormula(); }}>전체 식 보기 →</button>
        <footer>클릭해서 앞면으로 돌아가기</footer>
      </div>
    </article>
    <button className="share-circle" onClick={(event) => { event.stopPropagation(); onShare(); }} disabled={shareState === "working"}>
      {shareState === "copied" ? "링크가 복사되었습니다"
        : shareState === "failed" ? "복사에 실패했습니다"
        : shareState === "working" ? "링크 만드는 중…" : "◈ 마법진 공유하기"}
    </button>
  </div>;
}
```

앞면에는 포커스 가능한 요소가 하나도 없으므로 `inert`를 뒷면에만 건다. 앞면에 걸면 `aria-labelledby`가 가리키는 `<h2 id="arcana-card-title">`가 접근성 트리에서 빠져 다이얼로그가 이름을 잃는다.

`ability`·`attributeLabel`·`attributeGlyphs`·`description`을 prop으로 받는 이유: 이 넷은 `attributes` 상태에서 파생되고 `page.tsx`의 analysis 패널도 같은 값을 쓴다. 카드 안에서 다시 계산하면 파생 규칙이 두 파일로 갈라진다.

- [ ] **Step 8: `app/globals.css` 맨 끝에 카드 규칙 추가**

`/Users/yoma/projects/jamcoding/jangyunu/app/globals.css`의 **마지막 줄 뒤**에 아래를 붙인다. 7행의 `.card-*` 규칙은 건드리지 않는다 — 같은 특이도라 뒤에 온 선언이 이긴다.

```css

.card-close{position:absolute;top:16px;right:16px;width:30px;height:30px;line-height:1;border:1px solid #4a5a52;background:#0f1413;color:#b7c1b5;font-size:13px;cursor:pointer}
.card-back h2{margin-top:12px}
.card-back>p{margin:9px 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-back dl{margin-top:14px}
.card-back dl div{padding:7px 0}
.card-open-formula{position:absolute;left:31px;right:31px;bottom:46px;padding:9px 0;border:1px solid #c9b16b;background:#20302c;color:#f2e8d2;font:10px 'DM Mono';letter-spacing:.08em;cursor:pointer}
.dark .card-open-formula{background:#241a30}
.card-open-formula:disabled{opacity:.35}
```

세로 예산(카드 500px, 패딩 31px, 새 버튼이 아래에서 46~77px를 차지):
`small 12 + h2 58 + p(2줄 클램프) 56 + dl(14 + 5행×41 = 219)` ≈ 345px < 가용 392px. 행이 4개에서 5개로 늘어도 넘치지 않는 이유가 `dl` 여백 25→14, 행 패딩 10→7, 설명문 2줄 클램프다. 설명문은 속성 두 개를 이어 붙여 길어질 수 있어서 클램프가 필수다.

`.card-close`를 `.magic-card` 바깥(오버레이 직속, absolute)에 두므로 `.card-overlay{display:grid;place-items:center}`의 행 수는 그대로 2다(카드 + 공유 버튼).

- [ ] **Step 9: `app/page.tsx` 배선 — 카드 마크업을 컴포넌트로 교체**

**(1) import.** Task 10이 넣은 `import FormulaSheet from "@/app/_components/FormulaSheet";` **위**에 한 줄을 넣어 경로 알파벳 순서를 맞춘다.

```tsx
import ArcanaCard from "@/app/_components/ArcanaCard";
```

**(2) 카드 오버레이 교체.** Step 6에서 확인한 `{cardOpen && <div className="card-overlay" …>…</div>}` **줄 전체**를 아래 한 줄로 바꾼다. 바로 아랫줄의 `{formulaOpen && <FormulaSheet …/>}`(Task 10)는 그대로 둔다.

```tsx
    {cardOpen && <ArcanaCard ability={ability} attributeLabel={attributeLabel} attributeGlyphs={attributeGlyphs} description={description} analysis={analysis} hasFormula={hasFormula} shareState={shareState} onShare={shareCircle} onClose={() => setCardOpen(false)} onOpenFormula={openFormula} />}
```

이 태스크에서 `page.tsx`에 새로 선언하는 상태는 없다. `openFormula`/`openCard`는 Task 10 Step 9가, `hasFormula`는 Task 9 Step 6-b가 이미 만들었다. 「마법진 완성」 버튼의 `onClick={openCard}`도 Task 10이 이미 바꿔 두었으므로 손대지 않는다.

- [ ] **Step 10: 타입 검사와 손 검증**

```
cd /Users/yoma/projects/jamcoding/jangyunu && npx tsc --noEmit && npx vitest run
```

`tsc`는 아무것도 출력하지 않고 종료 코드 0. `vitest run`은 전부 통과한다(Task 1~10이 만든 파일 포함 — 이 태스크는 기존 테스트의 기대값을 하나도 바꾸지 않는다). `npm run build`는 돌리지 않는다 — dev 서버가 `.next`를 쓰고 있다.

컴포넌트 테스트가 없으므로 아래가 이 태스크의 유일한 동작 검증이다. `npm run dev`의 http://localhost:3000 에서 확인한다.

1. 회전 6으로 원과 직선을 그리고 「마법진 완성」 → 카드가 뜨고, 오른쪽 위 `✕`에 포커스 링이 들어와 있다. Tab을 눌러도 보이지 않는 「전체 식 보기」로 넘어가지 않는다(`inert` 확인).
2. 카드를 클릭해 뒤집으면 뒷면에 다섯 행 — `속성` / `구조식 Z(t) = ⋃(k=0..5) R^k z_j(t)` / `분해 2획 · N항 · 99.x%` / `복잡도` / `등급` — 이 전부 보이고, 「전체 식 보기 →」 버튼이 `클릭해서 앞면으로 돌아가기` 문구와 겹치지 않는다. 극좌표식이나 `r(θ) = …`이 남아 있으면 Step 9 교체가 덜 된 것이다.
3. **분해 줄의 획 수가 푸터 문장의 획 수와 같다.** 점 하나를 콕 찍어 퇴화 획을 만들어도 둘이 같이 그대로다(양쪽 다 퇴화 획을 뺀다).
4. 뒷면에서 「전체 식 보기」 → 카드가 닫히고 시트가 열린다. 두 오버레이가 동시에 뜨지 않는다. **이 전환 동안 뒤 페이지가 스크롤되지 않고**, 시트를 닫으면 스크롤이 돌아온다(카드 언마운트의 잠금 해제와 시트 마운트의 잠금이 같은 커밋에서 일어나도 카운터가 어긋나지 않는다는 것이 `useOverlayShell`의 존재 이유다).
5. 전부 퇴화(점만 몇 개) 상태에서 카드를 열면 「전체 식 보기」가 `opacity .35`로 눌리지 않고 분해 줄이 `—`다. 획이 0개면 「마법진 완성」 자체가 비활성이라 이 경로로 오지 않는다.
6. 카드 안(카드 면·공유 버튼·「전체 식 보기」)을 클릭해도 오버레이가 닫히지 않고, 바깥 어두운 영역과 `✕`와 Escape로는 닫힌다. 「전체 식 보기」를 눌렀을 때 카드가 뒤집히지 않는다.
7. 「◈ 마법진 공유하기」가 이동 전과 똑같이 동작한다(링크 복사 또는 네이티브 공유 시트, 취소해도 `복사에 실패했습니다`가 뜨지 않는다).
8. 브라우저 콘솔 경고 0건. 특히 `inert` 관련 unknown-prop 경고가 없어야 한다.

- [ ] **Step 11: 커밋**

```
cd /Users/yoma/projects/jamcoding/jangyunu
git status -sb
git add app/_components/ArcanaCard.tsx app/page.tsx app/globals.css
git commit -m "extract arcana card component"
```