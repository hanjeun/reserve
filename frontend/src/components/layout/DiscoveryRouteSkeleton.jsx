import Bone from '../common/Bone';
import StoreListRowSkeleton from '../store/StoreListRowSkeleton';
import { SERVICE_DOMAIN_OPTIONS } from '../../constants';

const HOME_SHORTCUT_GROUPS = [
    { key: 'services', count: SERVICE_DOMAIN_OPTIONS.length },
    { key: 'quick', count: 4 },
];

// 홈의 골격은 다른 페이지·메신저·관리자 UI를 내려받지 않고 준비한다.
export default function DiscoveryRouteSkeleton() {
    return (
        <div className="reserve-discovery-home">
            <div className="reserve-discovery-location">
                <Bone width={112} height={20} />
                <Bone width={72} height={20} />
            </div>
            <div className="reserve-discovery-featured">
                <div className="reserve-discovery-banner-track">
                    <Bone height="auto" borderRadius="var(--reserve-home-banner-radius)" style={{ aspectRatio: 'var(--reserve-home-banner-ratio)' }} />
                </div>
            </div>
            <div className="reserve-discovery-shortcuts">
                <div className="reserve-discovery-shortcut-grid">
                    {HOME_SHORTCUT_GROUPS.map(group => (
                        <div key={group.key} className={'reserve-discovery-shortcut-group reserve-discovery-shortcut-group--' + group.key}>
                            <div className="reserve-discovery-shortcut-group-title" style={{ paddingBlock: 3 }}><Bone width={96} height={14} /></div>
                            <div className="reserve-discovery-shortcut-items">
                                {Array.from({ length: group.count }, (_, index) => (
                                    <div className="reserve-discovery-shortcut" key={`${group.key}-${index}`}>
                                        <span className="reserve-discovery-shortcut-media"><Bone width={48} height={48} borderRadius="50%" /></span>
                                        <span className="reserve-route-discovery-shortcut-label"><Bone width={42} height={12} /></span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="reserve-discovery-recommended">
                <div className="reserve-discovery-section-heading">
                    <div className="reserve-discovery-section-copy"><Bone width={150} height={22} style={{ marginBlock: 3 }} /></div>
                    <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}><Bone width={58} height={16} /></div>
                </div>
                <div className="reserve-discovery-store-list reserve-store-list-rows">
                    <StoreListRowSkeleton count={4} />
                </div>
            </div>
        </div>
    );
}
