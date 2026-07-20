/**
 * 로그인 후 원래 보던 페이지로 돌아가기 (redirect-back)
 *
 * 2026-07 전수조사로 추가. 예전 동작:
 *   - 이메일 로그인: PrivateRoute가 state.from을 넘겨주고 Login.jsx가 그걸로 navigate하는
 *     코드가 이미 있었지만, 같은 파일에서 '로그인이 필요한 페이지입니다' 경고를 띄우면서
 *     navigate('/login', { state: {} })로 state를 통째로 비워버려 from이 유실됐다 → 항상 '/'로 감.
 *   - 소셜(OAuth) 로그인: window.location.href로 백엔드에 전체 페이지 리다이렉트를 하므로
 *     React Router의 location.state가 아예 살아남지 못한다 → 복귀 수단이 없었다.
 *
 * 그래서 두 경로가 공유할 수 있는 sessionStorage 기반 저장소로 통일한다.
 * sessionStorage인 이유: OAuth는 외부 사이트를 거쳐 돌아오는 왕복이지만 "같은 탭"이므로
 * sessionStorage가 유지된다. 반대로 탭을 닫으면 사라지므로 오래된 복귀 경로가 남지 않는다.
 */

const KEY = 'reserve:redirectAfterLogin';

// 복귀 대상에서 제외할 경로 — 로그인 관련 페이지로 되돌아가면 무한 루프가 된다.
const EXCLUDED_PREFIXES = [
    '/login',
    '/signup',          // /signup, /signup/social 모두 포함
    '/oauth2/callback',
    '/forgot-password',
];

/**
 * 내부 경로인지 검증 (오픈 리다이렉트 방지).
 * '/'로 시작해야 하고, '//evil.com'(프로토콜 상대 URL)이나 '/\evil.com'은 거부한다.
 */
const isSafeInternalPath = (path) => {
    if (typeof path !== 'string' || path.length === 0) return false;
    if (!path.startsWith('/')) return false;
    if (path.startsWith('//') || path.startsWith('/\\')) return false;
    return !EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
};

/** 로그인 유도 직전에 현재 경로를 저장 (PrivateRoute, 로그인 유도 버튼 등에서 호출) */
export const saveRedirect = (path) => {
    if (!isSafeInternalPath(path)) return;
    try {
        sessionStorage.setItem(KEY, path);
    } catch {
        /* 시크릿 모드 등에서 sessionStorage가 막혀 있어도 로그인 자체는 되어야 하므로 무시 */
    }
};

/**
 * 저장된 복귀 경로를 꺼내면서 지운다 (한 번만 쓰이도록).
 * 저장된 게 없거나 안전하지 않으면 null.
 */
export const consumeRedirect = () => {
    try {
        const path = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        return isSafeInternalPath(path) ? path : null;
    } catch {
        return null;
    }
};

/** 저장만 지우고 값은 안 쓸 때 (예: 로그아웃) */
export const clearRedirect = () => {
    try {
        sessionStorage.removeItem(KEY);
    } catch {
        /* noop */
    }
};

/** react-router의 location 객체에서 복귀에 쓸 경로 문자열을 만든다 (쿼리스트링 포함) */
export const pathFromLocation = (location) =>
    `${location?.pathname || ''}${location?.search || ''}`;
