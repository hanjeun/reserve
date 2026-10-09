import { useEffect, useRef, useState } from 'react';
import { CloseCircleFilled, CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SERVICE_DOMAIN_OPTIONS } from '../../constants';
import ServiceDomainIcon from '../../components/common/ServiceDomainIcon';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useReducedMotion from '../../hooks/useReducedMotion';
import useRecentSearches from '../../hooks/useRecentSearches';

// 안내용 예시다. 실측 인기 순위나 현재 위치 기반 추천으로 표현하지 않는다.
const SEARCH_EXIT_DURATION_MS = 220;
const QUICK_SEARCHES = ['카페', '스튜디오', '필라테스', '공방', '클리닉', '팝업'];

export default function SearchPage() {
    const navigate = useNavigate();
    const { state } = useLocation();
    const [searchParams] = useSearchParams();
    const [keyword, setKeyword] = useState(() => searchParams.get('keyword') || '');
    const [isClosing, setIsClosing] = useState(false);
    const reducedMotion = useReducedMotion();
    const { terms: recentSearches, add: rememberSearch, remove: removeSearch, clear: clearRecentSearches } = useRecentSearches();
    const inputRef = useRef(null);
    // 연달아 누른 취소가 뒤로가기를 두 번 하지 않게 한다(뒤로가기는 비동기라 화면이 잠깐 남아 있다).
    const closingRef = useRef(false);
    const exitTimerRef = useRef(null);
    useDocumentTitle('검색', '가게 이름, 지역, 서비스로 원하는 가게를 찾아보세요.');

    useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

    useEffect(() => () => window.clearTimeout(exitTimerRef.current), []);

    // 검색 실행·취소·Esc 모두 같은 아래로 내려가는 모션 뒤 이동한다. 원래 화면은 옆으로 밀리지 않는다.
    // (routeEntryMotion 이 검색 화면을 떠나는 이동에는 페이지 전환을 걸지 않는다, 2026-09-23).
    const leaveSearch = leave => {
        if (closingRef.current) return;
        closingRef.current = true;
        inputRef.current?.blur();
        if (reducedMotion) {
            leave();
            return;
        }
        setIsClosing(true);
        exitTimerRef.current = window.setTimeout(leave, SEARCH_EXIT_DURATION_MS);
    };

    const closeSearch = () => leaveSearch(() => {
        if (state?.searchEntry === true) navigate(-1);
        else navigate('/', { replace: true });
    });

    const searchFor = value => {
        const normalized = value.trim();
        if (!normalized) {
            inputRef.current?.focus();
            return;
        }
        leaveSearch(() => {
            rememberSearch(normalized);
            navigate('/stores?keyword=' + encodeURIComponent(normalized), { replace: true });
        });
    };

    const submitSearch = event => {
        event.preventDefault();
        searchFor(keyword);
    };

    const clearSearch = () => {
        setKeyword('');
        inputRef.current?.focus();
    };

    const followSearchLink = event => {
        // 새 탭·창 열기는 현재 검색 화면을 닫지 않는다.
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const destination = event.currentTarget.getAttribute('href');
        leaveSearch(() => navigate(destination, { replace: true }));
    };

    let motionClass = '';
    if (isClosing) motionClass = ' reserve-search-page--leaving';
    else if (!reducedMotion) motionClass = ' reserve-search-page--entering';

    return (
        <div className={'reserve-search-page' + motionClass}>
            <h1 className="reserve-discovery-visually-hidden">가게 검색</h1>
            <header className="reserve-search-header">
                <form className="reserve-search-field" role="search" onSubmit={submitSearch}>
                    <button type="submit" className="reserve-search-icon" aria-label="검색">
                        <SearchOutlined aria-hidden="true" />
                    </button>
                    <input
                        ref={inputRef}
                        type="search"
                        aria-label="가게 이름, 지역 또는 서비스 검색"
                        placeholder="가게·지역·서비스 검색"
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        enterKeyHint="search"
                        value={keyword}
                        onChange={event => setKeyword(event.target.value)}
                        onKeyDown={event => {
                            // 한글 조합을 확정하는 Enter가 검색까지 실행되지 않게 한다.
                            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
                                event.preventDefault();
                                return;
                            }
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                closeSearch();
                            }
                        }}
                    />
                    {keyword && (
                        <button type="button" className="reserve-search-clear" aria-label="검색어 지우기" onClick={clearSearch}>
                            <CloseCircleFilled aria-hidden="true" />
                        </button>
                    )}
                </form>
                <button type="button" className="reserve-search-cancel" onClick={closeSearch}>취소</button>
            </header>

            <div className="reserve-search-content">
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
                    <p className="reserve-search-recent-note">이 브라우저에만 저장돼요.</p>
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
            </div>
        </div>
    );
}
