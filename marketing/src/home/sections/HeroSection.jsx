import { Typography } from '../../primitives.jsx';
import { ArrowRightOutlined } from '../../../../frontend/src/components/common/icons.js';
import Button from '../../../../frontend/src/components/common/Button.jsx';
import { LINES } from '../../typing';
import TypingLine from '../../TypingLine';
import { styles } from '../Home.styles';
import BounceArrow from './BounceArrow';

const { Title, Text } = Typography;

const ANIMATION = `bounceAppear 0.75s cubic-bezier(0.22,1,0.36,1) 0.6s forwards, bounceY 1.6s ease-in-out 1.5s infinite`;

export default function HeroSection({ isMobile }) {
    return (
        <section className="marketing-scene" style={{
            ...styles.contentArea,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: isMobile ? '0 20px' : '0 24px',
        }}>

            <div style={{ flex: 1 }} />

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
                    <Title style={styles.mainTitle} aria-label="예약이 필요한 순간, RESERVE">
                        <div style={styles.lineWrapper}>예약이 필요한 순간,</div>
                        <div data-marketing-typing style={styles.lineWrapper}>
                            <TypingLine line={LINES[0]} />
                        </div>
                    </Title>
                </div>
                <div className="slide-up" style={{ animationDelay: '0.28s', textAlign: 'center' }}>
                    <Text style={styles.subTitle}>
                        기다림 없는 완벽한 하루를 위해,<br />
                        원하는 예약을 가장 빠르게 도와드립니다.
                    </Text>
                </div>
                <div className="slide-up marketing-hero-actions" style={{ animationDelay: '0.36s', marginTop: 32 }}>
                    <Button variant="primary" size={isMobile ? 'lg' : 'hero'} data-app-path="/stores" style={{ flex: '1 1 0', minWidth: 0, padding: '0 20px' }}>
                        지금 둘러보기
                        <ArrowRightOutlined style={{ marginLeft: 8, fontSize: 17 }} />
                    </Button>
                    <Button variant="secondary" size={isMobile ? 'lg' : 'hero'} data-app-path="/signup" style={{ flex: '1 1 0', minWidth: 0, padding: '0 20px' }}>
                        시작하기
                    </Button>
                </div>
            </div>

            <div style={{ flex: 1 }} />

            <BounceArrow
                targetId="section-0"
                style={{
                    position: 'absolute',
                    bottom: isMobile ? 10 : 0,
                    left: 0,
                    right: 0,
                    opacity: 0,
                    animation: ANIMATION,
                }}
                />
        </section>
    );
}
