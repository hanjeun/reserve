import { Typography } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { colors } from '../../../styles/tokens';
import { SECTION_IDS } from '../Home.constants';
import { styles } from '../Home.styles';
import BounceArrow from './BounceArrow';

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
    const bgColor = index % 2 === 1 ? colors.background.subtle : '#fff';
    const nextId = SECTION_IDS[index + 1] || 'section-faq';

    if (isMobile) {
        return (
            <div id={id} style={{ ...styles.sectionMobile, background: bgColor }}>
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
                    {/* 컴포넌트 참조 → 렌더 시 동적 생성 (useState 버그 수정) */}
                    <div className="reveal reveal-delayed">
                        <UiMobile />
                    </div>
                </div>
                <div style={styles.sectionArrow}>
                    <BounceArrow targetId={nextId} />
                </div>
            </div>
        );
    }

    return (
        <div id={id} style={{ ...styles.section, background: bgColor }}>
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
            <div style={styles.sectionArrow}>
                <BounceArrow targetId={nextId} />
            </div>
        </div>
    );
}
