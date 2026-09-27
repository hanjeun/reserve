import PropTypes from 'prop-types';
import Bone from '../common/Bone';

export default function StoreListRowSkeleton({ count = 12 }) {
    return Array.from({ length: count }, (_, index) => (
        <div className="reserve-store-list-row reserve-store-list-row-skeleton" key={`store-row-skeleton-${index}`} aria-hidden="true">
            <div className="reserve-store-list-row-link">
                <div className="reserve-store-list-row-image"><Bone height="100%" borderRadius={0} /></div>
                <div className="reserve-store-list-row-body">
                    <Bone width="55%" height={20} />
                    <Bone width="86%" height={18} />
                    <div className="reserve-store-list-row-meta">
                        <Bone width={72} height={16} />
                        <Bone width="28%" height={16} />
                    </div>
                </div>
            </div>
            <div className="reserve-store-list-row-favorite"><Bone width={20} height={20} /></div>
        </div>
    ));
}

StoreListRowSkeleton.propTypes = { count: PropTypes.number };
