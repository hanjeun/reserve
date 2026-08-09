import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * 화면 모양(라이트/다크/시스템)과 글꼴 설정.
 *
 * ★ 모듈 레벨 스토어다 — 컴포넌트마다 useState를 두면 안 된다.
 *   처음엔 훅 안에 useState를 뒀는데, App.jsx와 마이페이지가 각각 **독립된 state**를 갖는 바람에
 *   마이페이지에서 라이트로 바꿔도 App은 여전히 다크로 알고 있었다. 그 결과 CSS 변수(우리 색)만
 *   라이트로 바뀌고 AntD는 darkAlgorithm을 유지해서:
 *     - message 토스트가 검게 뜨고
 *     - Select(글꼴 롤러)가 다크 filled 배경(rgba(255,255,255,0.08))이라 흰 카드 위에서 사라지고
 *     - 그 외 AntD 컴포넌트 색이 전부 어긋났다
 *   증상이 여러 개로 보였지만 원인은 이 하나였다. useSyncExternalStore로 하나의 스토어를 구독한다.
 *
 * 저장은 localStorage — 기기별 설정이고, 무엇보다 **첫 페인트 전에 동기로 읽을 수 있어야**
 * 새로고침 때 흰 화면이 번쩍이지 않는다. 서버에 두면 /api/member/me를 기다리는 동안
 * 라이트로 그려졌다가 다크로 바뀐다. 기기 간 동기화가 필요해지면 Member 컬럼을 추가하고
 * 이 값을 초기값으로 덮는 방식이 맞다.
 */

const THEME_KEY = 'reserve:theme';   // 'system' | 'light' | 'dark'
const FONT_KEY  = 'reserve:font';
const ACCENT_KEY = 'reserve:accent';   // 포인트 색

/**
 * 글꼴 선택지. stack은 CSS font-family에 그대로 들어간다.
 *
 * 명조는 웹폰트를 따로 싣지 않고 OS 기본 명조를 쓴다(번들 크기를 늘리지 않으려고).
 * 그래서 한글 명조가 실제로 존재하는 이름을 OS별로 전부 나열해야 한다 —
 * 처음에 'Nanum Myeongjo'만 적었더니 그 폰트가 설치돼 있지 않은 환경에서
 * 라틴 폰트(Georgia)로만 떨어져 **한글은 그대로 고딕**이라 "안 바뀐다"고 보였다.
 *   Windows: 바탕(Batang) / 궁서(Gungsuh)
 *   macOS·iOS: Apple Myungjo / AppleMyungjo
 *   Android: Noto Serif KR
 * 마지막 generic `serif`가 최후 폴백이다.
 */
export const FONT_OPTIONS = [
    {
        value: 'pretendard',
        label: '프리텐다드',
        stack: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    },
    {
        value: 'system',
        // "시스템 기본"은 기기 자체의 기본 글꼴을 쓴다는 뜻이다.
        // Windows는 맑은 고딕, macOS·iOS는 SF Pro/애플 SD 산돌고딕, Android는 Roboto/Noto Sans KR.
        label: '시스템 기본',
        stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif",
    },
    {
        value: 'suite',
        label: 'SUITE',
        // ★ self-host 다 — Pretendard 와 같은 방식으로 통일했다.
        //   Pretendard 는 npm 패키지(index.css 의 @import)로 번들에 들어가는데, SUITE 는 npm 패키지가
        //   없어서(suite-variable/suit-font/suite-font 전부 미등록) 폰트 파일을 레포에 직접 넣었다:
        //     frontend/public/fonts/SUITE-Variable.woff2  (sun-typeface/SUITE 2.0.4, OFL-1.1)
        //   @font-face 선언은 index.css 의 "SUITE 글꼴" 블록에 있다.
        //
        //   한때 jsDelivr CDN <link> 주입 방식이었는데 바꾼 이유:
        //     1) 외부 의존 — CDN 이 죽으면 글꼴이 안 뜬다
        //     2) 프라이버시 — 사용자 IP 가 제3자(jsDelivr)에 노출된다
        //     3) CSP 를 도입하면 style-src/font-src 에 도메인을 추가해야 하고, 놓치면 조용히 실패한다
        //     4) 무엇보다 이 프로젝트는 이미 self-host 방식이었다 — 방식이 갈리면 안 된다
        //   (그때 URL 을 추측으로 넣었다가 404 였다. 실제 파일명은 SUITE-Variable 로 하이픈이 들어간다)
        //
        // ★ 폴백은 그대로 둔다 — 파일이 없거나 로드가 실패해도 Pretendard → 시스템 글꼴로
        //   조용히 내려간다. "안 바뀐 것처럼" 보일 뿐 글자가 사라지지 않는다.
        stack: "'SUITE Variable', 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif",
    },
    {
        value: 'serif',
        label: '명조',
        stack: "'Nanum Myeongjo', 'Noto Serif KR', 'Apple Myungjo', AppleMyungjo, Batang, '바탕', Gungsuh, Georgia, serif",
    },
];

