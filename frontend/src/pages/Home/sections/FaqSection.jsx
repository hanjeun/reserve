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
  /* ★ AntD 6 클래스는 -title 이다. -header-text 는 AntD 5 이름이고 6에는 그 요소가 없어서
     이 블록이 통째로 죽어 있었다(2026-08-06 브라우저 실측) — 제목이 우리 토큰이 아니라
     AntD 기본 크기·색으로 렌더되고 있었다. 클래스 목록은 node_modules/@rc-component/collapse 에서 확인.
     같은 종류의 리네임 사고가 Select 에서도 있었다 — CLAUDE.md "antd 6 클래스명이 바뀌었다" 참고. */
  .faq-collapse .ant-collapse-title {
    font-size: 15px;
    font-weight: ${fontWeight.medium};
    color: ${colors.text.primary};
    line-height: 1.5;
  }
  .faq-collapse .ant-collapse-expand-icon {
    color: ${colors.text.tertiary} !important;
  }
  /* ── 화살표 회전 — 왕복 180도 (정석) ────────────────────────────────────
     펼치면 시계방향으로 180도, 접으면 같은 길을 반시계로 되돌아온다.
     "같은 문을 열고 닫는다"는 물리 은유이고, Material·iOS·Bootstrap·AntD 기본값이 모두 이 방식이다.
     같은 꺾쇠를 쓰는 드롭다운(index.css 의 .ant-select-open .ant-select-suffix)도 동일하므로,
     제품 전체가 하나의 규칙을 따른다.

     ★ 닫힘 상태에 rotate(0deg) 를 반드시 명시한다.
       transform: none 과 rotate(180deg) 사이를 전환하면 브라우저는 각도가 아니라 행렬을 보간한다.
       정확히 180도는 행렬 분해에서 방향이 결정되지 않는 퇴화 케이스라 엔진이 임의로 방향을 고르고,
       그 결과 "펼칠 때 반시계로 돈다"가 된다(2026-08-04 브라우저 실측으로 확정한 원인).
       두 끝값을 모두 각도로 두면 0deg → 180deg 를 각도 보간해서 시계방향이 보장된다.

     ★ 회전 대상은 svg 가 아니라 이 span(.ant-collapse-arrow) 이다.
       드롭다운 꺾쇠도 span(.ant-select-suffix) 을 돌리므로 방식을 통일했다.
       AntD 는 이 요소에 transition 만 걸고 transform 은 건드리지 않는다(RTL 제외) —
       antd/es/collapse/style/index.js 에서 확인. 즉 우리가 transform 을 가져가도 충돌하지 않는다.

     ※ 한때 패널별 토글 횟수를 세어 항상 같은 방향으로 도는 방식(연속 360도)을 넣었다가
       정석대로 왕복으로 되돌렸다. 그 방식은 CSS 만으로는 불가능해서 상태가 필요했는데,
       왕복은 CSS 두 줄로 끝난다 — 상태를 없앨 수 있으면 없애는 쪽이 맞다.

     ※ 이 블록은 JS template literal 안이다. 주석에도 백틱을 쓰면 문자열이 그 자리에서
       끝나 버려 앱이 통째로 안 뜬다(실제로 한 번 그렇게 깨뜨렸다). 코드명은 따옴표 없이 적을 것. */
  .faq-collapse .ant-collapse-arrow {
    transform: rotate(0deg);
    transform-origin: center;
    transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .faq-collapse .ant-collapse-item-active .ant-collapse-arrow {
    transform: rotate(180deg);
  }
  /* 모션 최소화를 켠 사용자에게는 회전을 즉시 적용한다(최종 각도는 그대로). */
  @media (prefers-reduced-motion: reduce) {
    .faq-collapse .ant-collapse-arrow { transition: none; }
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
    .faq-collapse .ant-collapse-title {
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