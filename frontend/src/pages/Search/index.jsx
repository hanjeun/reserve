import { useEffect, useRef, useState } from 'react';
import useUnifiedSearch from '../../hooks/useUnifiedSearch';
import SearchResults from './SearchResults';
import { recordSearchMetric } from '../../utils/searchDiagnostics';
import { normalizeSearchKeyword, SEARCH_KEYWORD_MAX_LENGTH } from '../../constants/searchCatalog';
import { CloseOutlined, SearchOutlined } from '../../components/common/icons';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SERVICE_DOMAIN_OPTIONS } from '../../constants';
import ServiceDomainIcon from '../../components/common/ServiceDomainIcon';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useSearchTransition from '../../hooks/useSearchTransition';
import SearchControls from '../../components/common/SearchControls';
import useRecentSearches from '../../hooks/useRecentSearches';
import { SEARCH_MOTION_DURATION_MS } from '../../components/layout/searchTransition';
import { useDocumentEntry, useSkeletonShown } from '../../components/layout/loadingPresentation';

// 안내용 예시다. 실측 인기 순위나 현재 위치 기반 추천으로 표현하지 않는다.
const QUICK_SEARCHES = ['카페', '스튜디오', '필라테스', '공방', '클리닉', '팝업'];
const searchStateForUrl = (params, state) => {
    const keyword = params.get('keyword') || '';
    const submittedKeyword = normalizeSearchKeyword(keyword);
    const wasDraft = state?.searchReturn?.keyword === submittedKeyword && state.searchReturn.confirmed === false;
    return { keyword, submittedKeyword, choice: params.get('choice') || '', submittedAt: Date.now(), confirmed: Boolean(submittedKeyword) && submittedKeyword.length <= SEARCH_KEYWORD_MAX_LENGTH && !wasDraft };
};

