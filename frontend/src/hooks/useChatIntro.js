import { useQuery } from '@tanstack/react-query';
import { chatService } from '../services';
import { chatKeys } from './queryKeys';
import {
    DEFAULT_STORE_GREETING,
    DEFAULT_SUPPORT_GREETING,
    SUPPORT_DISPLAY_NAME,
} from '../constants/chatIntro';

/** 서버 기본값과 같은 질문. 서버를 못 부를 때의 대체값이라 답변 없이 두고, 누르면 입력칸에 질문을 채운다. */
export const DEFAULT_SUPPORT_QUESTIONS = Object.freeze([
    '예약을 확인하고 싶어요',
    '예약 변경·취소가 궁금해요',
    '가게 등록·이용 문의',
    '기타 문의',
]);

/** 가게 문의를 열었지만 첫 안내를 그리지 않는 경우(사장님 화면 등)의 빈 대화 문구. */
export const STORE_EMPTY_TEXT = '예약 전에 궁금한 점을 물어보세요.';

const SUPPORT_FALLBACK = Object.freeze({
    configured: false,
    notice: null,
    greeting: DEFAULT_SUPPORT_GREETING,
    displayName: SUPPORT_DISPLAY_NAME,
    avatarUrl: null,
    items: DEFAULT_SUPPORT_QUESTIONS.map(question => ({ question, answer: null })),
});
const STORE_FALLBACK = Object.freeze({
    configured: false,
    notice: null,
    greeting: DEFAULT_STORE_GREETING,
    displayName: null,
    avatarUrl: null,
    items: [],
});

/** 메신저 선택 → 안내 범위 키. 고객지원은 'support', 가게 문의는 'store:{id}'. 그 밖(사장님·관리자 화면)은 null. */
export const chatIntroScope = (selection) => {
    if (selection?.kind === 'support') return 'support';
    if (selection?.kind === 'store' && selection.storeId) return `store:${selection.storeId}`;
    return null;
};

const text = (value) => (typeof value === 'string' && value.trim() ? value : null);

/** 응답 모양을 한 번만 맞춘다 — 화면은 { notice, greeting, displayName, avatarUrl, items } 만 안다. */
export const normalizeChatIntro = (data, fallback = STORE_FALLBACK) => {
    if (!data || !Array.isArray(data.items)) return fallback;
    return {
        configured: Boolean(data.configured),
        notice: text(data.notice),
        greeting: text(data.greeting) ?? fallback.greeting,
        displayName: text(data.displayName) ?? fallback.displayName,
        avatarUrl: text(data.avatarUrl),
        items: data.items
            .filter(item => item && typeof item.question === 'string' && item.question.trim())
            .map(item => ({ question: item.question, answer: text(item.answer) })),
        updatedAt: data.updatedAt ?? null,
    };
};

export const fetchChatIntro = (scope) => (scope === 'support'
    ? chatService.getSupportIntro()
    : chatService.getStoreIntro(scope.slice('store:'.length)));

/**
 * 채팅 첫 안내 조회. 채팅 관리 화면과 손님 메신저가 같은 캐시 키를 써서 저장 직후 바로 반영된다.
 */
export default function useChatIntro(scope, { enabled = true } = {}) {
    const fallback = scope === 'support' ? SUPPORT_FALLBACK : STORE_FALLBACK;
    const query = useQuery({
        queryKey: chatKeys.intro(scope),
        queryFn: () => fetchChatIntro(scope),
        enabled: enabled && Boolean(scope),
        staleTime: 1000 * 60 * 5,
        retry: false,
    });
    return {
        intro: normalizeChatIntro(query.data, fallback),
        isLoading: query.isLoading,
        isError: query.isError,
        isFetching: query.isFetching,
        refetch: query.refetch,
    };
}
