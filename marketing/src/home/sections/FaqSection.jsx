import { Typography, Collapse } from '../../primitives.jsx';
import { DownOutlined } from '../../../../frontend/src/components/common/icons.js';
import { colors, fontWeight, fontSize, heights } from '../../../../frontend/src/styles/tokens/index.js';
import { FAQS } from '../Home.data';

const { Title, Text } = Typography;

export const faqCollapseStyles = `
  .faq-collapse.ant-collapse {
    background: transparent !important;
    border: none !important;
  }
  .faq-collapse .ant-collapse-item {
    border: none !important;
    border-bottom: 1px solid ${colors.border.light} !important;
  }
  .faq-collapse .ant-collapse-item:first-child {
    border-top: 1px solid ${colors.border.light} !important;
  }
  .faq-collapse .ant-collapse-header {
    padding: 20px 0 !important;
    align-items: center !important;
    user-select: none;
  }
  .faq-collapse .ant-collapse-header-text {
    font-size: 15px;
    font-weight: ${fontWeight.medium};
    color: ${colors.text.primary};
    line-height: 1.5;
  }
  .faq-collapse .ant-collapse-expand-icon {
    color: ${colors.text.tertiary} !important;
  }
  .faq-collapse .ant-collapse-content {
    border-top: none !important;
    background: transparent !important;
  }
  .faq-collapse .ant-collapse-content-box {
    padding: 0 0 20px 0 !important;
    font-size: ${fontSize.sm} !important;
    color: ${colors.text.secondary} !important;
    line-height: 1.75 !important;
  }
  @media (max-width: 768px) {
    .faq-collapse .ant-collapse-header {
      padding: 16px 0 !important;
    }
    .faq-collapse .ant-collapse-header-text {
      font-size: ${fontSize.sm} !important;
    }
    .faq-collapse .ant-collapse-content-box {
      padding: 0 0 16px 0 !important;
      font-size: ${fontSize.xs} !important;
    }
  }
`;

const faqItems = FAQS.map((faq, i) => ({
    key: String(i),
    label: faq.q,
    children: faq.a,
}));

export default function FaqSection({ isMobile }) {
    // 부모에서 전달한 반응형 분기로 간격을 선택한다.

    return (
        <section className="marketing-scene marketing-scene--faq"
            id="section-faq"
            style={{
                background: colors.gray[50],
                minHeight: `calc(100svh - ${heights.header})`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: isMobile ? '60px 24px' : '60px 24px',
                boxSizing: 'border-box',
            }}
        >

            <div style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
                <div className="reveal" style={{ marginBottom: isMobile ? 28 : 40, textAlign: 'left' }}>
                    <Title level={2} style={{ fontSize: 'clamp(22px, 4vw, 40px)', fontWeight: fontWeight.extrabold, color: colors.text.primary, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
                        자주 묻는 질문
                    </Title>
                    <Text style={{ fontSize: 15, color: colors.text.secondary }}>궁금한 점이 있으신가요?</Text>
                </div>

                <div className="reveal">
                    <Collapse
                        className="faq-collapse"
                        accordion
                        items={faqItems}
                        expandIconPlacement="end"
                        expandIcon={({ isActive }) => (
                            <DownOutlined style={{
                                fontSize: 12,
                                transition: 'transform 0.25s',
                                transform: isActive ? 'rotate(180deg)' : 'rotate(0deg)',
                                color: colors.text.tertiary,
                            }} />
                        )}
                        bordered={false}
                    />
                </div>
            </div>
        </section>
    );
}
