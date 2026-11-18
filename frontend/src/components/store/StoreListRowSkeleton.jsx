import PropTypes from 'prop-types';
import Bone from '../common/Bone';

export default function StoreListRowSkeleton({ count = 12, className, metadata, extraTools, showFavorite = true, compact = false, pageLoading = true }) {
    return Array.from({ length: count }, (_, index) => (
        <div className={['reserve-store-list-row reserve-store-list-row-skeleton', className].filter(Boolean).join(' ')} key={`store-row-skeleton-${index}`} aria-hidden="true">
            <div className="reserve-store-list-row-link">
                <div className="reserve-store-list-row-image"><Bone height="100%" borderRadius={0} pageLoading={pageLoading} /></div>
                <div className="reserve-store-list-row-body">
                    <Bone width="55%" height={20} pageLoading={pageLoading} />
                    <Bone width="86%" height={compact ? 14 : 18} pageLoading={pageLoading} />
                    {!compact && <div className="reserve-store-list-row-meta">
                        <Bone width={72} height={16} pageLoading={pageLoading} />
                        <Bone width="28%" height={16} pageLoading={pageLoading} />
                    </div>}
                    {metadata}
                </div>
            </div>
            <div className={`reserve-store-list-row-favorite${extraTools ? ' reserve-store-list-row-favorite--with-tools' : ''}`}>
                {showFavorite && (extraTools
                    ? <span className="reserve-icon-tool reserve-icon-tool--skeleton"><Bone width={20} height={20} pageLoading={pageLoading} /></span>
                    : <Bone width={20} height={20} pageLoading={pageLoading} />)}
                {extraTools}
            </div>
        </div>
    ));
}

StoreListRowSkeleton.propTypes = {
    count: PropTypes.number, className: PropTypes.string, metadata: PropTypes.node, extraTools: PropTypes.node,
    showFavorite: PropTypes.bool, compact: PropTypes.bool, pageLoading: PropTypes.bool,
};
