import { Typography, Collapse } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { colors, fontWeight, fontSize, heights } from '../../../styles/tokens';
import { FAQS } from '../Home.data';

const { Title, Text } = Typography;

const faqCollapseStyles = `
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
    // isMobile은 Home/index.jsx에서 한 번만 구독해서 prop으로 내려줌

    return (
        <div
            id="section-faq"
            style={{
                background: colors.gray[50],
                scrollMarginTop: heights.header,
                minHeight: `calc(100dvh - ${heights.header})`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: isMobile ? '60px 24px' : '60px 24px',
                boxSizing: 'border-box',
            }}
        >
            <style>{faqCollapseStyles}</style>
            <div style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
                <div className="reveal" style={{ marginBottom: isMobile ? 28 : 40, textAlign: 'left' }}>
                    <Title style={{ fontSize: 'clamp(22px, 4vw, 40px)', fontWeight: fontWeight.extrabold, color: colors.text.primary, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
                        자주 묻는 질문
                    </Title>
                    <Text style={{ fontSize: 15, color: colors.text.secondary }}>궁금한 점이 있으신가요?</Text>
                </div>

                {/* 박스 제거 — 회색 바탕에 얼은 구분선만 */}
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
        </div>
    );
}