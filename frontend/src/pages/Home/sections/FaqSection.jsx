import { Typography } from 'antd';
import { colors, radius, fontWeight, fontSize, heights } from '../../../styles/tokens';
import { FAQS } from '../Home.data';
import { useWindowWidth } from '../hooks/useWindowWidth';

const { Title, Text } = Typography;

export default function FaqSection() {
    const isMobile = useWindowWidth() <= 768;
    const faqList = FAQS;

    return (
        <div
            id="section-faq"
            style={{
                background: colors.gray[50],
                scrollMarginTop: heights.header,
                ...(isMobile ? {
                    padding: '80px 20px 32px', 
                    boxSizing: 'border-box',
                } : {
                    minHeight: `calc(100dvh - ${heights.header})`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center', 
                    padding: '60px 24px',
                    boxSizing: 'border-box',
                }),
            }}
        >
            <div style={{ maxWidth: 1000, margin: '0 auto', width: '100%' }}>
                <div className="reveal" style={{ 
                    marginBottom: isMobile ? 24 : 40, 
                    textAlign: 'left' 
                }}>
                    <Title style={{ fontSize: 'clamp(22px, 4vw, 40px)', fontWeight: fontWeight.extrabold, color: colors.text.primary, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
                        자주 묻는 질문
                    </Title>
                    <Text style={{ fontSize: 15, color: colors.text.secondary }}>궁금한 점이 있으신가요?</Text>
                </div>
                
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', 
                    gridAutoRows: '1fr', 
                    gap: isMobile ? 10 : 20,
                }}>
                    {faqList.map((faq, i) => (
                        <div key={i} className="reveal"
                            style={{ 
                                background: '#fff', 
                                borderRadius: radius['2xl'], 
                                padding: isMobile ? '16px 18px' : '28px 32px', 
                                border: `1px solid ${colors.border.light}`, 
                                boxShadow: '0 1px 4px rgba(0,0,0,0.04)', 
                                display: 'flex',
                                flexDirection: 'column',
                                transitionDelay: `${(i % 3) * 0.1}s` 
                            }}>
                            <div style={{ fontWeight: fontWeight.bold, fontSize: isMobile ? fontSize.base : fontSize.lg, color: colors.text.primary, marginBottom: 8 }}>{faq.q}</div>
                            <div style={{ fontSize: fontSize.sm, color: colors.text.secondary, lineHeight: 1.6 }}>{faq.a}</div>
                        </div>
                    ))}
                </div>
            </div>
            
            <div style={{ textAlign: 'center', paddingTop: isMobile ? 32 : 48 }}>
                <p style={{ color: colors.text.tertiary, fontSize: 13, margin: 0 }}>RESERVE &copy; 2026</p>
            </div>
        </div>
    );
}