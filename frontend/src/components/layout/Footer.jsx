import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Divider, Typography } from 'antd';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

const { Text } = Typography;

const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);
    return isMobile;
};

const GithubIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
);

// Velog 공식 Simple Icons SVG (CC0 1.0)
const VelogIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 0C1.338 0 0 1.338 0 3v18c0 1.662 1.338 3 3 3h18c1.662 0 3-1.338 3-3V3c0-1.662-1.338-3-3-3H3Zm6.883 6.25c.63 0 1.005.3 1.125.9l1.463 8.303c.465-.615.846-1.133 1.146-1.553.465-.66.893-1.418 1.283-2.273.405-.855.608-1.62.608-2.295 0-.405-.113-.727-.338-.967-.21-.255-.608-.577-1.193-.967.6-.765 1.35-1.148 2.25-1.148.48 0 .878.143 1.193.428.33.285.494.704.494 1.26 0 .93-.39 2.093-1.17 3.488-.765 1.38-2.241 3.457-4.431 6.232l-2.227.156-1.711-9.628h-2.25V7.24c.6-.195 1.305-.406 2.115-.63.81-.24 1.358-.36 1.643-.36Z"/>
    </svg>
);

const SocialBtn = ({ href, icon, label }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', border: `1.5px solid ${colors.border.default}`, color: colors.text.tertiary, background: 'transparent', transition: 'all 0.18s', textDecoration: 'none' }}
        onMouseEnter={e => { e.currentTarget.style.background = colors.text.primary; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = colors.text.primary; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.text.tertiary; e.currentTarget.style.borderColor = colors.border.default; }}>
        {icon}
    </a>
);

const FooterLink = ({ label, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        style={{ fontSize: fontSize.sm, color: colors.text.tertiary, cursor: 'pointer', transition: 'color 0.15s', whiteSpace: 'nowrap', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}
        onMouseEnter={e => { e.currentTarget.style.color = colors.text.primary; }}
        onMouseLeave={e => { e.currentTarget.style.color = colors.text.tertiary; }}>
        {label}
    </button>
);

const ExternalLink = ({ href, label }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: fontSize.sm, color: colors.text.tertiary, textDecoration: 'none', whiteSpace: 'nowrap', transition: 'color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.color = colors.text.primary}
        onMouseLeave={e => e.currentTarget.style.color = colors.text.tertiary}>
        {label}
    </a>
);

const AppFooter = () => {
    const navigate = useNavigate();
    const isMobile = useIsMobile();

    const LeftBlock = (
        <div style={{ fontSize: 12, color: colors.text.tertiary, lineHeight: 1.8 }}>
            © 2026 RESERVE &middot; 본 서비스는 포트폴리오 목적으로 제작되었습니다.<br />
            호스팅 서비스 제공자: Amazon Web Services (AWS)
        </div>
    );

    const RightBlock = (
        <div style={{ fontSize: 12, color: colors.text.tertiary, textAlign: isMobile ? 'left' : 'right', lineHeight: 1.8 }}>
            대표자 한재은 &middot; 개인정보 보호책임자 한재은<br />
            <a href="mailto:hanjeun111@gmail.com"
                style={{ color: 'inherit', textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = colors.text.primary}
                onMouseLeave={e => e.currentTarget.style.color = colors.text.tertiary}>
                hanjeun111@gmail.com
            </a>
        </div>
    );
    return (
        <footer style={{ backgroundColor: colors.background.surface, borderTop: `1px solid ${colors.border.light}`, padding: '0 24px 36px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', paddingTop: 48 }}>

                {/* 상단 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 40, flexWrap: 'wrap', marginBottom: 28 }}>

                    {/* 브랜드 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: colors.primary.main, letterSpacing: '-0.5px' }}>RESERVE</div>
                        <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary, lineHeight: 1.7 }}>
                            전국 맛집 예약 플랫폼.<br />
                            식당 예약부터 결제까지 한 번에.
                        </Text>
                        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                            <SocialBtn href="https://github.com/hanjeun/reserve" icon={<GithubIcon />} label="GitHub" />
                            <SocialBtn href="https://velog.io/@hanjeun/series/RESERVE" icon={<VelogIcon />} label="Velog" />
                        </div>
                    </div>

                    {/* 링크 */}
                    <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Text style={{ fontSize: 11, fontWeight: fontWeight.semibold, color: colors.text.secondary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>서비스</Text>
                            <FooterLink label="식당 탐색" onClick={() => navigate('/stores')} />
                            <FooterLink label="예약 확인" onClick={() => navigate('/my-reservations')} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Text style={{ fontSize: 11, fontWeight: fontWeight.semibold, color: colors.text.secondary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>법적 고지</Text>
                            <FooterLink label="서비스 이용약관" onClick={() => navigate('/terms')} />
                            <FooterLink label="개인정보 처리방침" onClick={() => navigate('/privacy')} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Text style={{ fontSize: 11, fontWeight: fontWeight.semibold, color: colors.text.secondary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>개발자</Text>
                            <ExternalLink href="https://velog.io/@hanjeun/series/RESERVE" label="개발 블로그 →" />
                            <ExternalLink href="https://github.com/hanjeun/reserve" label="GitHub 저장소 →" />
                            <a href="mailto:reserve@reserve.it.kr"
                                style={{ fontSize: fontSize.sm, color: colors.text.tertiary, textDecoration: 'none', whiteSpace: 'nowrap', transition: 'color 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.color = colors.text.primary}
                                onMouseLeave={e => e.currentTarget.style.color = colors.text.tertiary}>
                                문의하기
                            </a>
                        </div>
                    </div>
                </div>

                {/* 하단 카피라이트 — 모바일: 대표자 위, 호스팅 아래 / PC: 좌우 분리 */}
                <Divider style={{ margin: '0 0 16px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    {isMobile ? <>{RightBlock}{LeftBlock}</> : <>{LeftBlock}{RightBlock}</>}
                </div>
            </div>
        </footer>
    );
};

export default AppFooter;
