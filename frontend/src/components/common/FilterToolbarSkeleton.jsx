import PropTypes from 'prop-types';
import Bone from './Bone';

export function FilterMenuSkeleton({ select, style }) {
    const selected = select.options?.find(option => option.value === select.value)?.label;
    const label = typeof selected === 'string' || typeof selected === 'number'
        ? selected : select.placeholder ?? select.ariaLabel ?? '선택';
    return <span className={['reserve-filter-menu', 'reserve-filter-menu--plain', select.className].filter(Boolean).join(' ')}
        style={{ ...style, cursor: 'default', pointerEvents: 'none' }}>
        <span className="reserve-filter-menu-surface">
            <span className="reserve-filter-menu-label reserve-skeleton-block reserve-route-skeleton-text">{label}</span>
            <Bone width={10} height={10} borderRadius={3} />
        </span>
    </span>;
}
FilterMenuSkeleton.propTypes = { select: PropTypes.object.isRequired, style: PropTypes.object };

const refresh = <div className="reserve-filter-toolbar-refresh"><Bone width={70} height={16} /></div>;
const searchField = <Bone height={40} style={{ flex: '1 1 0', minWidth: 0, maxWidth: 480 }} borderRadius={12} />;
const extraField = <Bone width="min(128px, 24vw)" height={32} style={{ flexShrink: 1 }} />;

/** 데이터 없는 첫 로딩만 대체한다. 실제 도구줄과 같은 행·정렬·터치 높이를 사용한다. */
export default function FilterToolbarSkeleton({ selects = [], count = null, search, extra, extraSkeleton, spread = false, style }) {
    if (selects.length > 0) return <div className="reserve-filter-toolbar" style={style} aria-hidden="true">
        <div className="reserve-explore-filters reserve-filter-toolbar-primary">
            <div className="reserve-explore-filter-controls reserve-filter-toolbar-controls">
                {selects.map((select, index) => <FilterMenuSkeleton
                    key={select.key ?? select.placeholder ?? select.ariaLabel ?? index} select={select}
                    style={{
                        width: count != null ? 'fit-content' : `min(${select.width ?? 168}px, ${select.mobileWidth ?? 128}px + 10vw)`,
                        maxWidth: `min(${select.width ?? 168}px, ${select.mobileWidth ?? 128}px + 10vw)`,
                        flex: count != null ? '0 1 auto' : undefined,
                        flexShrink: count != null ? undefined : 1,
                    }} />)}
                {count != null && <span className="reserve-filter-toolbar-count"><Bone width={40} height={16} /></span>}
                {extra && <div className="reserve-filter-toolbar-extra">{extraSkeleton ?? extraField}</div>}
            </div>
            {!search && refresh}
        </div>
        {search && <div className="reserve-filter-toolbar-secondary">{searchField}{refresh}</div>}
    </div>;
    return <div className="reserve-filter-toolbar" style={style} aria-hidden="true">
        <div className={`reserve-filter-toolbar-secondary${spread ? ' reserve-filter-toolbar-secondary--spread' : ''}${!search && !extra ? ' reserve-filter-toolbar-secondary--refresh-only' : ''}`}>
            {extra && (extraSkeleton ?? extraField)}
            {search && searchField}
            {count != null && <Bone width={40} height={16} />}
            {refresh}
        </div>
    </div>;
}
FilterToolbarSkeleton.propTypes = {
    selects: PropTypes.array, count: PropTypes.number, search: PropTypes.object,
    extra: PropTypes.node, extraSkeleton: PropTypes.node, spread: PropTypes.bool, style: PropTypes.object,
};
