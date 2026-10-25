import PropTypes from 'prop-types';
import Bone from '../../components/common/Bone';
import DataState from '../../components/common/DataState';
import LoadingStatus from '../../components/common/LoadingStatus';
import TextLink from '../../components/common/TextLink';
import { searchCorrections } from '../../utils/searchUnderstanding';
import { CalendarOutlined, ClockCircleOutlined, MessageOutlined, NotificationOutlined, SearchOutlined, ShopOutlined } from '../../components/common/icons';
import { SEARCH_GROUP_LIMIT, SEARCH_KEYWORD_MAX_LENGTH } from '../../constants/searchCatalog';
import { spacing } from '../../styles/tokens';

const REMOTE_GROUPS = [
    { key: 'stores', title: '가게', icon: ShopOutlined, scope: 'public' },
    { key: 'benefits', title: '혜택', icon: NotificationOutlined, scope: 'public' },
    { key: 'feed', title: '피드', icon: NotificationOutlined, scope: 'public' },
    { key: 'reservations', title: '내 예약', icon: CalendarOutlined, scope: 'personal' },
    { key: 'waiting', title: '내 웨이팅', icon: ClockCircleOutlined, scope: 'personal' },
    { key: 'messages', title: '메시지', icon: MessageOutlined, scope: 'personal' },
];

function ResultSkeleton() {
    return <LoadingStatus aria-label="검색 결과를 불러오는 중" aria-busy="true">
        <ul className="reserve-search-recent-list" aria-hidden="true">
            {[1, 2, 3].map(id => <li className="reserve-search-recent-item" key={id}>
                <div className="reserve-search-recent-term" style={styles.skeletonRow}>
                    <Bone width={14} height={14} pageLoading={false} />
                    <div className="reserve-messenger-row-copy" style={styles.copy}>
                        <Bone width="65%" height={21} pageLoading={false} />
                        <Bone width="90%" height={18} style={{ marginTop: 3 }} pageLoading={false} />
                    </div>
                </div>
            </li>)}
        </ul>
    </LoadingStatus>;
}

function ResultGroup({ group, items, hasMore = false, onChoose }) {
    if (!items.length) return null;
    return <section aria-labelledby={`search-group-${group.key}`} style={styles.group}>
        <h2 id={`search-group-${group.key}`} style={styles.heading}>{group.title}</h2>
        <ul className="reserve-search-recent-list" aria-label={`${group.title} 검색 결과`}>
            {items.slice(0, SEARCH_GROUP_LIMIT).map(item => {
                const Icon = item.icon ?? group.icon ?? SearchOutlined;
                return <li key={item.id} className="reserve-search-recent-item">
                    <TextLink to={item.path} className="reserve-search-recent-term" aria-label={item.aliasMatched ? item.title : undefined}
                        aria-describedby={item.aliasMatched && item.description ? 'search-description-' + item.id : undefined} onClick={event => onChoose(event, item.path)}>
                        <Icon aria-hidden="true" />
                        <span className="reserve-messenger-row-copy" style={styles.copy}>
                            <span className="reserve-messenger-row-line"><strong>{item.title}</strong></span>
                            {item.description && <span id={item.aliasMatched ? 'search-description-' + item.id : undefined} className="reserve-messenger-row-preview">{item.description}</span>}
                        </span>
                    </TextLink>
                </li>;
            })}
        </ul>
        {hasMore && <p className="reserve-search-recent-empty">검색 결과를 최대 {SEARCH_GROUP_LIMIT}개까지 보여드려요.</p>}
    </section>;
}
ResultGroup.propTypes = {
    group: PropTypes.shape({ key: PropTypes.string.isRequired, title: PropTypes.string.isRequired, icon: PropTypes.elementType }).isRequired,
    items: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        title: PropTypes.string.isRequired, description: PropTypes.string, path: PropTypes.string.isRequired, icon: PropTypes.elementType, aliasMatched: PropTypes.bool })).isRequired,
    hasMore: PropTypes.bool, onChoose: PropTypes.func.isRequired,
};

