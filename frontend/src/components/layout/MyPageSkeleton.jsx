import Bone from '../common/Bone';
import PageContainer from '../common/PageContainer';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { breakpoints, colors, radius, shadows } from '../../styles/tokens';

const cardStyle = {
    padding: '20px 24px', background: colors.background.paper,
    border: `1px solid ${colors.border.light}`, borderRadius: radius['2xl'], boxShadow: shadows.card,
};
const gapStyle = { display: 'flex', flexDirection: 'column', gap: 16 };

// 사용자 정보를 읽지 않고 실제 마이페이지의 프로필/편집/앱 설정 배치만 표시한다.
export default function MyPageSkeleton() {
    const isPC = useWindowWidth() >= breakpoints.tablet;
    return <PageContainer size={isPC ? 'lg' : 'sm'} paddingTop="48px">
        <div className="reserve-my-page-skeleton-grid" style={{ display: 'flex', flexDirection: isPC ? 'row' : 'column', gap: 32, alignItems: 'flex-start' }}>
            <div style={{ flex: isPC ? '1 1 420px' : undefined, width: '100%', minWidth: 0 }}>
                <div className="reserve-my-page-skeleton-card" style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
                    <Bone width={56} height={56} borderRadius="50%" />
                    <div style={{ ...gapStyle, gap: 8, flex: 1, minWidth: 0 }}><Bone width="55%" height={22} /><Bone width="85%" /></div>
                </div>
                <div className="reserve-my-page-skeleton-card" style={{ ...cardStyle, ...gapStyle, padding: 20 }}>
                    <Bone width={104} height={24} />
                    <div style={{ display: 'flex', gap: 8 }}>
                        {['name', 'password', 'photo', 'location'].map(key => <Bone key={key} width="20%" height={38} borderRadius={16} />)}
                    </div>
                    <Bone width={62} />
                    <Bone height={54} borderRadius={12} />
                    <Bone width={80} height={44} borderRadius={12} />
                </div>
            </div>
            <div style={{ ...gapStyle, gap: 32, flex: isPC ? '1 1 300px' : undefined, width: '100%', minWidth: isPC ? 280 : 0, maxWidth: isPC ? 420 : undefined }}>
                <div className="reserve-my-page-skeleton-card" style={{ ...cardStyle, ...gapStyle }}>
                    <Bone width={56} height={24} />
                    <Bone height={44} borderRadius={16} />
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Bone width="calc(50% - 6px)" height={54} borderRadius={12} />
                        <Bone width="calc(50% - 6px)" height={54} borderRadius={12} />
                    </div>
                </div>
                <div className="reserve-my-page-skeleton-card" style={{ ...cardStyle, ...gapStyle }}>
                    <Bone width={88} height={24} />
                    <Bone height={38} /><Bone height={38} />
                </div>
                <div className="reserve-my-page-skeleton-card" style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Bone width="50%" height={32} /><Bone width={72} height={36} borderRadius={12} />
                </div>
            </div>
        </div>
    </PageContainer>;
}
