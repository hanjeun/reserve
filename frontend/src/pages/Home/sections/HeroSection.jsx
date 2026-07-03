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

const ANIMATION = `bounceAppear 0.75s cubic-bezier(0.22,1,0.36,1) 0.6s forwards, bounceY 1.6s ease-in-out 1.5s infinite`;

export default function HeroSection({ isMobile }) {
    const navigate = useNavigate();
    const { current, lineIdx } = useLineLoop();

    return (
        <div style={{
            ...styles.contentArea,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: isMobile ? '0 20px' : '0 24px',
        }}>

            {/* ── 상단 spacer: 콘텐츠를 세로 중앙으로 밀어올림 ── */}
            <div style={{ flex: 1 }} />

            {/* ── 메인 콘텐츠 ── */}
            <div style={{
                width: '100%',
                maxWidth: 1000,
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
            }}>
                <div className="slide-up" style={{ ...styles.badge, animationDelay: '0.05s' }}>
                    가장 쉬운 예약 경험
                </div>
                <div className="slide-up" style={{ ...styles.titleContainer, animationDelay: '0.18s' }}>
                    <Title style={styles.mainTitle}>
                        <div style={styles.lineWrapper}>예약이 필요한 순간,</div>
                        <div style={styles.lineWrapper}>
                            {renderParts(current, LINES[lineIdx])}
                            <span className="cursor" />
                        </div>
                    </Title>
                </div>
                <div className="slide-up" style={{ animationDelay: '0.28s', textAlign: 'center' }}>
                    <Text style={styles.subTitle}>
                        기다림 없는 완벽한 하루를 위해,<br />
                        원하는 예약을 가장 빠르게 도와드립니다.
                    </Text>
                </div>
                <div className="slide-up" style={{ animationDelay: '0.36s', marginTop: 32 }}>
                    <Button variant="hero" onClick={() => navigate('/stores')} style={styles.heroBtn}>
                        지금 둘러보기
                        <ArrowRightOutlined style={{ marginLeft: 8, fontSize: 17 }} />
                    </Button>
                </div>
            </div>

            {/* ── 하단 spacer: 콘텐츠를 세로 중앙으로 밀어내림 ── */}
            <div style={{ flex: 1 }} />

            {/* ── BounceArrow ──
              * 모바일: flex 마지막 자식 → spacer 아래, 컨테이너 하단에 자연스럽게 붙음
              * PC:     absolute bottom:0 유지 (콘텐츠 흐름 밖)
              */}
            <BounceArrow
                targetId="section-0"
                style={{
                    position: 'absolute',
                    bottom: isMobile ? 10 : 0,  // ✨ 핵심: 모바일은 띄우고, PC는 바닥에 붙임
                    left: 0,
                    right: 0,
                    opacity: 0,
                    animation: ANIMATION,
                }}
                />
        </div>
    );
}
