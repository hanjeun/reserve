import { Typography } from 'antd';
import { colors, radius, fontWeight, fontSize, heights } from '../../../styles/tokens';
import { FAQS } from '../Home.data';

const { Title, Text } = Typography;

export default function FaqSection({ isMobile }) {
    const faqList = FAQS;

    return (
        <div
            id="section-faq"
            style={{
                background: colors.gray[50],
                scrollMarginTop: heights.header,
                ...(isMobile ? {
                    minHeight: `calc(100dvh - ${heights.header})`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '36px 20px 0',
                    boxSizing: 'border-box',
                } : {
                    padding: '100px 24px 60px',
                }),
            }}
        >
            <div style={{ maxWidth: 1000, margin: '0 auto', width: '100%' }}>
                <div className="reveal" style={{ marginBottom: isMobile ? 24 : 56 }}>
                    <Title style={{ fontSize: 'clamp(22px, 4vw, 40px)', fontWeight: fontWeight.extrabold, color: colors.text.primary, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
                        자주 묻는 질문
                    </Title>
                    <Text style={{ fontSize: 15, color: colors.text.secondary }}>궁금한 점이 있으신가요?</Text>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(380px, 1fr))', gap: isMobile ? 10 : 12 }}>
                    {faqList.map((faq, i) => (
                        <div key={i} className="reveal"
                            style={{ background: '#fff', borderRadius: radius['2xl'], padding: isMobile ? '16px 18px' : '24px 28px', border: `1px solid ${colors.border.light}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transitionDelay: `${(i % 2) * 0.1}s` }}>
                            <div style={{ fontWeight: fontWeight.bold, fontSize: isMobile ? fontSize.base : fontSize.lg, color: colors.text.primary, marginBottom: 6 }}>{faq.q}</div>
                            <div style={{ fontSize: fontSize.sm, color: colors.text.secondary, lineHeight: 1.65 }}>{faq.a}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            {isMobile ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <p style={{ color: colors.text.tertiary, fontSize: 13, margin: 0 }}>RESERVE &copy; 2026</p>
                </div>
            ) : (
                <div style={{ background: colors.background.default, borderTop: `1px solid ${colors.border.light}`, padding: '28px 24px', textAlign: 'center', marginTop: 60, marginLeft: -24, marginRight: -24, marginBottom: -60 }}>
                    <p style={{ color: colors.text.tertiary, fontSize: 13, margin: 0 }}>RESERVE &copy; 2026</p>
                </div>
            )}
        </div>
    );
}
