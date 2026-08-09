/**
 * RESERVE Design System - Colors
 *
 * ── 2026-07-30: hex 리터럴 → CSS 변수 참조로 전환 ─────────────────────────────
 *
 * 왜 바꿨나 — 다크모드를 넣으려면 이 방법밖에 없었다.
 * 코드베이스 26개 파일이 모듈 최상위에서 `const styles = { row: { color: colors.text.primary } }`
 * 형태로 스타일 객체를 만든다. 모듈 최상위 객체는 **import 시점에 딱 한 번** 평가되므로,
 * 테마를 Context로 만들어 colors를 바꿔봐야 이미 굳어버린 문자열은 갱신되지 않는다.
 * 전부 훅/함수로 바꾸는 건 전 파일 리팩터링이다.
 *
 * 대신 값 자체를 `var(--c-...)` 문자열로 만들면, 인라인 스타일에 들어간 그 문자열을
 * **브라우저가 페인트 시점에** 해석한다. 즉 기존 `styles = {}` 객체를 한 줄도 고치지 않고
 * 테마 전환이 동작한다. 전환은 `document.documentElement.dataset.theme = 'dark'` 한 줄.
 *
 * 실제 색값은 `styles/theme.css`의 `:root` / `[data-theme="dark"]`에 있다.
 * **라이트 모드 색은 이전 hex와 100% 동일하다** — 옮기기만 했다.
 *
 * ⚠️ 주의 — var()가 안 먹는 곳이 있다:
 *   - <canvas> API(fillStyle 등): 문자열을 CSS로 해석하지 않는다
 *   - 색을 JS에서 조작하는 경우(밝기 계산, rgba 합성 등): 'var(--c-x)'는 파싱 불가
 *   그런 자리에는 아래 `rawColors`(실제 hex)를 쓴다. 단 이건 테마를 따라가지 않는다.
 */

const v = (name, fallback) => `var(--c-${name}, ${fallback})`;

export const colors = {
  // Primary - 메인 브랜드 컬러
  primary: {
    main:  v('primary', '#3182f6'),
    light: v('primary-light', '#e8f3ff'),
    dark:  v('primary-dark', '#2272eb'),
  },

  // Gray Scale - 텍스트 & 배경
  gray: {
    50:  v('gray-50', '#f9fafb'),   // 인풋 배경
    100: v('gray-100', '#f2f4f6'),  // 테두리, 구분선
    200: v('gray-200', '#e5e8eb'),
    300: v('gray-300', '#d1d6db'),
    400: v('gray-400', '#b5b8bd'),
    500: v('gray-500', '#8b95a1'),  // 보조 텍스트 (tertiary)
    600: v('gray-600', '#6b7684'),
    700: v('gray-700', '#4e5968'),  // 본문 텍스트 (secondary)
    800: v('gray-800', '#333d4b'),
    900: v('gray-900', '#1a1f27'),  // 제목 텍스트 (primary)
  },

  // Semantic Colors
  success: { main: v('success', '#00c73c'), light: v('success-light', '#e8f9ee') },
  error:   { main: v('error', '#f04452'),   light: v('error-light', '#fff0f1') },
  warning: { main: v('warning', '#ffb800'), light: v('warning-light', '#fff8e6') },

  // Background
  background: {
    default: v('bg-default', '#ffffff'),
    subtle:  v('bg-subtle', '#f8f9fa'),
    paper:   v('bg-paper', '#ffffff'),
  },

  // Text (시맨틱)
  text: {
    primary:   v('text-primary', '#1a1f27'),
    secondary: v('text-secondary', '#4e5968'),
    tertiary:  v('text-tertiary', '#8b95a1'),
    disabled:  v('text-disabled', '#b5b8bd'),
    // 입력칸의 placeholder·비활성 글자. AntD의 colorTextPlaceholder/colorTextDisabled와 같은 값이라
    // AntD가 아닌 **직접 만든 입력 UI**도 이걸 쓰면 AntD 입력과 톤이 정확히 맞는다.
    // (theme.css의 --c-input-disabled-fg는 예전부터 있었는데 여기 노출이 안 돼서
    //  StoreDetail의 TimeSlotPicker가 rgba(0,0,0,0.25)를 하드코딩했고, 다크에서 글자가 안 보였다)
    placeholder: v('input-disabled-fg', 'rgba(0, 0, 0, 0.25)'),
  },

  // Border
  border: {
    light:   v('border-light', '#f2f4f6'),
    default: v('border-default', '#e5e8eb'),
  },
};

/**
 * 실제 hex 값. **테마를 따라가지 않는다** — 라이트 모드 기준 고정값이다.
 * canvas·차트 라이브러리·JS 색 연산처럼 CSS 변수를 해석할 수 없는 자리에만 쓴다.
 * 일반 스타일에는 위 `colors`를 쓸 것.
 */
export const rawColors = {
  primary: '#3182f6',
  gray: {
    50: '#f9fafb', 100: '#f2f4f6', 200: '#e5e8eb', 300: '#d1d6db', 400: '#b5b8bd',
    500: '#8b95a1', 600: '#6b7684', 700: '#4e5968', 800: '#333d4b', 900: '#1a1f27',
  },
  success: '#00c73c',
  error: '#f04452',
  warning: '#ffb800',
};

// 단축 export
export const primary = colors.primary.main;
export const textPrimary = colors.text.primary;
export const textSecondary = colors.text.secondary;
export const textTertiary = colors.text.tertiary;

/**
 * 색에 투명도를 섞는다. `${color}18` 같은 문자열 연결을 대체한다.
 *
 * ★ 왜 필요한가 (2026-08-06)
 *   2026-07-30 에 색 토큰을 hex 리터럴에서 `var(--c-primary, #3182f6)` 문자열로 바꿨는데,
 *   코드 곳곳에 남아 있던 `${colors.primary.main}18`(hex 뒤에 알파 두 자리를 붙이는 관용구)이
 *   `var(--c-primary, #3182f6)18` 이라는 **무효 CSS** 가 됐다.
 *   무효 선언은 브라우저가 조용히 버리므로 에러도 안 나고 배경/그림자만 사라진다.
 *   실제로 StatCard 아이콘 배지, QR 스캐너 배지, 주소 입력 포커스 링, 홈 섹션 배경,
 *   약관 필수 태그까지 6곳이 이 방식으로 죽어 있었다.
 *
 *   color-mix() 는 var() 를 그대로 받아 섞을 수 있고, 다크 모드에서 변수가 바뀌면
 *   결과도 따라 바뀐다. "토큰이 hex 인지 var 인지"에 의존하지 않는 유일한 방법이다.
 *
 * @param {string} color - 색 토큰(var() 문자열이어도 된다)
 * @param {number} pct   - 불투명도 %(기본 12 — 기존 `18`(=24/255≈9.4%)보다 약간 진하지만
 *                          배지·태그 대비가 낮다는 지적이 있어 12%로 잡았다)
 */
export const withAlpha = (color, pct = 12) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
