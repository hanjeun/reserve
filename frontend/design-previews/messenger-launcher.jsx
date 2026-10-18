// Vite 개발용 시각 확인. 앱 라우트·인증 store·채팅 API를 가져오지 않는다.
import React from 'react';
import { createRoot } from 'react-dom/client';
import MessengerLauncherVisual from '../src/components/chat/MessengerLauncherVisual';
import '../src/index.css';

const cases = [
    { label: '라이트 · 메시지', theme: 'light', open: false },
    { label: '라이트 · 닫기 X', theme: 'light', open: true },
    { label: '사진 모드 · 자체 로고 예시', theme: 'light', open: false, image: '/icons/R_logo.png' },
    { label: '사진 실패 · 기본 아이콘 복귀', theme: 'light', open: false, image: '/design-previews/missing-launcher-image.png' },
    { label: '다크 · 메시지', theme: 'dark', open: false },
    { label: '다크 · 닫기 X', theme: 'dark', open: true },
];

createRoot(document.getElementById('root')).render(
    <main style={{ maxWidth: 920, padding: 24, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>메시지 런처 스타일 미리보기</h1>
        <p style={{ fontSize: 13, margin: '0 0 20px' }}>실제 시각 컴포넌트와 글로벌 CSS입니다. 인증·대화·광고 집계는 실행하지 않습니다.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {cases.map((item) => (
                <section key={item.label} data-theme={item.theme} style={{ background: 'var(--c-bg-paper)', color: 'var(--c-text-primary)', padding: 20, borderRadius: 16, border: '1px solid var(--c-border-default)' }}>
                    <h2 style={{ fontSize: 13, margin: '0 0 20px' }}>{item.label}</h2>
                    <button type="button" className={`reserve-chat-launcher reserve-messenger-launcher${item.open ? ' is-open' : ''}`} aria-label={item.label}>
                        <MessengerLauncherVisual isOpen={item.open} imageSrc={item.image} />
                    </button>
                </section>
            ))}
        </div>
    </main>,
);
