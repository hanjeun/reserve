import { useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowLeftOutlined } from '../common/icons';
import { Bone, DataState } from '../common';
import IconTool from '../common/IconTool';
import Pagination from '../common/Pagination';
import SearchControls from '../common/SearchControls';
import MessengerAvatar from './MessengerAvatar';
import useMessengerStoreSearch, { MESSENGER_STORE_PAGE_SIZE } from '../../hooks/useMessengerStoreSearch';
import useMessengerStore from '../../store/useMessengerStore';
import useSearchTransition from '../../hooks/useSearchTransition';
import { SEARCH_MOTION_DURATION_MS } from '../layout/searchTransition';

function SearchSkeleton() {
    return <output aria-label="가게를 찾는 중" aria-busy="true">
        {[1, 2, 3].map(key => <div className="reserve-messenger-skeleton-row" key={key} aria-hidden="true">
            <Bone width={36} height={36} borderRadius="50%" />
            <div><Bone width="65%" height={14} /><Bone width="90%" height={12} /></div>
        </div>)}
    </output>;
}

export default function MessengerStoreSearch({ search, memberId, headingLevel = 2, inert = false, navigation, onBack, onChoose }) {
    const Heading = `h${headingLevel}`;
    const identity = useMessengerStore(state => state.sessionIdentity);
    const update = useMessengerStore(state => state.updateStoreSearch);
    const [composing, setComposing] = useState(false);
    const selecting = !search.visible;
    const selectingRef = useRef(false);
    const scrollRef = useRef(null);
    const restoredKey = useRef(null);
    const inputRef = useRef(null);
    const { isClosing, leaveSearch, motionClass } = useSearchTransition({
        inputRef, animateEntry: search.visible && !search.selectedStoreId && !inert, active: search.visible,
    });
    const result = useMessengerStoreSearch({ keyword: search.keyword, page: search.page, composing, enabled: !inert && !isClosing });
    const { query, keyword, ready, hasData, stores, total } = result;
    useLayoutEffect(() => { if (search.visible) selectingRef.current = false; }, [search.visible]);
    useLayoutEffect(() => {
        if (inert || !hasData || !scrollRef.current) return;
        const key = `${keyword}:${search.page}`;
        if (restoredKey.current === key) return;
        restoredKey.current = key;
        scrollRef.current.scrollTop = search.scrollTop;
        if (search.selectedStoreId) {
            scrollRef.current.querySelector(`[data-store-id="${search.selectedStoreId}"]`)?.focus({ preventScroll: true });
        }
    }, [inert, hasData, keyword, search.page, search.scrollTop, search.selectedStoreId, stores]);
    const changeKeyword = value => update({ keyword: value, page: 0, scrollTop: 0, selectedStoreId: null }, identity);
    const backLabel = search.origin === 'home' ? '메신저 홈으로 돌아가기' : '대화 목록으로 돌아가기';
    const leave = action => leaveSearch(() => {
        if (useMessengerStore.getState().sessionIdentity === identity) action();
    });
    const cancel = () => leave(onBack);
    const choose = (store, unavailable) => {
        const storeId = Number(store.id);
        if (unavailable || selectingRef.current || !ready || !hasData
            || !Number.isSafeInteger(storeId) || storeId <= 0
            || useMessengerStore.getState().sessionIdentity !== identity) return;
        selectingRef.current = true;
        leave(() => onChoose({ kind: 'store', storeId }));
    };
    return <section className={'reserve-messenger-list reserve-messenger-store-search' + motionClass}
        style={{ '--reserve-search-motion-duration': `${SEARCH_MOTION_DURATION_MS}ms` }}
        inert={inert || isClosing ? true : undefined} aria-labelledby="reserve-messenger-store-search-title"
        onKeyDown={event => {
            if (event.key !== 'Escape' || composing || event.nativeEvent.isComposing) return;
            event.preventDefault(); event.stopPropagation(); cancel();
        }}>
        <header className="reserve-messenger-list-heading">
            <IconTool label={backLabel} kind="navigation" icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={cancel} />
            <Heading id="reserve-messenger-store-search-title">가게 찾기</Heading>
        </header>
        <div className="reserve-search-header reserve-search-controls" aria-label="가게 검색">
            <SearchControls value={search.keyword} onChange={changeKeyword} onCancel={cancel} inputRef={inputRef}
                label="가게 이름 또는 주소" placeholder="가게 이름 또는 주소" maxLength={100}
                autoFocus={!inert && !search.selectedStoreId} composing={composing}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={event => { changeKeyword(event.currentTarget.value); setComposing(false); }} />
        </div>
        <div ref={scrollRef} className="reserve-messenger-list-scroll reserve-search-motion-content" aria-busy={Boolean(keyword) && (!ready || query.isFetching)}
            onScroll={event => update({ scrollTop: event.currentTarget.scrollTop }, identity)}>
            {!keyword ? <DataState state="empty" kind="store" title="문의할 가게를 찾아보세요." description="가게 이름이나 주소를 입력해주세요." />
                : !ready || query.isLoading ? <SearchSkeleton />
                    : query.isError && !hasData ? <DataState state="error" kind="store" subject="가게 검색" error={query.error}
                        onRetry={query.refetch} retrying={query.isFetching} />
                        : <>
                            {query.isError && <DataState state="error" kind="store" compact title="검색 결과를 갱신하지 못했어요. 이전 내용을 보여드려요."
                                error={query.error} onRetry={query.refetch} retrying={query.isFetching} />}
                            {!stores.length ? <DataState state="empty" kind="store" title="검색한 가게가 없어요." description="다른 이름이나 주소로 찾아보세요." />
                                : <div aria-label="가게 검색 결과">
                                    {stores.map(store => {
                                        const own = memberId != null && store.ownerId != null && String(memberId) === String(store.ownerId);
                                        const unavailable = own ? '내 가게에는 문의를 보낼 수 없어요.'
                                            : store.status && store.status !== 'ACTIVE' ? '현재 문의를 받을 수 없는 가게예요.' : '';
                                        return <button key={store.id} type="button" className="reserve-messenger-row"
                                            data-store-id={store.id} aria-label={`${store.name}, ${unavailable || '문의 시작'}`}
                                            aria-disabled={Boolean(unavailable) || selecting || undefined} onClick={() => choose(store, unavailable)}>
                                            <MessengerAvatar imageSrc={store.mainImageUrl} variant="store" className="reserve-messenger-row-icon" />
                                            <span className="reserve-messenger-row-copy">
                                                <span className="reserve-messenger-row-line"><strong>{store.name}</strong></span>
                                                <span className="reserve-messenger-row-preview">{[store.category, store.address].filter(Boolean).join(' · ')}</span>
                                                {unavailable && <span className="reserve-messenger-store-unavailable">{unavailable}</span>}
                                            </span>
                                        </button>;
                                    })}
                                </div>}
                            {total > MESSENGER_STORE_PAGE_SIZE && <div className="reserve-messenger-store-pagination">
                                <Pagination simple current={search.page + 1} total={total} pageSize={MESSENGER_STORE_PAGE_SIZE}
                                    showSizeChanger={false} disabled={query.isFetching || selecting}
                                    onChange={page => update({ page: page - 1, scrollTop: 0, selectedStoreId: null }, identity)} />
                            </div>}
                        </>}
        </div>
        {navigation}
    </section>;
}

MessengerStoreSearch.propTypes = { search: PropTypes.shape({ visible: PropTypes.bool.isRequired, keyword: PropTypes.string.isRequired, page: PropTypes.number.isRequired,
    scrollTop: PropTypes.number.isRequired, origin: PropTypes.oneOf(['home', 'conversations']).isRequired, selectedStoreId: PropTypes.number }),
    memberId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), headingLevel: PropTypes.oneOf([1, 2]),
    inert: PropTypes.bool, navigation: PropTypes.node, onBack: PropTypes.func.isRequired, onChoose: PropTypes.func.isRequired };