/**
 * 포인트(강조) 색 선택지.
 *
 * <h3>왜 값을 전부 명시하나</h3>
 * `--c-primary` 하나만 바꾸면 hover(짙게)·연한 배경(뱃지·선택 항목)이 원래 파랑에 머물러
 * 색이 섞인다. 그래서 색마다 세 값을 함께 둔다.
 * 그리고 다크 모드는 같은 색이 어두운 배경에서 채도가 낮아 보이므로 한 단계 밝은 값을 따로 둔다
 * (theme.css 가 기본 파랑에 대해 이미 그렇게 하고 있다 — 같은 원칙을 따른다).
 *
 * ⚠️ AntD 의 colorPrimary 토큰에는 CSS 변수를 넣을 수 없다(AntD 가 JS 로 파생색을 계산한다).
 *    그래서 App.jsx 가 이 표의 **리터럴 hex** 를 직접 받아 쓴다.
 */
export const ACCENT_OPTIONS = [
    { value: 'blue',   label: '블루',   light: { main: '#3182f6', dark: '#2272eb', tint: '#e8f3ff' }, darkMode: { main: '#4c9aff', dark: '#3182f6', tint: '#1b2a41' } },
    { value: 'violet', label: '바이올렛', light: { main: '#7048e8', dark: '#5f3dc4', tint: '#f3f0ff' }, darkMode: { main: '#9775fa', dark: '#7048e8', tint: '#251f3d' } },
    { value: 'teal',   label: '틸',     light: { main: '#0ca678', dark: '#087f5b', tint: '#e6fcf5' }, darkMode: { main: '#38d9a9', dark: '#0ca678', tint: '#12312a' } },
    { value: 'rose',   label: '로즈',   light: { main: '#e64980', dark: '#c2255c', tint: '#fff0f6' }, darkMode: { main: '#f783ac', dark: '#e64980', tint: '#3a1b28' } },
    { value: 'amber',  label: '앰버',   light: { main: '#f08c00', dark: '#e67700', tint: '#fff9db' }, darkMode: { main: '#ffc078', dark: '#f08c00', tint: '#3a2c12' } },
];

const DEFAULT_ACCENT = 'blue';

/** 저장된 값이 이상하면(옛 값·손으로 고친 localStorage) 기본값으로 되돌린다. */
const resolveAccent = (value) =>
    ACCENT_OPTIONS.find((o) => o.value === value) ?? ACCENT_OPTIONS[0];

const read = (key, fallback) => {
    try {
        return localStorage.getItem(key) || fallback;
    } catch {
        // 사파리 시크릿 모드 등에서 localStorage 접근이 던질 수 있다. 기본값으로 살아남는다.
        return fallback;
    }
};

const write = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* 저장 실패해도 화면은 정상 동작한다 */ }
};

// ── 모듈 레벨 스토어 ─────────────────────────────────────────────────────────
let state = {
    theme:  read(THEME_KEY, 'system'),
    font:   read(FONT_KEY, 'pretendard'),
    accent: read(ACCENT_KEY, DEFAULT_ACCENT),
};
const listeners = new Set();

const getSnapshot = () => state;
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { listeners.forEach(fn => fn()); };

