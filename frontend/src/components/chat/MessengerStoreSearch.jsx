import { useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowLeftOutlined } from '../common/icons';
import { Bone, DataState } from '../common';
import Button from '../common/Button';
import IconTool from '../common/IconTool';
import SearchControls from '../common/SearchControls';
import SegmentedControl from '../common/SegmentedControl';
import MessengerAvatar from './MessengerAvatar';
import { SupportAvatar } from './SupportIdentity';
import useMessengerSearch from '../../hooks/useMessengerSearch';
import useMessengerStore from '../../store/useMessengerStore';
import useSearchTransition from '../../hooks/useSearchTransition';
import { SEARCH_MOTION_DURATION_MS } from '../layout/searchTransition';

const categories = [{ value: 'all', label: '전체' }, { value: 'conversations', label: '대화 상대' },
    { value: 'messages', label: '메시지' }, { value: 'stores', label: '가게' }];
const positive = value => Number.isSafeInteger(value) && value > 0;
function SearchSkeleton() {
    return <output aria-label="채팅 검색 중" aria-busy="true">
        {[1, 2, 3].map(key => <div className="reserve-messenger-skeleton-row" key={key} aria-hidden="true">
            <Bone width={36} height={36} borderRadius="50%" />
            <div><Bone width="65%" height={14} /><Bone width="90%" height={12} /></div>
        </div>)}
    </output>;
}

