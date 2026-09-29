import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataState, FilterToolbar } from '../common';
import ChatIntroEditor from '../chat/ChatIntroEditor';
import ChatIntroEditorSkeleton from '../chat/ChatIntroEditorSkeleton';
import useChatIntro from '../../hooks/useChatIntro';
import useMessage from '../../hooks/useMessage';
import { chatKeys } from '../../hooks/queryKeys';
import { chatService } from '../../services';

/**
 * 관리자 패널 › 채팅 관리 — 고객지원 채팅 첫 화면(표시 이름·사진·공지사항·인사말·자주 묻는 질문) 설정 (2026-09-24).
 * 사업자 패널 › 채팅 관리와 같은 편집기·스켈레톤을 쓴다. 저장 전에는 서버 기본값(RESERVE 고객지원 · 기본 인사말 ·
 * 기본 문답 4개)이 칸에 채워져 있고, 고쳐서 저장하면 그 내용이 메신저 전체(헤더·목록·답변 말풍선)에 쓰인다.
 */
export default function SupportIntroTab() {
    const { intro, isLoading, isError, isFetching, refetch } = useChatIntro('support');
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
            return <DataState state="error" kind="message" subject="채팅 설정" onRetry={refetch} retrying={isFetching} compact />;
        }
        return (
            <ChatIntroEditor
                kind="support"
                intro={intro}
                identity={{ previewUserName: '회원' }}
                saving={saveMutation.isPending}
                onSave={body => saveMutation.mutateAsync(body)}
                onUploadAvatar={file => chatService.uploadSupportAvatar(file).then(result => result.url)}
                noticeHelp="대화창 맨 위 확성기 줄에 보여요. 점검·운영시간처럼 먼저 알려야 할 내용을 적어 주세요. 비워 두면 '안녕하세요. 표시 이름입니다.'가 보여요."
            />
        );
    };

    return (
        <div className="reserve-chat-intro-tab">
            <FilterToolbar onReload={refetch} loading={isFetching} />
            {renderEditor()}
        </div>
    );
}
