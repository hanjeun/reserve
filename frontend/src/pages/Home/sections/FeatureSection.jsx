import { Typography } from 'antd';
import { CheckCircleFilled } from '../../../components/common/icons';
import { colors } from '../../../styles/tokens';
import { styles } from '../Home.styles';

const { Title, Text } = Typography;

function SectionTitle({ title, blue, style }) {
    return (
        <Title level={2} style={style}>
            {title.map((line) => {
                const idx = line.indexOf(blue);
                if (idx === -1) return <div key={line}>{line}</div>;
                return (
                    <div key={line}>
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
    const { id, tag, title, blue, desc, points, Ui, reverse } = sec;
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
                            {desc.map((l) => (
                                <Text key={l} style={{ fontSize: 14, color: colors.text.secondary, lineHeight: 1.7, display: 'block' }}>{l}</Text>
                            ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                            {points.map((p) => (
                                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <CheckCircleFilled style={{ color: colors.primary.main, fontSize: 14 }} />
                                    <span style={{ fontSize: 14, color: colors.text.primary }}>{p}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/*
                     * 자체 최대 폭이 있는 목업을 넓은 칸에서도 가운데 정렬한다.
                     */}
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
                {/*
                 * 클래스별 태블릿 규칙을 적용한다. 시각 순서를 뒤집어도 DOM은 글·목업 순서를 유지한다.
                 */}
                <div className="rsv-feature-inner"
                     style={{ ...styles.sectionInner, flexDirection: reverse ? 'row-reverse' : 'row' }}>
                    <div className="reveal rsv-feature-text" style={styles.sectionText}>
                        <div style={styles.sectionTag}>{tag}</div>
                        <SectionTitle title={title} blue={blue} style={styles.sectionTitle} />
                        <div style={{ marginBottom: 24 }}>
                            {desc.map((l) => (
                                <Text key={l} style={{ fontSize: 16, color: colors.text.secondary, lineHeight: 1.75, display: 'block' }}>{l}</Text>
                            ))}
                        </div>
                        <div style={styles.pointList}>
                            {points.map((p) => (
                                <div key={p} style={styles.pointRow}>
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
