import { Typography, Collapse } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { colors, fontWeight, heights } from '../../../styles/tokens';
import { FAQS } from '../Home.data';

const { Title, Text } = Typography;

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
                // ★ 2026-08-04 — flex-start → center.
                //   섹션 높이는 100svh로 고정인데 내용은 그보다 짧다. flex-start면 남는 높이가
                //   **전부 아래로** 몰려서 "위는 타이트하고 아래만 텅 빈" 비대칭이 된다
                //   (실측: 내용 약 750px / 섹션 약 1050px → 아래 여백만 300px).
                //   center면 남는 높이가 위아래로 나뉘어 시각적 균형이 맞는다.
                //   섹션 높이 자체는 그대로라 V버튼 스크롤 스냅 동작에는 영향이 없다.
                justifyContent: 'center',
                padding: '60px 24px',
                boxSizing: 'border-box',
            }}
        >
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
                        // 열림/닫힘 상태는 AntD 가 관리한다(비제어). 회전은 AntD 가 붙여주는
                        // .ant-collapse-item-active 클래스로 CSS 가 판정하므로 상태가 필요 없다.
                        expandIcon={() => (
                            <DownOutlined style={{ fontSize: 12, color: colors.text.tertiary }} />
                        )}
                        bordered={false}
                    />
                </div>
            </div>
        </div>
    );
}
