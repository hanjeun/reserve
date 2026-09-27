import { ClockCircleOutlined, ReadOutlined, RightOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import useDocumentTitle from '../../hooks/useDocumentTitle';

// 디자인 단계의 진입 화면이다. 할인·대기 접수·게시글을 가짜 데이터로 채우지 않는다.
const SCREENS = {
    '/waiting': { title: '웨이팅', heading: '웨이팅은 아직 준비 중이에요', description: '현재는 가게를 둘러보고 예약할 수 있어요.', Icon: ClockCircleOutlined },
    '/feed': { title: '피드', heading: '새로운 이야기를 준비하고 있어요', description: '가게와 서비스의 이야기를 한곳에서 만날 수 있도록 준비하고 있어요.', Icon: ReadOutlined },
};

export default function ComingSoon() {
    const { pathname } = useLocation();
    const screen = SCREENS[pathname.replace(/\/$/, '')];
    useDocumentTitle(screen?.title ?? null);
    if (!screen) return null;
    const { Icon } = screen;

    return (
        <section className="reserve-discovery-coming-soon" aria-labelledby="discovery-coming-soon-title">
            <Icon className="reserve-discovery-coming-soon-icon" aria-hidden="true" />
            <span className="reserve-discovery-coming-soon-status">준비 중</span>
            <h1 id="discovery-coming-soon-title">{screen.heading}</h1>
            <p>{screen.description}</p>
            <Link to="/stores" className="reserve-discovery-coming-soon-link">
                가게 둘러보기 <RightOutlined aria-hidden="true" />
            </Link>
        </section>
    );
}