export default function SearchPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { state } = location;
    const [searchParams] = useSearchParams();
    const [search, setSearch] = useState(() => searchStateForUrl(searchParams, state));
    const { keyword, submittedKeyword, confirmed, choice, submittedAt } = search;
    const previousSearchRef = useRef(location.search);
    const [composing, setComposing] = useState(false);
    const restoredRef = useRef(null);
    const restoreDisabledRef = useRef(false);
    const skeletonShown = useSkeletonShown();
    const documentEntry = useDocumentEntry();
    const { terms: recentSearches, add: rememberSearch, remove: removeSearch, clear: clearRecentSearches } = useRecentSearches();
    const inputRef = useRef(null);
    const { isClosing, leaveSearch, motionClass } = useSearchTransition({
        inputRef, animateEntry: !skeletonShown && !documentEntry,
    });
    const result = useUnifiedSearch({ keyword, submittedKeyword, confirmed, composing, enabled: !isClosing, choice, submittedAt });
    useDocumentTitle('검색', '가게와 메뉴, 도움말과 내 예약·웨이팅·메시지를 찾아보세요.');

    useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

    const closeSearch = () => leaveSearch(() => {
        if (state?.searchEntry === true) navigate(-1);
        else navigate('/', { replace: true });
    });

    const searchFor = (value, selection = '', source = 'submitted') => {
        const normalized = value.trim();
        if (composing || !normalized || normalized.length > SEARCH_KEYWORD_MAX_LENGTH) {
            inputRef.current?.focus();
            return;
        }
        restoreDisabledRef.current = true;
        setSearch({ keyword: normalized, submittedKeyword: normalized, confirmed: true, choice: selection, submittedAt: Date.now() });
        rememberSearch(normalized);
        inputRef.current?.focus({ preventScroll: true });
        recordSearchMetric(selection ? 'choice' : source);
        navigate('/search?keyword=' + encodeURIComponent(normalized) + (selection ? '&choice=' + encodeURIComponent(selection) : ''), { replace: true, state: { ...state, searchReturn: undefined } });
    };

    const clearSearchReturn = empty => {
        const params = new URLSearchParams(searchParams);
        if (empty) { params.delete('keyword'); params.delete('choice'); }
        const nextSearch = empty ? (params.size ? '?' + params.toString() : '') : location.search;
        navigate(location.pathname + nextSearch, { replace: true, state: { ...state, searchReturn: undefined } });
    };
    const changeKeyword = value => {
        restoreDisabledRef.current = true;
        const empty = !normalizeSearchKeyword(value);
        setSearch(current => ({ ...current, keyword: value, confirmed: false, choice: '', ...(empty ? { submittedKeyword: '' } : {}) }));
        if (empty) {
            restoredRef.current = null;
            clearSearchReturn(true);
            window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
        } else if (state?.searchReturn) clearSearchReturn(false);
    };
    const beginComposition = () => {
        restoreDisabledRef.current = true;
        setComposing(true);
        setSearch(current => ({ ...current, confirmed: false }));
        if (state?.searchReturn) clearSearchReturn(false);
    };
    useEffect(() => {
        if (previousSearchRef.current === location.search) return;
        previousSearchRef.current = location.search;
        // 실제 URL 변경만 확정 상태를 부여하며 같은 단어의 재입력은 확정으로 처리하지 않는다.
        setSearch(searchStateForUrl(searchParams, state));
    }, [location.search, searchParams, state]);
    useEffect(() => {
        const saved = state?.searchReturn;
        if (restoreDisabledRef.current || !saved || saved.keyword !== result.keyword || restoredRef.current === location.key || !result.ready
            || result.publicQuery.isFetching || result.personalAllowed && result.personalQuery.isFetching) return undefined;
        const frame = requestAnimationFrame(() => {
            if (restoreDisabledRef.current) return;
            window.scrollTo({ left: saved.left, top: saved.top, behavior: 'instant' });
            if (!document.querySelector('.reserve-messenger-panel-shell:not(.is-closing)')) {
                [...document.querySelectorAll('.reserve-search-content a')].find(link => link.getAttribute('href') === saved.path)?.focus({ preventScroll: true });
            }
            restoredRef.current = location.key;
        });
        return () => cancelAnimationFrame(frame);
    }, [location.key, state, result.keyword, result.ready, result.publicQuery.isFetching, result.personalAllowed, result.personalQuery.isFetching]);

    const chooseResult = (event, destination) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const normalized = keyword.trim();
        recordSearchMetric('selected');
        const searchReturn = { keyword: normalized, confirmed: result.confirmed, path: destination, left: window.scrollX, top: window.scrollY };
        leaveSearch(() => {
            rememberSearch(normalized);
            navigate('/search?keyword=' + encodeURIComponent(normalized) + (choice ? '&choice=' + encodeURIComponent(choice) : ''), { replace: true, state: { ...state, searchReturn } });
            navigate(destination);
        });
    };

    const followSearchLink = event => {
        // 새 탭·창 열기는 현재 검색 화면을 닫지 않는다.
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const destination = event.currentTarget.getAttribute('href');
        leaveSearch(() => navigate(destination, { replace: true }));
    };

    return (
        <div className={'reserve-search-page' + motionClass} inert={isClosing ? true : undefined}
            style={{ '--reserve-search-motion-duration': `${SEARCH_MOTION_DURATION_MS}ms` }}>
            <h1 className="reserve-discovery-visually-hidden">통합 검색</h1>
            <header className="reserve-search-header reserve-search-controls">
                <SearchControls value={keyword} onChange={changeKeyword} onCancel={closeSearch} onSubmit={searchFor}
                    inputRef={inputRef} label="가게 이름, 지역 또는 서비스 검색" placeholder="가게·메뉴·내역 검색" maxLength={SEARCH_KEYWORD_MAX_LENGTH}
                    composing={composing} onCompositionStart={beginComposition}
                    onCompositionEnd={event => { changeKeyword(event.currentTarget.value); setComposing(false); }} />
            </header>

            <div className="reserve-search-content">
                {normalizeSearchKeyword(keyword) ? <SearchResults result={result} onChoose={chooseResult} onSubmit={searchFor} /> : <>
                <section className="reserve-search-domains" aria-labelledby="search-domains-title">
                    <h2 id="search-domains-title">어떤 서비스를 찾으세요?</h2>
                    <div className="reserve-search-domain-grid">
                        {SERVICE_DOMAIN_OPTIONS.map(domain => {
                            return (
                                <Link key={domain.value} to={'/stores?domain=' + encodeURIComponent(domain.value)} className="reserve-search-domain" onClick={followSearchLink}>
                                    <span className="reserve-search-domain-media" aria-hidden="true">
                                        <ServiceDomainIcon domain={domain.value} />
                                    </span>
                                    <span>{domain.label.replaceAll(' · ', '·')}</span>
                                </Link>
                            );
                        })}
                    </div>
                </section>

                <section className="reserve-search-quick" aria-labelledby="search-quick-title">
                    <h2 id="search-quick-title">빠른 검색</h2>
                    <div className="reserve-search-keywords">
                        {QUICK_SEARCHES.map(term => (
                            <button type="button" key={term} onClick={() => searchFor(term)}>{term}</button>
                        ))}
                    </div>
                </section>

                <section className="reserve-search-recent" aria-labelledby="search-recent-title">
                    <div className="reserve-search-recent-heading">
                        <h2 id="search-recent-title">최근 검색</h2>
                        {recentSearches.length > 0 && (
                            <button type="button" className="reserve-search-recent-clear" onClick={clearRecentSearches}>전체 삭제</button>
                        )}
                    </div>
                    {recentSearches.length > 0 ? (
                        <ul className="reserve-search-recent-list">
                            {recentSearches.map(term => (
                                <li key={term} className="reserve-search-recent-item">
                                    <button type="button" className="reserve-search-recent-term" aria-label={`최근 검색: ${term}`} onClick={() => searchFor(term)}>
                                        <SearchOutlined aria-hidden="true" />
                                        <span>{term}</span>
                                    </button>
                                    <button type="button" className="reserve-search-recent-remove" aria-label={`최근 검색 삭제: ${term}`} onClick={() => removeSearch(term)}>
                                        <CloseOutlined aria-hidden="true" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="reserve-search-recent-empty">최근 검색한 내용이 없어요.</p>}
                </section>
                </>}
            </div>
        </div>
    );
}
