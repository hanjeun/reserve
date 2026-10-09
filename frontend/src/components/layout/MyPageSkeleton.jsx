import Bone from '../common/Bone';
import PageContainer from '../common/PageContainer';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import useAuthStore from '../../store/useAuthStore';
import { hasAdminAccess, hasOwnerAccess } from '../../constants/roles';
import { breakpoints, colors, radius, shadows } from '../../styles/tokens';

const cardStyle = {
    padding: '20px 24px', background: colors.background.paper,
    border: `1px solid ${colors.border.light}`, borderRadius: radius['2xl'], boxShadow: shadows.card,
};
const gapStyle = { display: 'flex', flexDirection: 'column', gap: 16 };

// 이미 복원한 계정의 역할·로그인 방식으로 실제 마이페이지에 있는 탭과 설정 자리만 표시한다.
export default function MyPageSkeleton() {
    const isPC = useWindowWidth() >= breakpoints.tablet;
    const user = useAuthStore(state => state.user);
    const socialUser = user?.provider && user.provider !== 'LOCAL';
    const tabWidths = [
        ['name', 46], ...(!socialUser ? [['password', 72]] : []), ['photo', 46], ['location', 46],
        ...(!hasAdminAccess(user?.role) ? [['business', 59]] : []),
    ];
    return <PageContainer size={isPC ? 'lg' : 'sm'} paddingTop="48px">
        <div className="reserve-my-page-skeleton-grid" style={{ display: 'flex', flexDirection: isPC ? 'row' : 'column', gap: 32, alignItems: 'flex-start' }}>
            <div style={{ flex: isPC ? '1 1 420px' : undefined, width: '100%', minWidth: 0 }}>
                <div className="reserve-my-page-skeleton-card" style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
                    <Bone width={56} height={56} borderRadius="50%" />
                    <div style={{ ...gapStyle, gap: 8, flex: 1, minWidth: 0 }}><Bone width="55%" height={22} /><Bone width="85%" /></div>
                </div>
                <div className="reserve-my-page-skeleton-card" style={{ ...cardStyle, padding: 20 }}>
                    <Bone width={104} height={24} style={{ marginBottom: 16 }} />
                    <div className="reserve-route-panel-tabs" aria-hidden="true">
                        <div className="reserve-route-panel-tabs-list">
                            {tabWidths.map(([key, width]) => <span key={key} className={`reserve-route-panel-tab${key === 'name' ? ' is-active' : ''}`}>
                                <Bone width={width} height={13} />
                            </span>)}
                        </div>
                    </div>
                    <Bone height={54} borderRadius={12} style={{ marginBottom: 16 }} />
                    <Bone height={56} borderRadius={16} />
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
                {hasOwnerAccess(user?.role) && <div className="reserve-my-page-skeleton-card" style={cardStyle}>
                    <Bone width={96} height={24} style={{ marginBottom: 16 }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '8px 0' }}>
                        <div style={{ ...gapStyle, gap: 6, flex: 1, minWidth: 0 }}><Bone width={90} height={13} /><Bone width="90%" height={12} /></div>
                        <Bone width={28} height={16} borderRadius={100} />
                    </div>
                    <Bone height={36} />
                </div>}
                <div className="reserve-my-page-skeleton-card" style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Bone width="50%" height={32} /><Bone width={72} height={36} borderRadius={12} />
                </div>
            </div>
        </div>
    </PageContainer>;
}
