import Bone from '../common/Bone';
import PropTypes from 'prop-types';
import IconToolSkeleton from '../common/IconToolSkeleton';
import { FilterMenuSkeleton } from '../common/FilterToolbarSkeleton';
import { STORE_NEWS_STATES, STORE_NEWS_TYPES } from '../../utils/storeNews';

export function StoreNewsActionSkeleton({ manage = false }) {
    return <span className="reserve-store-news-actions" aria-hidden="true">
        <span className="reserve-icon-tool reserve-icon-tool--skeleton"><Bone width={20} height={20} /></span>
        {manage && <span className="reserve-icon-tool reserve-icon-tool--skeleton"><Bone width={20} height={20} /></span>}
    </span>;
}
StoreNewsActionSkeleton.propTypes = { manage: PropTypes.bool };

export function StoreNewsPublicToolbarSkeleton({ business = false, type = 'ALL', period = 'ONGOING', showRefresh = true }) {
    return <div className="reserve-explore-filters reserve-store-news-toolbar" aria-hidden="true">
        {business && <StoreNewsActionSkeleton manage />}
        <span className="reserve-explore-count"><Bone width={52} height={16} /></span>
        <div className="reserve-explore-filter-controls">
            <FilterMenuSkeleton select={{ value: type, options: [{ value: 'ALL', label: '모든 소식' }, ...STORE_NEWS_TYPES] }} />
            <FilterMenuSkeleton select={{ value: period, options: [{ value: 'ONGOING', label: '진행 소식' }, { value: 'ALL', label: '전체 기간' }] }} />
            {showRefresh && <IconToolSkeleton />}
        </div>
    </div>;
}
StoreNewsPublicToolbarSkeleton.propTypes = { business: PropTypes.bool, type: PropTypes.string, period: PropTypes.string, showRefresh: PropTypes.bool };

export default function StoreNewsSkeleton({ contentOnly = false, showRefresh = true }) {
    return <section className="reserve-store-news-management" aria-label="내 가게 소식을 불러오는 중" aria-busy="true">
        {!contentOnly && <>
            <div className="reserve-explore-filters reserve-store-news-manage-toolbar" aria-hidden="true"><StoreNewsActionSkeleton /><span className="reserve-explore-count"><Bone width={52} height={16} /></span>
                <div className="reserve-explore-filter-controls"><FilterMenuSkeleton select={{ value: 'ALL', options: [{ value: 'ALL', label: '전체 가게' }] }} />
                    <FilterMenuSkeleton select={{ value: 'ALL', options: STORE_NEWS_STATES }} />{showRefresh && <IconToolSkeleton />}</div></div></>}
        {[0, 1, 2].map(item => <div className="reserve-store-news-manage-row" key={item}><Bone width="70%" height={22} />
            <Bone width="90%" height={16} style={{ marginTop: 14 }} /><Bone width={160} height={38} style={{ marginTop: 16 }} /></div>)}
    </section>;
}
StoreNewsSkeleton.propTypes = { contentOnly: PropTypes.bool, showRefresh: PropTypes.bool };
