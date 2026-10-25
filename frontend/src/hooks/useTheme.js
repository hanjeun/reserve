import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { surfaceForWhiteText } from '../utils/colorContrast';
import { semanticActionPalettes } from '../styles/tokens/colors';

/*
 * 테마 설정은 모듈 스토어에서 함께 구독해 CSS와 AntD가 같은 값을 사용한다. 저장 설정은 동기로 읽어 초기 테마를 맞춘다.
 */

const THEME_KEY = 'reserve:theme';   // 'system' | 'light' | 'dark'
const FONT_KEY  = 'reserve:font';
const ACCENT_KEY = 'reserve:accent';   // 포인트 색

/*
 * 명조는 웹폰트 대신 운영체제의 한글 명조 글꼴을 순서대로 사용한다.
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
        // SUITE는 public/fonts의 자체 제공 파일을 사용한다.

        //     frontend/public/fonts/SUITE-Variable.woff2  (sun-typeface/SUITE 2.0.4, OFL-1.1)

        // 웹폰트를 불러오지 못하면 기본 글꼴 묶음으로 대체한다.

        stack: "'SUITE Variable', 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif",
    },
    {
        value: 'serif',
        label: '명조',
        stack: "'Nanum Myeongjo', 'Noto Serif KR', 'Apple Myungjo', AppleMyungjo, Batang, '바탕', Gungsuh, Georgia, serif",
    },
];

/*
 * 강조·호버·연한 배경을 함께 전환한다. AntD는 파생색을 계산하므로 CSS 변수 대신 현재 테마의 실제 색상값을 전달한다.
 */
export const ACCENT_OPTIONS = [
    { value: 'blue',   label: '블루',   light: { main: '#3182f6', dark: '#2272eb', tint: '#e8f3ff' }, darkMode: { main: '#4c9aff', dark: '#3182f6', tint: '#1b2a41' } },
    { value: 'violet', label: '바이올렛', light: { main: '#7048e8', dark: '#5f3dc4', tint: '#f3f0ff' }, darkMode: { main: '#9775fa', dark: '#7048e8', tint: '#251f3d' } },
    { value: 'teal',   label: '틸',     light: { main: '#0ca678', dark: '#087f5b', tint: '#e6fcf5' }, darkMode: { main: '#38d9a9', dark: '#0ca678', tint: '#12312a' } },
    { value: 'rose',   label: '로즈',   light: { main: '#e64980', dark: '#c2255c', tint: '#fff0f6' }, darkMode: { main: '#f783ac', dark: '#e64980', tint: '#3a1b28' } },
    { value: 'amber',  label: '앰버',   light: { main: '#f08c00', dark: '#e67700', tint: '#fff9db' }, darkMode: { main: '#ffc078', dark: '#f08c00', tint: '#3a2c12' } },
].map(option => ({ ...option,
    light: { ...option.light, foreground: '#ffffff', solid: surfaceForWhiteText(option.light.main), solidHover: surfaceForWhiteText(option.light.dark) },
    darkMode: { ...option.darkMode, foreground: '#ffffff', solid: surfaceForWhiteText(option.darkMode.main), solidHover: surfaceForWhiteText(option.darkMode.dark) },
}));

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
    try { localStorage.setItem(key, value); } catch { /* 저장 오류가 나도 현재 화면 설정은 유지한다. */ }
};

// 모듈 레벨 스토어
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

/*
 * 루트 인라인 값으로 밝고 어두운 테마의 강조색을 함께 덮고 테마 전환 때 다시 적용한다.
 */
const applyAccent = (value, resolvedTheme) => {
    const opt = resolveAccent(value);
    const c = resolvedTheme === 'dark' ? opt.darkMode : opt.light;
    const root = document.documentElement;
    root.style.setProperty('--c-primary', c.main);
    root.style.setProperty('--c-primary-dark', c.dark);
    root.style.setProperty('--c-primary-light', c.tint);
    root.style.setProperty('--c-primary-fg', c.foreground);
    root.style.setProperty('--c-primary-solid', c.solid);
    root.style.setProperty('--c-primary-solid-hover', c.solidHover);
};

/** <html>에 반영. 전환 중에만 트랜지션을 켠다(theme.css의 data-theme-changing). */
const applyTheme = (pref, { animate = true } = {}) => {
    const root = document.documentElement;
    if (animate) {
        root.dataset.themeChanging = '';
        // 계속 걸어두면 모든 요소에 transition이 남아 스켈레톤·hover와 섞인다 → 끝나면 뗀다.
        window.setTimeout(() => { delete root.dataset.themeChanging; }, 220);
    }
    const resolved = resolveTheme(pref);
    root.dataset.theme = resolved;
    for (const [name, palette] of Object.entries(semanticActionPalettes[resolved])) {
        root.style.setProperty(`--c-${name}-fg`, palette.foreground);
        root.style.setProperty(`--c-${name}-solid`, palette.solid);
        root.style.setProperty(`--c-${name}-solid-hover`, palette.solidHover);
    }
    // 테마가 바뀌면 강조색도 다시 적용해야 한다 — 라이트/다크에서 쓰는 hex 가 다르다.
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
            if (state.theme === 'system') {
                // useSyncExternalStore는 같은 snapshot이면 다시 렌더하지 않는다.
                // OS 테마 변경도 새 snapshot을 전달해야 AntD algorithm이 함께 바뀐다.
                state = { ...state };
                applyTheme('system');
                emit();
            }
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

    const setAccent = useCallback((next) => {
        state = { ...state, accent: next };
        write(ACCENT_KEY, next);
        // 지금 화면에 적용된 테마 기준으로 색을 넣는다(라이트/다크 값이 다르다).
        applyAccent(next, resolveTheme(state.theme));
        emit();
    }, []);

    // StrictMode 이중 마운트나 HMR로 DOM 속성이 어긋나는 경우를 대비한 보정.
    useEffect(() => {
        const resolved = resolveTheme(snap.theme);
        const palette = resolved === 'dark' ? resolveAccent(snap.accent).darkMode : resolveAccent(snap.accent).light;
        if (document.documentElement.dataset.theme !== resolved
            || document.documentElement.style.getPropertyValue('--c-primary-fg') !== palette.foreground
            || document.documentElement.style.getPropertyValue('--c-primary-solid') !== palette.solid
            || document.documentElement.style.getPropertyValue('--c-error-solid') !== semanticActionPalettes[resolved].error.solid
            || document.documentElement.style.getPropertyValue('--c-success-fg') !== '#ffffff') {
            applyTheme(snap.theme, { animate: false });
        }
    }, [snap.theme, snap.accent]);

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
        /*
         * AntD가 파생색을 계산할 수 있도록 현재 테마의 실제 색상값을 제공한다.
         */
        accentColors: resolved === 'dark' ? accentOpt.darkMode : accentOpt.light,
    };
}
