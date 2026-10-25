import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataState, FilterToolbar } from '../common';
import ChatIntroEditor from '../chat/ChatIntroEditor';
import ChatIntroEditorSkeleton from '../chat/ChatIntroEditorSkeleton';
import useChatIntro from '../../hooks/useChatIntro';
import useMessage from '../../hooks/useMessage';
import { chatKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';

/*
 * 고객지원과 가게 문의는 같은 편집기·골격을 공유하고 저장한 공개 안내를 메신저에 반영한다.
 */
export default function SupportIntroTab() {
    const { intro, isLoading, isError, error, isFetching, refetch } = useChatIntro('support');
    const queryClient = useQueryClient();
    const { message } = useMessage();

    const saveMutation = useMutation({
        mutationFn: body => chatService.saveSupportIntro(body),
        onSuccess: (saved) => {
            queryClient.setQueryData(chatKeys.intro('support'), saved);
            message.success('고객지원 채팅 설정을 저장했어요.');
        },
        onError: (error) => message.error(error instanceof Error && error.message
            ? error.message : '채팅 설정을 저장하지 못했어요. 잠시 후 다시 시도해주세요.'),
    });

    // 설정 본문 — 로딩 → 오류 → 편집기 순으로 판정한다.
    const renderEditor = () => {
        if (isLoading) {
            return <ChatIntroEditorSkeleton />;
        }
        if (isError) {
            return <DataState state="error" requestType="detail" kind="message" subject="채팅 설정" error={error} onRetry={refetch} retrying={isFetching} />;
        }
        return (
            <ChatIntroEditor
                kind="support"
                intro={intro}
                identity={{ previewUserName: '회원' }}
                saving={saveMutation.isPending}
                onSave={body => saveMutation.mutateAsync(body)}
                onUploadAvatar={file => chatService.uploadSupportAvatar(file).then(result => result.url)}
                noticeHelp="대화창 맨 위 확성기 줄에 보여요. 점검·운영시간처럼 먼저 알려야 할 내용을 적어 주세요. 비워 두면 '안녕하세요. 표시 이름에서 안내해드려요.'가 보여요."
            />
        );
    };

    return (
        <div className="reserve-chat-intro-tab">
            <FilterToolbar onReload={refetch} loading={isFetching} initialLoading={isLoading} />
            {renderEditor()}
        </div>
    );
}
