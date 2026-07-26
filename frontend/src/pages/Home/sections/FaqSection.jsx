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
                // 이 섹션은 홈의 마지막이라 아래로 넘어갈 다음 섹션이 없다.
                // 다른 섹션이 화면을 꽉 채우는 건 V버튼으로 넘길 때 다음 섹션 침범을 막기 위한 것인데
                // (Home.styles.js 주석 참고) 여기엔 해당이 없어서, 모바일에서는 내용 높이만큼만 쓴다.
                // 예전엔 모바일에서도 높이를 강제해 마지막 질문 아래로 회색 여백이 크게 남았다.
                // 데스크톱은 기존 리듬을 유지하되 단위를 100svh로 맞춘다 — 홈의 나머지 섹션이 전부 svh이고,
                // dvh는 모바일에서 주소창이 접힐 때 커져서 여백이 한 번 더 벌어진다.
                minHeight: isMobile ? undefined : `calc(100svh - ${heights.header})`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                padding: '60px 24px',
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