import { ClockCircleOutlined, ReadOutlined, RightOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { discoveryComingSoonScreen } from '../../constants/discoveryComingSoon';

// 디자인 단계의 진입 화면이다. 할인·대기 접수·게시글을 가짜 데이터로 채우지 않는다.
// 문구는 청크 로딩 뼈대와 공유한다(constants/discoveryComingSoon). 아이콘만 여기서 붙인다.
const ICONS = { '/waiting': ClockCircleOutlined, '/feed': ReadOutlined };

export default function ComingSoon() {
    const { pathname } = useLocation();
    const screen = discoveryComingSoonScreen(pathname);
    useDocumentTitle(screen?.title ?? null);
    if (!screen) return null;
    const Icon = ICONS[pathname.replace(/\/$/, '')];

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
