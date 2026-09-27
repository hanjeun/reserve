// DEV 시각 프리뷰: 인증·서비스·알림 권한·메시지 전송·읽음·영구저장에 연결하지 않는다.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { ArrowLeftOutlined, CloseOutlined, SendOutlined } from '@ant-design/icons';
import MessengerHome from '../src/components/chat/MessengerHome';
import MessengerFooter from '../src/components/chat/MessengerFooter';
import MessengerSettings from '../src/components/chat/MessengerSettings';
import MessengerSupportIntro from '../src/components/chat/MessengerSupportIntro';
import MessengerConversationRow from '../src/components/chat/MessengerConversationRow';
import MessengerListHeading from '../src/components/chat/MessengerListHeading';
import ChatBubbleList from '../src/components/chat/ChatBubbleList';
import { useWindowWidth } from '../src/hooks/useWindowWidth';
import '../src/index.css';
import './messenger-home.css';

if (!import.meta.env.DEV) throw new Error('Design preview is development-only');

const previewParams = new URLSearchParams(window.location.search);
const OPERATOR = { name: '예시 관리자 하늘', profileImage: '/icons/RESERVE_logo.png' };
const SECOND_OPERATOR = { name: '예시 관리자 바다', profileImage: '/icons/R_logo.png' };
const USER = { id: 'preview-user', name: '예시 이용자', email: 'design-preview@example.test', profileImage: '/icons/R_logo.png' };
const ROWS = [
    { roomId: 1, type: 'SUPPORT', counterpartName: OPERATOR.name, counterpartProfileImage: OPERATOR.profileImage, lastMessagePreview: '안녕하세요. 궁금한 점을 남겨주세요.', lastMessageAt: '2026-09-14T10:03:00', unread: 1 },
    { roomId: 2, type: 'STORE', storeId: 103, counterpartName: '예시 온기 카페', lastMessagePreview: '예약 가능한 시간을 함께 확인해 볼게요.', lastMessageAt: '2026-09-14T09:30:00' },
    { roomId: 3, type: 'STORE', storeId: 101, counterpartName: '예시 나무 공방', lastMessagePreview: '체험 가능한 시간을 안내드릴게요.', lastMessageAt: '2026-09-13T16:20:00', unread: 2 },
    { roomId: 4, type: 'STORE', storeId: 102, counterpartName: '예시 빛 스튜디오', lastMessagePreview: '문의하신 촬영 공간 안내입니다.', lastMessageAt: '2026-09-12T13:10:00' },
];

