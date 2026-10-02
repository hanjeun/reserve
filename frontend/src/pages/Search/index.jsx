import { useEffect, useRef, useState } from 'react';
import { ArrowRightOutlined, CloseCircleFilled, SearchOutlined } from '@ant-design/icons';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SERVICE_DOMAIN_OPTIONS } from '../../constants';
import { DISCOVERY_ASSET_ROOT, SERVICE_DOMAIN_IMAGES } from '../../constants/discovery';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useReducedMotion from '../../hooks/useReducedMotion';

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
        if (state?.searchEntry === true) void navigate(-1);
        else void navigate('/', { replace: true });
    });

    const searchFor = value => {
        const normalized = value.trim();
        if (!normalized) {
            inputRef.current?.focus();
            return;
        }
        leaveSearch(() => navigate('/stores?keyword=' + encodeURIComponent(normalized)));
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
        leaveSearch(() => navigate(destination));
    };

    return (
        <div className={'reserve-search-page' + (isClosing ? ' reserve-search-page--leaving' : !reducedMotion ? ' reserve-search-page--entering' : '')}>
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
                            const image = SERVICE_DOMAIN_IMAGES[domain.value];
                            return (
                                <Link key={domain.value} to={'/stores?domain=' + encodeURIComponent(domain.value)} className="reserve-search-domain" onClick={followSearchLink}>
                                    <span className="reserve-search-domain-media" aria-hidden="true">
                                        <img src={DISCOVERY_ASSET_ROOT + image.asset + '.webp'} alt="" width={image.width} height={image.height} />
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

                <Link to="/stores" className="reserve-search-browse-all" onClick={followSearchLink}>
                    <span>가게 전체 보기</span>
                    <ArrowRightOutlined aria-hidden="true" />
                </Link>
            </div>
        </div>
    );
}
