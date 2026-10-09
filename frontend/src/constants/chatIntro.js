/**
 * 채팅 첫 안내 문구 — 서버 ChatIntroResponse 의 기본값과 같다(서버를 못 부를 때 화면이 쓰는 대체값).
 * {이름} 은 손님 이름(모르면 "회원")으로 바뀌고, 빈 줄은 문단 구분이다.
 */
/** 고객지원 기본 표시 이름 — 메신저의 SUPPORT_LABEL 도 이 값을 쓴다(한 곳에서만 정의). */
export const SUPPORT_DISPLAY_NAME = 'RESERVE 고객지원';
export const DEFAULT_SUPPORT_GREETING = '안녕하세요, {이름}님 🙂\n반가워요.\n\n궁금한 내용을 남겨주시면\n관리자가 확인 후 답변드릴게요.';
export const DEFAULT_STORE_GREETING = '안녕하세요, {이름}님 🙂\n반가워요.\n\n궁금한 내용을 남겨주시면\n사장님이 확인 후 답변드릴게요.';

/** 인사말 틀 → 문단 목록. 문단 key 는 순서 + 내용이라 같은 문단이 두 번 있어도 겹치지 않는다. */
export const fillGreeting = (template, userName) => {
    const name = userName?.trim() || '회원';
    return String(template || '')
        .split('{이름}').join(name)
        .split(/\n\s*\n/)
        .map(text => text.trim())
        .filter(Boolean)
        .map((text, index) => ({ key: `${index}:${text}`, text }));
};