/** 'system'이면 OS 설정을 따라 실제 적용될 테마를 계산한다. */
const resolveTheme = (pref) => {
    if (pref !== 'system') return pref;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyFont = (value) => {
    const opt = FONT_OPTIONS.find(o => o.value === value) || FONT_OPTIONS[0];
    document.documentElement.style.setProperty('--app-font', opt.stack);
};

/**
 * 포인트 색을 <html> 인라인 스타일로 덮는다.
 *
 * ★ 인라인이어야 하는 이유: theme.css 가 `:root` 와 `[data-theme=dark]` 양쪽에서
 *   `--c-primary` 를 정의한다. 인라인 스타일은 어떤 선택자보다 우선하므로 두 경우를
 *   한 번에 이길 수 있다. 대신 **테마가 바뀔 때마다 다시 적용해야 한다**
 *   (라이트/다크에서 쓰는 hex 가 다르기 때문) — applyTheme 이 이어서 호출한다.
 */
const applyAccent = (value, resolvedTheme) => {
    const opt = resolveAccent(value);
    const c = resolvedTheme === 'dark' ? opt.darkMode : opt.light;
    const root = document.documentElement;
    root.style.setProperty('--c-primary', c.main);
    root.style.setProperty('--c-primary-dark', c.dark);
    root.style.setProperty('--c-primary-light', c.tint);
};

/** <html>에 반영. 전환 중에만 트랜지션을 켠다(theme.css의 data-theme-changing). */
const applyTheme = (pref, { animate = true } = {}) => {
    const root = document.documentElement;
    if (animate) {
        root.setAttribute('data-theme-changing', '');
        // 계속 걸어두면 모든 요소에 transition이 남아 스켈레톤·hover와 섞인다 → 끝나면 뗀다.
        window.setTimeout(() => root.removeAttribute('data-theme-changing'), 220);
    }
    const resolved = resolveTheme(pref);
    root.setAttribute('data-theme', resolved);
    // ★ 테마가 바뀌면 강조색도 다시 적용해야 한다 — 라이트/다크에서 쓰는 hex 가 다르다.
    //   이걸 빼면 다크로 갔을 때 포인트 색이 라이트용 값에 머물러 채도가 죽어 보인다.
    applyAccent(state.accent, resolved);
};

/** 앱 부팅 시 1회 — React 렌더 전에 불러야 FOUC가 없다(main.jsx). */
export const initTheme = () => {
    applyTheme(state.theme, { animate: false });   // 내부에서 applyAccent 까지 수행
    applyFont(state.font);

    // 'system'을 고른 사용자는 OS 설정이 바뀌면 즉시 따라와야 한다.
    // 'light'/'dark'를 명시했으면 OS가 바뀌어도 그대로 둔다.
    window.matchMedia?.('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
            if (state.theme === 'system') { applyTheme('system'); emit(); }
        });
};

export default function useTheme() {
    const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const setTheme = useCallback((next) => {
        state = { ...state, theme: next };
        write(THEME_KEY, next);
        applyTheme(next);
        emit();
    }, []);

    const setFont = useCallback((next) => {
        state = { ...state, font: next };
        write(FONT_KEY, next);
        applyFont(next);
        emit();
    }, []);

    // StrictMode 이중 마운트나 HMR로 DOM 속성이 어긋나는 경우를 대비한 보정.
    useEffect(() => {
        if (document.documentElement.getAttribute('data-theme') !== resolveTheme(snap.theme)) {
            applyTheme(snap.theme, { animate: false });
        }
    }, [snap.theme]);

    const setAccent = useCallback((next) => {
        state = { ...state, accent: next };
        write(ACCENT_KEY, next);
        // 지금 화면에 적용된 테마 기준으로 색을 넣는다(라이트/다크 값이 다르다).
        applyAccent(next, resolveTheme(state.theme));
        emit();
    }, []);

    // StrictMode 이중 마운트나 HMR로 DOM 속성이 어긋나는 경우를 대비한 보정.
    useEffect(() => {
        if (document.documentElement.getAttribute('data-theme') !== resolveTheme(snap.theme)) {
            applyTheme(snap.theme, { animate: false });
        }
    }, [snap.theme]);

    const resolved = resolveTheme(snap.theme);
    const accentOpt = resolveAccent(snap.accent);

    return {
        theme: snap.theme,          // 사용자가 고른 값('system' 포함)
        resolvedTheme: resolved,    // 실제 적용된 값('light' | 'dark')
        setTheme,
        font: snap.font,
        setFont,
        accent: snap.accent,        // 고른 색 키('blue' 등)
        setAccent,
        /**
         * 지금 적용돼야 하는 포인트 색 **리터럴 hex**.
         * AntD ConfigProvider 의 colorPrimary 에 넣기 위한 것이다 —
         * 그 토큰은 AntD 가 JS 로 파생색(hover/active/알파)을 계산하므로
         * var(--c-primary) 같은 CSS 값을 넣으면 계산에 실패한다.
         */
        accentColors: resolved === 'dark' ? accentOpt.darkMode : accentOpt.light,
    };
}
