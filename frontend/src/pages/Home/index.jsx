import { useEffect } from 'react';
import { colors } from '../../styles/tokens';
// 2026-07-30: Home 전용 useWindowWidth를 지우고 공용 훅으로 통합했다.
// Home 것만 디바운스가 없어서 창 크기를 조절하는 내내 매 프레임 리렌더가 났다
// (Home은 섹션 3개 + 목업까지 다시 그려서 가장 무거운 화면인데 하필 여기만 그랬다).
// 공용 훅은 150ms 디바운스 + SSR 가드가 있고, 반환값(window.innerWidth)은 동일하다.
import { useWindowWidth } from '../../hooks';
import { breakpoints } from '../../styles/tokens';
import { useScrollReveal } from './hooks/useScrollReveal';
import { SECTIONS } from './Home.constants';
import HeroSection from './sections/HeroSection';
import FeatureSection from './sections/FeatureSection';
import FaqSection from './sections/FaqSection';
import useDocumentTitle from '../../hooks/useDocumentTitle';

export default function Home() {
    // breakpoints.tablet(768) "이하"가 모바일 — 기존 `<= 768`과 같은 값이다(동작 변화 없음).
    const isMobile = useWindowWidth() <= breakpoints.tablet;
    useScrollReveal(isMobile);
    useDocumentTitle(null);  // 홈 — 기본 타이틀 사용 // 홈은 'RESERVE'만 표시
    useEffect(() => { window.scrollTo(0, 0); }, []);

    return (
        <div style={{ backgroundColor: colors.background.default, overflowX: 'hidden' }}>

            <HeroSection isMobile={isMobile} />

            {SECTIONS.map((sec, i) => (
                <FeatureSection key={sec.id} sec={sec} index={i} isMobile={isMobile} />
            ))}

            <FaqSection isMobile={isMobile} />

            <style>{`
                .slide-up {
                    opacity: 0;
                    transform: translateY(16px);
                    animation: slideUp 0.75s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                }
                @keyframes slideUp { to { opacity: 1; transform: translateY(0); } }

                .cursor {
                    display: inline-block; width: 4px; height: 0.88em;
                    background: ${colors.text.primary}; border-radius: 2.5px;
                    vertical-align: middle; margin-left: 5px;
                    animation: blink 0.53s step-end infinite;
                }
                @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

                .bounce-arrow { animation: bounceY 1.6s ease-in-out infinite; }
                @keyframes bounceAppear { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes bounceY { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(7px); } }

                .reveal {
                    opacity: 0; transform: translateY(28px);
                    transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .reveal-delayed { transition-delay: 0.18s; }
                .rv { opacity: 1 !important; transform: translateY(0) !important; }
            `}</style>
        </div>
    );
}