export default function MessengerStoreSearch({ search, memberId, headingLevel = 2, inert = false, navigation, onBack, onChoose }) {
    const Heading = 'h' + headingLevel;
    const identity = useMessengerStore(state => state.sessionIdentity);
    const update = useMessengerStore(state => state.updateStoreSearch);
    const [composing, setComposing] = useState(false);
    const selectingRef = useRef(false);
    const scrollRef = useRef(null);
    const restoredKey = useRef(null);
    const inputRef = useRef(null);
    const category = search.category || 'all';
    const selectedKey = search.selectedResultKey || (search.selectedStoreId ? 'STORE:' + search.selectedStoreId : null);
    const { isClosing, leaveSearch, motionClass } = useSearchTransition({
        inputRef, animateEntry: search.visible && !selectedKey && !inert, active: search.visible,
    });
    const result = useMessengerSearch({ keyword: search.keyword, page: search.page, category, composing, enabled: !inert && !isClosing });
    const { stores, query, keyword, ready } = result;
    const showPrivate = category !== 'stores';
    const showStores = category === 'all' || category === 'stores';
    const queries = [showPrivate && query, showStores && stores.query].filter(Boolean);
    const loading = queries.some(value => value.isLoading);
    const fetching = queries.some(value => value.isFetching);
    const hasError = queries.some(value => value.isError);
    const hasData = result.hasData || stores.hasData;
    const more = (showPrivate && result.more) || (showStores && stores.total > (search.page + 1) * 20);
    const groups = [];
    if (showPrivate && category !== 'messages') groups.push({ key: 'conversations', label: '대화 상대', items: result.conversations });
    if (showPrivate && category !== 'conversations') groups.push({ key: 'messages', label: '메시지', items: result.messages });
    if (showStores) groups.push({ key: 'stores', label: '가게', items: stores.stores.map(store => ({ ...store, type: 'STORE', title: store.name,
        description: [store.category, store.address].filter(Boolean).join(' · '), imageUrl: store.mainImageUrl, kind: 'store', storeId: Number(store.id) })) });
    const count = groups.reduce((total, group) => total + group.items.length, 0);

    useLayoutEffect(() => { if (search.visible) selectingRef.current = false; }, [search.visible]);
    useLayoutEffect(() => {
        if (inert || loading || !hasData || !scrollRef.current) return;
        const key = category + ':' + keyword + ':' + search.page;
        if (restoredKey.current === key) return;
        restoredKey.current = key;
        scrollRef.current.scrollTop = search.scrollTop;
        if (selectedKey) scrollRef.current.querySelector('[data-search-key="' + selectedKey + '"]')?.focus({ preventScroll: true });
    }, [inert, loading, hasData, category, keyword, search.page, search.scrollTop, selectedKey, result.conversations, result.messages, stores.stores]);
    const changeKeyword = value => update({ keyword: value, page: 0, scrollTop: 0, selectedStoreId: null, selectedResultKey: null, selectedThreadKey: null }, identity);
    const leave = action => leaveSearch(() => {
        if (useMessengerStore.getState().sessionIdentity === identity) action();
    });
    const cancel = () => leave(onBack);
    const unavailableFor = hit => hit.type === 'STORE' ? memberId != null && hit.ownerId != null && String(memberId) === String(hit.ownerId)
        ? '내 가게에는 문의를 보낼 수 없어요.' : hit.status && hit.status !== 'ACTIVE' ? '현재 문의를 받을 수 없는 가게예요.' : '' : '';
    const choose = hit => {
        if (unavailableFor(hit) || selectingRef.current || !search.visible || !ready || !hasData
            || !['support', 'store', 'owner', 'admin'].includes(hit.kind)
            || (hit.kind === 'store' && !positive(hit.storeId))
            || (hit.type !== 'STORE' && !positive(hit.roomId))
            || (hit.type === 'MESSAGE' && !positive(hit.messageId))
            || useMessengerStore.getState().sessionIdentity !== identity) return;
        selectingRef.current = true;
        leave(() => onChoose({ kind: hit.kind, ...(positive(hit.storeId) ? { storeId: hit.storeId } : {}),
            ...(positive(hit.roomId) ? { roomId: hit.roomId } : {}), ...(positive(hit.messageId) ? { messageId: hit.messageId } : {}) }));
    };
    return <section className={'reserve-messenger-list reserve-messenger-store-search' + motionClass}
        style={{ '--reserve-search-motion-duration': String(SEARCH_MOTION_DURATION_MS) + 'ms' }}
        inert={inert || isClosing ? true : undefined} aria-labelledby="reserve-messenger-store-search-title"
        onKeyDown={event => {
            if (event.key !== 'Escape' || composing || event.nativeEvent.isComposing) return;
            event.preventDefault(); event.stopPropagation(); cancel();
        }}>
        <header className="reserve-messenger-list-heading">
            <IconTool label={search.origin === 'home' ? '메신저 홈으로 돌아가기' : '대화 목록으로 돌아가기'} kind="navigation"
                icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={cancel} />
            <Heading id="reserve-messenger-store-search-title">채팅 검색</Heading>
        </header>
        <div className="reserve-search-header reserve-search-controls" aria-label="채팅 검색">
            <SearchControls value={search.keyword} onChange={changeKeyword} onCancel={cancel} inputRef={inputRef}
                label="대화 상대, 메시지, 가게 검색" placeholder="상대 이름, 대화 내용, 가게 검색" maxLength={100}
                autoFocus={!inert && !selectedKey} composing={composing}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={event => { changeKeyword(event.currentTarget.value); setComposing(false); }} />
        </div>
        <div className="reserve-messenger-search-filters"><SegmentedControl options={categories} value={category} aria-label="채팅 검색 범위"
            onChange={value => update({ category: value, page: 0, scrollTop: 0, selectedStoreId: null, selectedResultKey: null }, identity)} /></div>
        <div ref={scrollRef} className="reserve-messenger-list-scroll reserve-search-motion-content" aria-busy={Boolean(keyword) && (!ready || fetching)}
            onScroll={event => update({ scrollTop: event.currentTarget.scrollTop }, identity)}>
            {!keyword ? <DataState state="empty" kind="message" title="대화와 가게를 찾아보세요." description="상대 이름이나 대화 내용을 입력해주세요." />
                : !ready || loading ? <SearchSkeleton /> : <>
                    {showPrivate && query.isError && <DataState state="error" kind="message" compact subject="채팅 검색" error={query.error}
                        onRetry={query.refetch} retrying={query.isFetching} />}
                    {showStores && stores.query.isError && <DataState state="error" kind="store" compact subject="가게 검색" error={stores.query.error}
                        onRetry={stores.query.refetch} retrying={stores.query.isFetching} />}
                    {!count && !hasError && <DataState state="empty" kind="message" title="검색 결과가 없어요." description="다른 이름이나 대화 내용으로 찾아보세요." />}
                    {groups.filter(group => group.items.length > 0).map(group => <section key={group.key} aria-label={group.label + ' 검색 결과'}>
                        <h3 className="reserve-messenger-section-label">{group.label}</h3>
                        {group.items.map(hit => {
                            const unavailable = unavailableFor(hit);
                            const key = hit.type + ':' + hit.id;
                            return <button key={key} type="button" className="reserve-messenger-row" data-search-key={key}
                                data-store-id={hit.type === 'STORE' ? hit.storeId : undefined}
                                aria-label={hit.title + ', ' + (unavailable || (hit.type === 'STORE' ? '문의 시작' : hit.type === 'MESSAGE' ? '메시지 보기' : '대화 열기'))}
                                aria-disabled={Boolean(unavailable) || !search.visible || undefined} onClick={() => choose(hit)}>
                                {hit.kind === 'support' ? <SupportAvatar className="reserve-messenger-row-icon" />
                                    : <MessengerAvatar imageSrc={hit.imageUrl} variant={hit.kind === 'store' ? 'store' : 'person'} className="reserve-messenger-row-icon" />}
                                <span className="reserve-messenger-row-copy">
                                    <span className="reserve-messenger-row-line"><strong>{hit.title}</strong></span>
                                    <span className="reserve-messenger-row-preview">{hit.description}</span>
                                    {unavailable && <span className="reserve-messenger-store-unavailable">{unavailable}</span>}
                                </span>
                            </button>;
                        })}
                    </section>)}
                    {(search.page > 0 || more) && <nav className="reserve-messenger-store-pagination" aria-label="검색 결과 페이지">
                        <Button variant="ghost-sm" disabled={search.page === 0 || fetching} onClick={() => update({ page: search.page - 1, scrollTop: 0 }, identity)}>이전</Button>
                        <span>{search.page + 1}페이지</span>
                        <Button variant="ghost-sm" disabled={!more || fetching} onClick={() => update({ page: search.page + 1, scrollTop: 0 }, identity)}>다음</Button>
                    </nav>}
                </>}
        </div>
        {navigation}
    </section>;
}
MessengerStoreSearch.propTypes = { search: PropTypes.shape({ visible: PropTypes.bool.isRequired, keyword: PropTypes.string.isRequired, page: PropTypes.number.isRequired,
    scrollTop: PropTypes.number.isRequired, origin: PropTypes.oneOf(['home', 'conversations']).isRequired, selectedStoreId: PropTypes.number,
    selectedResultKey: PropTypes.string, category: PropTypes.string }), memberId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    headingLevel: PropTypes.oneOf([1, 2]), inert: PropTypes.bool, navigation: PropTypes.node, onBack: PropTypes.func.isRequired, onChoose: PropTypes.func.isRequired };
