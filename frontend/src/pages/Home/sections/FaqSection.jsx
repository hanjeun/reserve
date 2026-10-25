import { Typography, Collapse } from 'antd';
import { DownOutlined } from '../../../components/common/icons';
import { colors, fontWeight, heights } from '../../../styles/tokens';
import { FAQS } from '../Home.data';

const { Title, Text } = Typography;

const faqItems = FAQS.map((faq, i) => ({
    key: String(i),
    label: faq.q,
    children: faq.a,
}));

// 펼침 아이콘 — 클로저 의존이 없어 컴포넌트 밖에 둔다(렌더마다 새 함수를 만들지 않도록).
const renderFaqExpandIcon = () => (
    <DownOutlined style={{ fontSize: 12, color: colors.text.tertiary }} />
);

export default function FaqSection({ isMobile }) {
    // isMobile은 Home/index.jsx에서 한 번만 구독해서 prop으로 내려줌

    return (
        <div
            id="section-faq"
            style={{
                background: colors.gray[50],
                scrollMarginTop: heights.header,
                // 모바일의 마지막 섹션은 내용 높이에 맞추고 PC는 100svh 기준을 유지한다.

                minHeight: isMobile ? undefined : `calc(100svh - ${heights.header})`,
                display: 'flex',
                flexDirection: 'column',

                justifyContent: 'center',
                padding: '60px 24px',
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

                {/* 박스 제거 — 회색 바탕에 얼은 구분선만 */}
                <div className="reveal">
                    <Collapse
                        className="faq-collapse"
                        accordion
                        items={faqItems}
                        expandIconPlacement="end"
                        // 열림/닫힘 상태는 AntD 가 관리한다(비제어). 회전은 AntD 가 붙여주는
                        // .ant-collapse-item-active 클래스로 CSS 가 판정하므로 상태가 필요 없다.
                        expandIcon={renderFaqExpandIcon}
                        bordered={false}
                    />
                </div>
            </div>
        </div>
    );
}
