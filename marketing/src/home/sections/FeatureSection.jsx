import { Typography } from '../../primitives.jsx';
import { CheckCircleFilled } from '../../../../frontend/src/components/common/icons.js';
import { colors } from '../../../../frontend/src/styles/tokens/index.js';
import { styles } from '../Home.styles';
import TypingLine from '../../TypingLine';
import { splitLine } from '../../typing';

const { Title, Text } = Typography;

function SectionTitle({ title, blue, style }) {
    return (
        <Title level={2} style={style} data-marketing-section-title aria-label={title.join(' ')}>
            {title.map((line, index) => <TypingLine key={index} line={splitLine(line, blue)} reserveSpace />)}
        </Title>
    );
}

export default function FeatureSection({ sec, index, isMobile }) {
    const { id, tag, title, blue, desc, points, Ui, UiMobile, reverse } = sec;
    const bgColor = index % 2 === 1 ? colors.background.subtle : colors.background.paper;

    if (isMobile) {
        return (
            <section className="marketing-scene"
                id={id}
                style={{
                    ...styles.sectionMobile,
                    background: bgColor,
                    // 해당 모바일 섹션은 기본 패딩을 덮어써 상하 여백을 확보한다.
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
                    <div className="reveal reveal-delayed" style={{ width: '100%' }}>
                        <Ui />
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="marketing-scene" id={id} style={{ ...styles.section, background: bgColor }}>
            <div style={styles.sectionBody}>
                <div style={{ ...styles.sectionInner, flexDirection: reverse ? 'row-reverse' : 'row' }}>
                    <div className="reveal" style={styles.sectionText}>
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
                    <div className="reveal reveal-delayed" style={styles.sectionUI}>
                        <Ui />
                    </div>
                </div>
            </div>
        </section>
    );
}
