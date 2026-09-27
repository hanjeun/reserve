import { Bone } from '../common';

const CARD_HEIGHTS = [
    ['profile', 132],
    ['notice', 150],
    ['greeting', 230],
    ['faq', 210],
];

/**
 * 채팅 관리 로딩 스켈레톤 — 편집기와 같은 배치(왼쪽 카드 4장 · 오른쪽 대화창)라 불러온 뒤 자리가 안 바뀐다.
 * 사업자 패널·관리자 패널이 같이 쓴다. 모바일은 편집기처럼 미리보기 자리를 숨긴다.
 */
export default function ChatIntroEditorSkeleton() {
    return (
        <div className="reserve-chat-intro-editor" role="status" aria-label="채팅 설정을 불러오는 중" aria-busy="true">
            <div className="reserve-chat-intro-switch" aria-hidden="true"><Bone height={40} borderRadius={12} /></div>
            <div className="reserve-chat-intro-settings" aria-hidden="true">
                {CARD_HEIGHTS.map(([key, height]) => <Bone key={key} height={height} borderRadius={16} />)}
            </div>
            <div className="reserve-chat-intro-preview" aria-hidden="true">
                <Bone width={160} height={44} />
                <Bone height={600} borderRadius={20} />
            </div>
        </div>
    );
}
