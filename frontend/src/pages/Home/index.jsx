import { useEffect } from 'react';
import { colors } from '../../styles/tokens';
import { useWindowWidth } from './hooks/useWindowWidth';
import { useScrollReveal } from './hooks/useScrollReveal';
import { SECTIONS } from './Home.constants';
import HeroSection from './sections/HeroSection';
import FeatureSection from './sections/FeatureSection';
import FaqSection from './sections/FaqSection';

export default function Home() {
    const isMobile = useWindowWidth() <= 768;
    useScrollReveal(isMobile); // isMobile 의존성 → 흰 화면 버그 수정

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
