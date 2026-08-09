import { Typography } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { colors } from '../../../styles/tokens';
import { styles } from '../Home.styles';

const { Title, Text } = Typography;

function SectionTitle({ title, blue, style }) {
    return (
        <Title style={style}>
            {title.map((line, j) => {
                const idx = line.indexOf(blue);
                if (idx === -1) return <div key={j}>{line}</div>;
                return (
                    <div key={j}>
                        {line.slice(0, idx)}
                        <span style={{ color: colors.primary.main }}>{blue}</span>
                        {line.slice(idx + blue.length)}
                    </div>
                );
            })}
        </Title>
    );
}

export default function FeatureSection({ sec, index, isMobile }) {
    const { id, tag, title, blue, desc, points, Ui, UiMobile, reverse } = sec;
    const bgColor = index % 2 === 1 ? colors.background.subtle : colors.background.default;

    if (isMobile) {
        return (
            <div 
                id={id} 
                style={{ 
                    ...styles.sectionMobile, 
                    background: bgColor,
                    // shorthand로 통일: sectionMobile의 padding을 덮어쓰되, 해당 인덱스만 상하 안줷을 탈되게 확보
                    ...((index === 1 || index === 2) && { 
                        padding: '80px 20px',
                    })
                }}
            >
                <div style={styles.sectionBodyMobile}>
                    <div className="reveal" style={styles.sectionTextMobile}>
                        <div style={styles.sectionTag}>{tag}</div>
                        <SectionTitle title={title} blue={blue} style={styles.sectionTitleMobile} />
                        <div style={{ marginBottom: 16 }}>
                            {desc.map((l, j) => (
                                <Text key={j} style={{ fontSize: 14, color: colors.text.secondary, lineHeight: 1.7, display: 'block' }}>{l}</Text>
                            ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                            {points.map((p, j) => (
                                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <CheckCircleFilled style={{ color: colors.primary.main, fontSize: 14 }} />
                                    <span style={{ fontSize: 14, color: colors.text.primary }}>{p}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* 목업을 가운데 정렬한다.
                        MockStoreList 등은 자체적으로 width:100% + maxWidth:380을 갖는데, 블록 요소라
                        부모가 그보다 넓으면 왼쪽에 붙는다. 폰(390px)은 좌우 패딩 20을 빼면 350px라
                        380보다 좁아서 어차피 꽉 차 티가 안 났지만, 태블릿 세로(768px)에서는 부모가
                        728px라 380px 목업이 왼쪽에 쏠리고 오른쪽에 348px 여백이 생겼다.
                        justifyContent만 걸면 폰에서는 결과가 완전히 동일하고(이미 꽉 참) 태블릿만 고쳐진다.

                        ※ sec에는 UiMobile(MockStoreListMobile 등)도 정의돼 있지만 지금 렌더에 쓰이지 않는다.
                          여기서 Ui → UiMobile로 바꾸면 폰 화면까지 같이 바뀌므로 건드리지 않았다.
                          모바일 전용 목업으로 갈지는 별도 판단이 필요하다. */}
                    <div className="reveal reveal-delayed" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        <Ui />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div id={id} style={{ ...styles.section, background: bgColor }}>
            <div style={styles.sectionBody}>
                {/* rsv-feature-* 클래스는 **태블릿 구간(769~1023px)** 전용 규칙을 받기 위한 것이다.
                    index.css 의 "홈 기능 섹션 — 태블릿" 블록 참고.
                    · 폰(≤768)은 위쪽 isMobile 분기라 이 마크업을 아예 렌더하지 않는다
                    · PC(≥1024)는 미디어쿼리 범위 밖이라 규칙이 적용되지 않는다
                    → 태블릿만 고쳐도 두 쪽에 영향이 없다.
                    reverse 는 flexDirection: row-reverse 로 처리하므로 **DOM 순서는 항상 글 → 목업**이다.
                    그래도 위치 선택자(:first-child) 대신 클래스를 쓴다 — 나중에 순서가 바뀌면 조용히 어긋난다. */}
                <div className="rsv-feature-inner"
                     style={{ ...styles.sectionInner, flexDirection: reverse ? 'row-reverse' : 'row' }}>
                    <div className="reveal rsv-feature-text" style={styles.sectionText}>
                        <div style={styles.sectionTag}>{tag}</div>
                        <SectionTitle title={title} blue={blue} style={styles.sectionTitle} />
                        <div style={{ marginBottom: 24 }}>
                            {desc.map((l, j) => (
                                <Text key={j} style={{ fontSize: 16, color: colors.text.secondary, lineHeight: 1.75, display: 'block' }}>{l}</Text>
                            ))}
                        </div>
                        <div style={styles.pointList}>
                            {points.map((p, j) => (
                                <div key={j} style={styles.pointRow}>
                                    <CheckCircleFilled style={{ color: colors.primary.main, fontSize: 16 }} />
                                    <span style={{ fontSize: 15, color: colors.text.primary }}>{p}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="reveal reveal-delayed rsv-feature-ui" style={styles.sectionUI}>
                        <Ui />
                    </div>
                </div>
            </div>
        </div>
    );
}