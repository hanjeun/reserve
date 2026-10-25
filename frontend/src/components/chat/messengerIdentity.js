import { createContext, useContext } from 'react';
import { SUPPORT_DISPLAY_NAME } from '../../constants/chatIntro';

export const SUPPORT_LABEL = SUPPORT_DISPLAY_NAME;

/*
 * 고객지원 표시 정보는 관리 설정을 공유하고 제공자가 없으면 공통 기본값을 사용한다.
 */
export const SupportIdentityContext = createContext({ name: SUPPORT_LABEL, avatarUrl: null });
export const useSupportIdentity = () => useContext(SupportIdentityContext);

export const conversationTitle = (row, supportName = SUPPORT_LABEL) => {
    if (row?.viewerRole === 'ADMIN') return row?.counterpartName || '회원';
    if (row?.type === 'SUPPORT') return supportName;
    if (row?.viewerRole === 'OWNER') return row?.counterpartName || '손님';
    return row?.storeName || row?.counterpartName || '가게';
};