export default function MessengerHomePreview() {
    const width = useWindowWidth();
    const mobile = previewParams.get('surface') === 'page' || (previewParams.get('surface') !== 'panel' && width < 768);
    const [view, setView] = useState(() => ['home', 'conversations', 'settings'].includes(previewParams.get('view')) ? previewParams.get('view') : 'home');
    const [thread, setThread] = useState(() => previewParams.get('view') === 'thread' ? ROWS.find(row => String(row.roomId) === previewParams.get('room')) || ROWS[0] : null);
    const [dark, setDark] = useState(() => previewParams.get('theme') === 'dark');
    const [opened, setOpened] = useState(true);
    const [draft, setDraft] = useState('');
    const firstInquiry = previewParams.get('first') === '1' && thread?.type === 'SUPPORT';
    const changeView = value => { setView(value); setThread(null); };
    const choose = selection => {
        setView('conversations');
        setThread(selection.kind === 'support' ? ROWS[0] : ROWS.find(row => row.storeId === selection.storeId) || null);
    };
    const messages = thread ? [
        { id: 1, senderRole: 'MEMBER', content: '이 화면은 디자인 검증용 예시 대화예요.', createdAt: '2026-09-14T10:00:00' },
        { id: 2, senderRole: thread.type === 'SUPPORT' ? 'ADMIN' : 'OWNER', senderName: thread.counterpartName, senderProfileImage: thread.counterpartProfileImage, content: '안녕하세요. 문의하실 내용을 남겨주세요.', createdAt: '2026-09-14T10:01:00' },
        { id: 3, senderRole: thread.type === 'SUPPORT' ? 'ADMIN' : 'OWNER', senderName: thread.type === 'SUPPORT' ? SECOND_OPERATOR.name : thread.counterpartName, senderProfileImage: thread.type === 'SUPPORT' ? SECOND_OPERATOR.profileImage : undefined, content: '실제 계정이나 가게와 연결되지 않은 화면입니다.', createdAt: '2026-09-14T10:02:00' },
        { id: 4, senderRole: 'MEMBER', content: '사진, 말풍선, 하단 메뉴의 크기와 간격을 확인하고 있어요.', createdAt: '2026-09-14T10:03:00' },
    ] : [];
    const messenger = (
        <div className={`reserve-messenger reserve-messenger--${mobile ? 'page' : 'panel'} is-home${thread ? ' has-thread has-mobile-thread' : ''}`}>
            {thread ? (
                <section className="reserve-messenger-thread" aria-label={`${thread.counterpartName} 예시 대화`}>
                    <header className="reserve-messenger-thread-heading">
                        <button type="button" className="reserve-messenger-mobile-back" aria-label="예시 대화 목록으로 돌아가기" onClick={() => changeView('conversations')}><ArrowLeftOutlined aria-hidden="true" /></button>
                        <div className="reserve-messenger-thread-copy"><strong>{thread.counterpartName}</strong><span>디자인 검증 · 예시 데이터</span></div>
                    </header>
                    <div className={`reserve-messenger-thread-body${thread.type === 'SUPPORT' ? ' reserve-messenger-thread-body--support' : ''}`}>
                        {firstInquiry ? <MessengerSupportIntro userName={USER.name} operator={OPERATOR} draftLength={draft.length}
                            onChoose={question => setDraft(current => current ? `${current}\n${question}` : question)} /> : <ChatBubbleList mine="MEMBER" messages={messages} />}
                    </div>
                    <div className="reserve-messenger-composer-wrap">
                        <div className="reserve-chat-composer reserve-messenger-composer">
                            <textarea rows={1} aria-label="예시 메시지 입력 · 전송 비활성" placeholder="메시지를 입력하세요" value={draft}
                                onChange={event => setDraft(event.target.value)} maxLength={2000} disabled={!firstInquiry} />
                            <button type="button" className="reserve-chat-send reserve-messenger-send" aria-label="예시 메시지 전송 비활성" disabled><SendOutlined aria-hidden="true" /></button>
                        </div>
                    </div>
                </section>
            ) : view === 'home' ? (
                <MessengerHome operator={OPERATOR} coverImageSrc="/og-image.png" onChoose={choose} />
            ) : view === 'settings' ? (
                <MessengerSettings user={USER} notificationControl={mobile ? null : <div className="reserve-messenger-notification-control"><strong>PC 세션 알림</strong><p>디자인 프리뷰에서는 권한을 요청하거나 설정을 저장하지 않습니다.</p><button type="button" className="reserve-messenger-preview-disabled-control" disabled>프리뷰 · 알림 설정 비활성</button></div>} />
            ) : (
                <aside className="reserve-messenger-list" aria-label="예시 대화 목록">
                    <MessengerListHeading headingLevel={mobile ? 1 : 2} onRefresh={() => {}} />
                    <div className="reserve-messenger-list-scroll">{ROWS.map(row => <MessengerConversationRow key={row.roomId} row={row} selected={thread?.roomId === row.roomId} onSelect={() => setThread(row)} />)}</div>
                </aside>
            )}
            {!thread && <MessengerFooter view={view} unread={3} onChange={changeView} />}
        </div>
    );
    return (
        <ConfigProvider locale={koKR} theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { colorPrimary: '#3182f6' } }}>
            <AntApp><MemoryRouter initialEntries={['/design-preview']}>
                <main className={`reserve-messenger-preview${mobile ? ' reserve-messenger-preview--page' : ''}`} data-theme={dark ? 'dark' : 'light'}>
                    <header className="reserve-messenger-preview-header"><span className="reserve-header-logo-wordmark">RESERVE</span><span>디자인 검증 · 예시 데이터</span></header>
                    {!mobile && <section className="reserve-messenger-preview-guide"><h1>메신저 화면 미리보기</h1><p>예시 관리자와 여러 상대의 독립 대화입니다. 인증·API·전송·읽음·영구저장은 연결하지 않습니다.</p><button type="button" className="reserve-messenger-preview-control" onClick={() => setDark(value => !value)}>테마 전환</button></section>}
                    {opened ? mobile ? messenger : (
                        <div className="reserve-messenger-panel-shell reserve-messenger-preview-panel" role="dialog" aria-label="디자인 검증용 예시 메신저">
                            <button type="button" className="reserve-chat-close reserve-messenger-shell-close" aria-label="예시 메신저 닫기" onClick={() => setOpened(false)}><CloseOutlined aria-hidden="true" /></button>
                            {messenger}
                        </div>
                    ) : <button type="button" className="reserve-messenger-preview-control" onClick={() => { changeView('home'); setOpened(true); }}>예시 메신저 다시 열기</button>}
                </main>
            </MemoryRouter></AntApp>
        </ConfigProvider>
    );
}

createRoot(document.getElementById('root')).render(<MessengerHomePreview />);
