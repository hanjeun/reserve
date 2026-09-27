import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataState, FilterToolbar } from '../common';
import ChatIntroEditor from '../chat/ChatIntroEditor';
import ChatIntroEditorSkeleton from '../chat/ChatIntroEditorSkeleton';
import { useMyStores, useQueryParamsState } from '../../hooks';
import useChatIntro from '../../hooks/useChatIntro';
import useMessage from '../../hooks/useMessage';
import { chatKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';

const CHAT_INTRO_QUERY_DEFAULTS = Object.freeze({ chatIntroStore: '' });

/**
 * 사업자 패널 › 채팅 관리 — 가게별 채팅 첫 화면(공지사항·인사말·자주 묻는 질문) 설정 (2026-09-24).
 * 관리자 패널 › 채팅 관리와 같은 편집기·스켈레톤을 쓴다. 가게는 표시 이름·사진을 가게 정보에서 가져온다(읽기 전용).
 * 다른 사업자 탭처럼 공통 FilterToolbar 로 시작하고, 선택한 가게는 URL(chatIntroStore)에 남는다.
 */
export default function ChatIntroTab() {
    const { stores, loading: storesLoading, error: storesError, refetch: refetchStores } = useMyStores();
    const [{ chatIntroStore }, setParams] = useQueryParamsState(CHAT_INTRO_QUERY_DEFAULTS);
    const store = stores.find(item => String(item.id) === chatIntroStore) ?? stores[0] ?? null;
    const scope = store ? `store:${store.id}` : null;
    const { intro, isLoading, isError, isFetching, refetch } = useChatIntro(scope, { enabled: Boolean(store) });
    const queryClient = useQueryClient();
    const { message } = useMessage();

    const saveMutation = useMutation({
        mutationFn: ({ storeId, body }) => chatService.saveStoreIntro(storeId, body),
        onSuccess: (saved, { storeId }) => {
            queryClient.setQueryData(chatKeys.intro(`store:${storeId}`), saved);
            message.success('채팅 설정을 저장했어요.');
        },
        onError: (error) => message.error(error instanceof Error && error.message
            ? error.message : '채팅 설정을 저장하지 못했어요. 잠시 후 다시 시도해주세요.'),
    });

    let content;
    if (storesLoading || (store && isLoading)) {
        content = <ChatIntroEditorSkeleton />;
    } else if (storesError) {
        content = <DataState state="error" kind="store" subject="가게 목록" error={storesError} onRetry={refetchStores} compact />;
    } else if (!store) {
        content = <DataState state="empty" kind="store" title="등록된 가게가 없습니다." style={{ marginTop: 80 }} />;
    } else if (isError) {
        content = <DataState state="error" kind="message" subject="채팅 설정" onRetry={refetch} retrying={isFetching} compact />;
    } else {
        content = (
            <ChatIntroEditor
                key={store.id}
                kind="store"
                intro={intro}
                identity={{ name: store.name, imageSrc: store.mainImageUrl || undefined }}
                saving={saveMutation.isPending}
                onSave={body => saveMutation.mutateAsync({ storeId: store.id, body })}
                noticeHelp="대화창 맨 위 확성기 줄에 보여요. 휴무·주차처럼 먼저 알려야 할 내용을 적어 주세요. 비워 두면 '안녕하세요. 가게 이름입니다.'가 보여요."
            />
        );
    }

    return (
        <div className="reserve-chat-intro-tab">
            <FilterToolbar
                selects={stores.length > 1 ? [{
                    key: 'store',
                    value: store ? String(store.id) : undefined,
                    onChange: value => setParams({ chatIntroStore: String(value) }),
                    options: stores.map(item => ({ value: String(item.id), label: item.name })),
                    ariaLabel: '채팅을 관리할 가게',
                    width: 200,
                }] : []}
                onReload={store ? refetch : refetchStores}
                loading={storesLoading || isFetching}
            />
            {content}
        </div>
    );
}