export default function SearchResults({ result, onChoose, onSubmit }) {
    if (!result.keyword) return null;
    if (!result.valid) return <DataState state="error" compact title={`검색어는 ${SEARCH_KEYWORD_MAX_LENGTH}자 이내로 입력해주세요.`} />;
    const catalog = result.catalog ?? [];
    const corrections = result.ready ? searchCorrections(result.keyword) : [];
    const data = { public: result.publicData, personal: result.personalData };
    const queries = { public: result.publicQuery, personal: result.personalQuery };
    const remote = result.remoteConfirmed ? REMOTE_GROUPS.filter(group => (!result.plan || result.plan.scope === 'all' || result.plan.scope === group.key)
        && (group.scope === 'public' || result.personalAllowed))
        .map(group => ({ ...group, ...(data[group.scope]?.groups?.find(item => item.key === group.key) ?? {}) })) : [];
    const failedScopes = ['public', ...(result.personalAllowed ? ['personal'] : [])].filter(scope => result.remoteConfirmed
        && (queries[scope].isError || remote.some(group => group.scope === scope && group.error)));
    const failures = remote.filter(group => group.error).map(group => group.title);
    const error = failedScopes.map(scope => queries[scope].error).find(Boolean) ?? { status: 503 };
    const visible = remote.filter(group => group.items?.length > 0);
    const hasItems = catalog.length > 0 || visible.length > 0;
    const loading = result.remoteConfirmed && (result.restoring || result.publicQuery.isLoading || result.personalAllowed && result.personalQuery.isLoading);
    const busy = result.remoteConfirmed && (result.publicQuery.isFetching || result.personalAllowed && result.personalQuery.isFetching);
    const retry = () => Promise.all(failedScopes.map(scope => queries[scope].refetch()));
    return <div aria-label="통합 검색 결과" aria-busy={Boolean(busy)}>
        {corrections.length > 0 && <section aria-labelledby="search-corrections-title" style={styles.group}>
            <h2 id="search-corrections-title" style={styles.heading}>이 검색어를 찾으세요?</h2>
            <ul className="reserve-search-recent-list">{corrections.map((item, index) => <li key={item.keyword} className="reserve-search-recent-item">
                <button type="button" className="reserve-search-recent-term" aria-label={item.keyword + ' 검색하기'}
                    aria-describedby={'search-correction-' + index} onClick={() => onSubmit(item.keyword, '', 'correction')}>
                    <SearchOutlined aria-hidden="true" /><span className="reserve-messenger-row-copy">
                        <strong>{item.keyword}</strong><span id={'search-correction-' + index} className="reserve-messenger-row-preview">입력한 검색어: {result.keyword}</span>
                    </span>
                </button>
            </li>)}</ul>
        </section>}
        {result.awaitingChoice && <section aria-labelledby="search-choice-title" style={styles.group}>
            <h2 id="search-choice-title" style={styles.heading}>검색할 대상을 선택해주세요.</h2>
            <div className="reserve-search-keywords">{result.plan.choices.map(item =>
                <button type="button" key={item.id} onClick={() => onSubmit(result.keyword, item.id)}>{item.label}</button>)}</div>
        </section>}
        {!result.awaitingChoice && result.plan?.label && <p className="reserve-search-recent-empty">{result.plan.label}</p>}
        {result.plan?.note && <p className="reserve-search-recent-empty">{result.plan.note}</p>}
        {result.authRequired && <p className="reserve-search-recent-empty">본인 내역은 <TextLink to="/login"
            onClick={event => onChoose(event, '/login')}>로그인</TextLink> 후 검색할 수 있어요.</p>}

        {['menu', 'help'].map(key => <ResultGroup key={key}
            group={{ key, title: key === 'menu' ? '메뉴·기능' : '도움말' }}
            items={catalog.filter(item => item.group === key)} onChoose={onChoose} />)}
        {visible.map(group => <ResultGroup key={group.key} group={group} items={group.items} hasMore={group.hasMore} onChoose={onChoose} />)}
        {loading && <ResultSkeleton />}
        {failedScopes.length > 0 && <DataState state="error" compact={hasItems} subject="검색 결과" error={error}
            description={failures.length ? `${failures.join('·')} 결과를 확인하지 못했어요.` : undefined}
            onRetry={retry} retrying={Boolean(busy)} />}
        {!loading && !failedScopes.length && result.confirmed && !hasItems && !result.awaitingChoice && !result.authRequired && <DataState state="empty" kind="generic"
            title="검색 결과가 없어요." description="다른 검색어로 다시 찾아보세요." />}
        {!result.confirmed && result.ready && !hasItems && !result.awaitingChoice && <button type="button" className="reserve-search-recent-term"
            aria-label={`${result.keyword} 검색하기`} onClick={() => onSubmit(result.keyword)}>
            <SearchOutlined aria-hidden="true" /><span>{result.keyword} 검색</span>
        </button>}
    </div>;
}
SearchResults.propTypes = { result: PropTypes.object.isRequired, onChoose: PropTypes.func.isRequired, onSubmit: PropTypes.func.isRequired };
const styles = {
    group: { marginBottom: spacing[4] },
    heading: { marginBottom: spacing[2] },
    copy: { flex: 1, minWidth: 0 },
    skeletonRow: { cursor: 'default' },
};
