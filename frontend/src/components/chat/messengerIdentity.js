import { createContext, useContext } from 'react';
import { SUPPORT_DISPLAY_NAME } from '../../constants/chatIntro';

export const SUPPORT_LABEL = SUPPORT_DISPLAY_NAME;

/**
 * 고객지원 표시 이름·사진 — 메신저 본문이 채팅 관리(관리자) 설정으로 채워 내려준다(2026-09-24).
 * 제공자가 없는 곳(단독 테스트·미리보기)은 기본값(RESERVE 고객지원 · R 로고)을 쓴다.
 */
export const SupportIdentityContext = createContext({ name: SUPPORT_LABEL, avatarUrl: null });
export const useSupportIdentity = () => useContext(SupportIdentityContext);

export const conversationTitle = (row, supportName = SUPPORT_LABEL) => {
    if (row?.viewerRole === 'ADMIN') return row?.counterpartName || '회원';
    if (row?.type === 'SUPPORT') return supportName;
    if (row?.viewerRole === 'OWNER') return row?.counterpartName || '손님';
    return row?.storeName || row?.counterpartName || '가게';
};
