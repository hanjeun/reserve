import { Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { colors, fontWeight } from '../../../styles/tokens';
import { Button } from '../../../components/common';
import { useLineLoop, LINES } from '../hooks/useLineLoop';
import { styles } from '../Home.styles';
import BounceArrow from './BounceArrow';

const { Title, Text } = Typography;

function renderParts(current, line) {
    const bl = line.before.length, be = bl + line.blue.length;
    const b = current.slice(0, Math.min(current.length, bl));
    const m = current.length > bl ? current.slice(bl, Math.min(current.length, be)) : '';
    const a = current.length > be ? current.slice(be) : '';
    return (
        <>
            {b && <span style={{ fontWeight: fontWeight.extrabold, color: colors.text.primary }}>{b}</span>}
            {m && <span style={{ fontWeight: fontWeight.extrabold, color: colors.primary.main }}>{m}</span>}
            {a && <span style={{ fontWeight: fontWeight.extrabold, color: colors.text.primary }}>{a}</span>}
        </>
    );
}

export default function HeroSection({ isMobile }) {
    const navigate = useNavigate();
    const { current, lineIdx } = useLineLoop();

    return (
        <div style={{ ...styles.contentArea, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* 다른 섹션들과 동일한 maxWidth 1000 박스 */}
            <div style={{ width: '100%', maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className="slide-up" style={{ ...styles.badge, animationDelay: '0.05s' }}>
                    가장 쉬운 예약 경험
                </div>
                <div className="slide-up" style={{ ...styles.titleContainer, animationDelay: '0.18s' }}>
                    <Title style={styles.mainTitle}>
                        <div style={styles.lineWrapper}>미식의 즐거움,</div>
                        <div style={styles.lineWrapper}>
                            {renderParts(current, LINES[lineIdx])}
                            <span className="cursor" />
                        </div>
                    </Title>
                </div>
                <div className="slide-up" style={{ animationDelay: '0.28s', textAlign: 'center' }}>
                    <Text style={styles.subTitle}>
                        기다림 없는 완벽한 하루를 위해,<br />
                        전국 맛집 예약을 가장 빠르게 도와드립니다.
                    </Text>
                </div>
                <div className="slide-up" style={{ animationDelay: '0.36s', marginTop: 32 }}>
                    <Button variant="hero" onClick={() => navigate('/stores')} style={styles.heroBtn}>
                        지금 식당 둘러보기
                        <ArrowRightOutlined style={{ marginLeft: 8, fontSize: 17 }} />
                    </Button>
                </div>
            </div>
            <BounceArrow
                targetId="section-0"
                style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    opacity: 0,
                    animation: `bounceAppear 0.75s cubic-bezier(0.22,1,0.36,1) ${isMobile ? '0.8s' : '0.6s'} forwards, bounceY 1.6s ease-in-out 1.5s infinite`,
                }}
            />
        </div>
    );
}
