import React, { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Divider, Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { colors, fontSize } from '../../styles/tokens';

const InquiryModal = lazy(() => import('../common/InquiryModal'));
const { Text } = Typography;

const GithubIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57C20.565 22.092 24 17.592 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
);

const VelogIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 0C1.338 0 0 1.338 0 3v18c0 1.662 1.338 3 3 3h18c1.662 0 3-1.338 3-3V3c0-1.662-1.338-3-3-3H3Zm6.883 6.25c.63 0 1.005.3 1.125.9l1.463 8.303c.465-.615.846-1.133 1.146-1.553.465-.66.893-1.418 1.283-2.273.405-.855.608-1.62.608-2.295 0-.405-.113-.727-.338-.967-.21-.255-.608-.577-1.193-.967.6-.765 1.35-1.148 2.25-1.148.48 0 .878.143 1.193.428.33.285.494.704.494 1.26 0 .93-.39 2.093-1.17 3.488-.765 1.38-2.241 3.457-4.431 6.232l-2.227.156-1.711-9.628h-2.25V7.24c.6-.195 1.305-.406 2.115-.63.81-.24 1.358-.36 1.643-.36Z" />
    </svg>
);

const SocialBtn = ({ href, icon, label, variant }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={`reserve-social${variant ? ` reserve-social--${variant}` : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', border: `1.5px solid ${colors.border.default}`, color: colors.text.tertiary, background: 'transparent', transition: 'all 0.18s', textDecoration: 'none' }}
    >
        {icon}
    </a>
);

const FooterLink = ({ label, onClick }) => (
    <button type="button" onClick={onClick} className="reserve-app-footer-link">
        {label}
    </button>
);

const ExternalLink = ({ href, label }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="reserve-app-footer-link reserve-app-footer-link--external">
        {label}
        <ArrowRightOutlined aria-hidden="true" />
    </a>
);

const AppFooter = () => {
    const navigate = useNavigate();
    const [inquiryOpen, setInquiryOpen] = useState(false);
    const [inquiryLoaded, setInquiryLoaded] = useState(false);

    const openInquiry = () => {
        setInquiryLoaded(true);
        setInquiryOpen(true);
    };

    return (
        <>
            {inquiryLoaded && (
                <Suspense fallback={null}>
                    <InquiryModal open={inquiryOpen} onClose={() => setInquiryOpen(false)} />
                </Suspense>
            )}

            <footer
                className="reserve-app-footer"
                style={{ backgroundColor: colors.background.surface, borderTop: `1px solid ${colors.border.light}`, padding: '0 24px 36px' }}
            >
                <div className="reserve-app-footer-inner" style={{ maxWidth: 1100, margin: '0 auto', paddingTop: 48 }}>
                    <div className="reserve-app-footer-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 40, flexWrap: 'wrap', marginBottom: 28 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280 }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: colors.primary.main, letterSpacing: '-0.5px' }}>RESERVE</div>
                            <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary, lineHeight: 1.7 }}>
                                예약이 필요한 순간,<br />
                                예약부터 결제까지 한 번에.
                            </Text>
                            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                <SocialBtn href="https://github.com/hanjeun/reserve" icon={<GithubIcon />} label="GitHub" />
                                <SocialBtn href="https://velog.io/@hanjeun/series/RESERVE" icon={<VelogIcon />} label="Velog" variant="velog" />
                            </div>
                        </div>

                        <div className="reserve-app-footer-links">
                            <div className="reserve-app-footer-section">
                                <Text className="reserve-app-footer-heading">서비스</Text>
                                <FooterLink label="가게 탐색" onClick={() => navigate('/stores')} />
                                <FooterLink label="예약 확인" onClick={() => navigate('/my-reservations')} />
                                <FooterLink label="운영 안내" onClick={() => navigate('/operation-guide')} />
                            </div>
                            <div className="reserve-app-footer-section">
                                <Text className="reserve-app-footer-heading">법적 고지</Text>
                                <FooterLink label="서비스 이용약관" onClick={() => navigate('/terms')} />
                                <FooterLink label="개인정보 처리방침" onClick={() => navigate('/privacy')} />
                                <FooterLink label="콘텐츠 출처·권리" onClick={() => navigate('/content-sources')} />
                            </div>
                            <div className="reserve-app-footer-section">
                                <Text className="reserve-app-footer-heading">개발자</Text>
                                <ExternalLink href="https://velog.io/@hanjeun/series/RESERVE" label="개발 블로그" />
                                <ExternalLink href="https://github.com/hanjeun/reserve" label="GitHub 저장소" />
                                <FooterLink label="문의하기" onClick={openInquiry} />
                            </div>
                        </div>
                    </div>

                    <Divider style={{ margin: '0 0 16px' }} />
                    <div className="footer-copyright">
                        <div className="footer-copyright-left" style={{ color: colors.text.tertiary }}>
                            © 2026 RESERVE &middot; 본 서비스는 포트폴리오 목적으로 제작되었습니다.<br />
                            호스팅 서비스 제공자: Amazon Web Services (AWS)
                        </div>
                        <div className="footer-copyright-right" style={{ color: colors.text.tertiary }}>
                            대표자 한재은 &middot; 개인정보 보호책임자 한재은<br />
                            <a href="mailto:hanjeun111@gmail.com" className="reserve-app-footer-email">hanjeun111@gmail.com</a>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    );
};

export default AppFooter;
