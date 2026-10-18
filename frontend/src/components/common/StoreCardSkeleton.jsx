import PropTypes from 'prop-types';
import { colors } from '../../styles/tokens/colors';
import { shadows } from '../../styles/tokens/spacing';
import Bone from './Bone';

// The route fallback imports this directly so admin-only skeleton dependencies stay lazy.
export default function StoreCardSkeleton({ count = 6, withActions = false, metadata, extraTools, showFavorite = true }) {
    return <>
        {Array.from({ length: count }, (_, index) => `store-${index}`).map(key => (
            <div key={key} style={{ breakInside: 'avoid', marginBottom: 24 }}>
                <div style={{
                    borderRadius: 0,
                    overflow: 'hidden',
                    border: `1px solid ${colors.border.light}`,
                    boxShadow: shadows.card,
                    backgroundColor: colors.background.default,
                }}>
                    <Bone height="auto" borderRadius={0} style={{ aspectRatio: '1 / 1', maxHeight: 200 }} />
                    <div className="reserve-store-card-skeleton-info" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div className="reserve-store-card-title-line reserve-store-card-skeleton-title-line" style={{ minHeight: 24 }}>
                            <Bone width="70%" height={20} />
                            <div className="reserve-store-card-favorite reserve-store-card-skeleton-tools">
                                {showFavorite && <span className="reserve-icon-tool reserve-favorite-button reserve-icon-tool--skeleton"><Bone width={20} height={20} /></span>}
                                {extraTools}
                            </div>
                        </div>
                        <div className="reserve-store-card-skeleton-identity"><Bone width="35%" height={14} /></div>
                        <div className="reserve-store-card-skeleton-rating" style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 24 }}>
                            <Bone width={14} height={14} borderRadius={2} />
                            <Bone width={28} height={14} />
                            <Bone width={36} height={14} />
                        </div>
                        {metadata}
                    </div>
                    {withActions && <div style={{ borderTop: `1px solid ${colors.border.light}`, display: 'flex' }}>
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', padding: '12px 0',
                            borderRight: `1px solid ${colors.border.light}`,
                        }}><Bone width={18} height={18} borderRadius={3} /></div>
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', padding: '12px 0',
                        }}><Bone width={18} height={18} borderRadius={3} /></div>
                    </div>}
                </div>
            </div>
        ))}
    </>;
}

StoreCardSkeleton.propTypes = {
    count: PropTypes.number,
    withActions: PropTypes.bool,
    metadata: PropTypes.node,
    extraTools: PropTypes.node,
    showFavorite: PropTypes.bool,
};
