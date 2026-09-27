// 시각 fixture만 렌더한다. 인증 store·채팅 API·알림 권한은 호출하지 않는다.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ArrowLeftOutlined, CloseOutlined } from '@ant-design/icons';
import MessengerHome from '../src/components/chat/MessengerHome';
import MessengerFooter from '../src/components/chat/MessengerFooter';
import MessengerSettings from '../src/components/chat/MessengerSettings';
import MessengerConversationRow from '../src/components/chat/MessengerConversationRow';
import ChatBubbleList from '../src/components/chat/ChatBubbleList';
import '../src/index.css';

const rows = [
    { roomId: 1, type: 'SUPPORT', counterpartName: 'RESERVE 고객지원', lastMessagePreview: '서비스 이용 문의를 확인했습니다.', lastMessageAt: '2026-09-13T18:10:00' },
    { roomId: 2, type: 'STORE', storeId: 20, counterpartName: '예시 공방', lastMessagePreview: '체험 가능한 시간을 안내드릴게요.', lastMessageAt: '2026-09-13T17:20:00', unread: 2 },
    { roomId: 3, type: 'STORE', storeId: 21, counterpartName: '예시 스튜디오', lastMessagePreview: '문의하신 촬영 공간 안내입니다.', lastMessageAt: '2026-09-12T13:20:00' },
];

export default function Preview() {
    const [view, setView] = useState('home');
    const [thread, setThread] = useState(null);
    const [dark, setDark] = useState(false);
    const mobile = new URLSearchParams(window.location.search).get('surface') === 'page';
    const choose = selection => setThread(selection.kind === 'support' ? rows[0] : rows.find(row => row.storeId === selection.storeId));
    const nav = <MessengerFooter view={view} onChange={value => { setView(value); setThread(null); }} />;
    const messenger = (
        <div className={`reserve-messenger reserve-messenger--${mobile ? 'page' : 'panel'}${view !== 'conversations' && !thread ? ' is-home' : ''}${thread ? ' has-thread has-mobile-thread' : ''}`}>
            {thread ? <section className="reserve-messenger-thread">
                <header className="reserve-messenger-thread-heading">
                    <button type="button" className="reserve-messenger-mobile-back" aria-label="대화 목록으로 돌아가기" onClick={() => { setThread(null); setView('conversations'); }}><ArrowLeftOutlined /></button>
                    <strong>{thread.counterpartName}</strong>
                </header>
                <div className="reserve-messenger-thread-body">
                    <ChatBubbleList mine="MEMBER" messages={[
                        { id: 1, senderRole: 'MEMBER', content: '예약 전에 궁금한 점이 있어요.', createdAt: '2026-09-13T18:00:00' },
                        { id: 2, senderRole: thread.type === 'SUPPORT' ? 'ADMIN' : 'OWNER', content: '안녕하세요! 문의하실 내용을 남겨주세요.', createdAt: '2026-09-13T18:01:00' },
                    ]} />
                </div>
                <div className="reserve-messenger-composer-wrap"><div className="reserve-messenger-composer"><textarea aria-label="미리보기 입력 비활성" placeholder="시각 미리보기 · 실제 전송 없음" disabled /></div></div>
            </section> : view === 'home' ? <MessengerHome rows={rows.slice(0, 2)} showBrand={!mobile} recentState={{ loading: false, error: false }} onChoose={choose} onList={() => setView('conversations')} />
                : view === 'settings' ? <MessengerSettings user={{ name: '예시 사용자', email: 'demo@example.test' }} notificationControl={null} />
                    : <aside className="reserve-messenger-list" aria-label="대화 목록">
                        <header className="reserve-messenger-list-heading"><h2>대화</h2></header>
                        <div className="reserve-messenger-list-scroll">{rows.map(row => <MessengerConversationRow key={row.roomId} row={row} onSelect={() => setThread(row)} />)}</div>
                        <div className="reserve-messenger-new-inquiry"><button type="button" className="reserve-messenger-primary-action" onClick={() => choose({ kind: 'support' })}>관리자에게 문의</button></div>
                    </aside>}
            {!thread && nav}
        </div>
    );
    return <main data-theme={dark ? 'dark' : 'light'} style={{ minHeight: '100svh', background: 'var(--c-bg-paper)', color: 'var(--c-text-primary)' }}>
        {mobile ? <header style={{ height: 64, paddingInline: 20, display: 'flex', alignItems: 'center' }}><span className="reserve-header-logo-wordmark" style={{ color: 'var(--c-primary)' }}>RESERVE</span></header>
            : <div style={{ padding: 28 }}><h1 style={{ fontSize: 18 }}>메신저 시각 fixture</h1><p>예시 대화·프로필입니다. 실제 계정/API/전송/권한 호출 없음.</p><button type="button" onClick={() => setDark(value => !value)}>테마 전환</button></div>}
        {mobile ? messenger : <div className="reserve-messenger-panel-shell" role="dialog" aria-label="미리보기 메시지">
            <button type="button" className="reserve-chat-close reserve-messenger-shell-close" aria-label="미리보기 초기화" onClick={() => { setView('home'); setThread(null); }}><CloseOutlined /></button>
            {messenger}
        </div>}
    </main>;
}

createRoot(document.getElementById('root')).render(<MemoryRouter><Preview /></MemoryRouter>);
