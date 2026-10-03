import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
    ArrowRightOutlined,
    DownOutlined,
    EnvironmentOutlined,
    RightOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DataState } from '../../components/common';
import RegionSheet from '../../components/discovery/RegionSheet';
import StoreListRow from '../../components/store/StoreListRow';
import StoreListRowSkeleton from '../../components/store/StoreListRowSkeleton';
import { SERVICE_DOMAIN_OPTIONS } from '../../constants';
import { DISCOVERY_ASSET_ROOT as ASSET_ROOT, SERVICE_DOMAIN_IMAGES } from '../../constants/discovery';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useGeolocation from '../../hooks/useGeolocation';
import useMessage from '../../hooks/useMessage';
import useReducedMotion from '../../hooks/useReducedMotion';
import useAuthStore from '../../store/useAuthStore';
import useLocationStore from '../../store/useLocationStore';
import { storeService } from '../../services';
import { distanceSortParams } from '../../utils/distanceSort';
import { formatRegionLabel } from '../../constants/regions';

const withRegion = (path, region) => {
    if (!region || !path.startsWith('/stores')) return path;
    const [pathname, query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    params.set('region', region);
    return `${pathname}?${params.toString()}`;
};

const SHORTCUTS = [
    ...SERVICE_DOMAIN_OPTIONS.map(domain => ({
        key: domain.value,
        label: domain.shortLabel,
        accessibleLabel: domain.label + ' 가게 둘러보기',
        to: '/stores?domain=' + encodeURIComponent(domain.value),
        ...SERVICE_DOMAIN_IMAGES[domain.value],
    })),
    { key: 'rating', label: '평점순', to: '/stores?sort=rating', asset: 'rating', width: 45, height: 45 },
    { key: 'favorites', label: '관심 가게', to: '/my-favorites', asset: 'favorites', width: 45, height: 51 },
    { key: 'reservations', label: '내 예약', to: '/my-reservations', asset: 'reservations', width: 43, height: 53 },
    { key: 'messages', label: '메시지', to: '/messages', asset: 'messages', width: 49, height: 49 },
];

const SHORTCUT_GROUPS = [
    { key: 'services', title: '서비스별로 찾기', items: SHORTCUTS.filter(shortcut => SERVICE_DOMAIN_IMAGES[shortcut.key]) },
    { key: 'quick', title: '빠른 메뉴', items: SHORTCUTS.filter(shortcut => !SERVICE_DOMAIN_IMAGES[shortcut.key]) },
];

const FEATURED_SLIDES = [
    {
        key: 'operation-guide',
        asset: 'operation-guide-cover-v1',
        desktopAsset: 'operation-guide-cover-desktop-v1',
        to: '/operation-guide',
        accessibleLabel: 'RESERVE 운영 안내 보기',
        kicker: 'RESERVE 이용 안내',
        title: ['예약 전에 확인하면,', '더 편리해요'],
        description: '예약·결제·취소 기준을 한눈에 확인하세요',
    },
    {
        key: 'dining',
        asset: 'dining-cover',
        desktopAsset: 'dining-cover-desktop-v1',
        to: '/stores?domain=FOOD',
        kicker: '맛집 · 카페',
        title: ['오늘의 한 끼,', '어디서 만날까요?'],
        description: '마음에 드는 맛집을 찾아보세요',
    },
    {
        key: 'class',
        asset: 'class-cover',
        desktopAsset: 'class-cover-desktop-v1',
        to: '/stores?domain=PERFORMANCE',
        kicker: '공연 · 클래스',
        title: ['잠깐의 몰입,', '새로운 취미 하나'],
        description: '나를 위한 시간을 예약해보세요',
    },
    {
        key: 'popup',
        asset: 'popup-cover',
        desktopAsset: 'popup-cover-desktop-v1',
        to: '/stores?domain=POPUP',
        kicker: '팝업 · 대관',
        title: ['이번 주의 발견,', '가보고 싶은 공간'],
        description: '새로운 공간을 둘러보세요',
    },
];
const FEATURED_AUTO_ADVANCE_MS = 6000;

const homeKeys = {
    recommendedStores: region => ['home', 'recommended-stores', region],
};
const storeContent = page => page?.content ?? [];

function SectionHeading({ title, description, action }) {
    return (
        <div className="reserve-discovery-section-heading">
            <div className="reserve-discovery-section-copy">
                <h2>{title}</h2>
                {description && <p>{description}</p>}
            </div>
            {action}
        </div>
    );
}

SectionHeading.propTypes = {
    title: PropTypes.node.isRequired,
    description: PropTypes.string,
    action: PropTypes.node,
};

function FeaturedCarousel({ region = '' }) {
    const featuredRef = useRef(null);
    const trackRef = useRef(null);
    const pointerInputRef = useRef(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [manualNavigationCount, setManualNavigationCount] = useState(0);
    const [isPageVisible, setIsPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
    const [isInViewport, setIsInViewport] = useState(() => typeof IntersectionObserver === 'undefined');
    const [isPointerOver, setIsPointerOver] = useState(false);
    const [isKeyboardFocusWithin, setIsKeyboardFocusWithin] = useState(false);
    const reducedMotion = useReducedMotion();

    const updateActiveSlide = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;
        const origin = track.children[0].offsetLeft;
        let nearest = 0;
        let distance = Infinity;
        Array.from(track.children).forEach((slide, index) => {
            const nextDistance = Math.abs(slide.offsetLeft - origin - track.scrollLeft);
            if (nextDistance < distance) {
                nearest = index;
                distance = nextDistance;
            }
        });
        setActiveIndex(nearest);
    }, []);

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        // 반응형 폭이 바뀌어 네이티브 scroll-snap이 재배치되어도 표시 번호를 맞춘다.
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateActiveSlide);
            return () => window.removeEventListener('resize', updateActiveSlide);
        }
        const observer = new ResizeObserver(updateActiveSlide);
        observer.observe(track);
        return () => observer.disconnect();
    }, [updateActiveSlide]);

    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return undefined;
        const featured = featuredRef.current;
        if (!featured) return undefined;
        const observer = new IntersectionObserver(([entry]) => setIsInViewport(entry.intersectionRatio >= 0.25), {
            threshold: 0.25,
        });
        observer.observe(featured);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const updateVisibility = () => setIsPageVisible(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', updateVisibility);
        return () => document.removeEventListener('visibilitychange', updateVisibility);
    }, []);

    const showNextSlide = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;
        // 마지막 슬라이드에서 처음으로 돌아가며 모바일 트랙의 좌우 여백도 고려한다.
        const maxScroll = track.scrollWidth - track.clientWidth;
        const nextIndex = (activeIndex + 1) % FEATURED_SLIDES.length;
        const nextLeft = nextIndex === 0
            ? 0
            : Math.min(track.children[nextIndex].offsetLeft - track.children[0].offsetLeft, maxScroll);
        track.scrollTo({
            left: nextLeft,
            behavior: reducedMotion ? 'auto' : 'smooth',
        });
    }, [activeIndex, reducedMotion]);

    useEffect(() => {
        if (reducedMotion || !isPageVisible || !isInViewport || isPointerOver || isKeyboardFocusWithin) return undefined;
        const timer = window.setTimeout(showNextSlide, FEATURED_AUTO_ADVANCE_MS);
        return () => window.clearTimeout(timer);
    }, [isPageVisible, isInViewport, isPointerOver, isKeyboardFocusWithin, manualNavigationCount, reducedMotion, showNextSlide]);

    const handleKeyboardInput = () => {
        pointerInputRef.current = false;
        setIsKeyboardFocusWithin(true);
    };

    const handleNextClick = () => {
        setManualNavigationCount(count => count + 1);
        showNextSlide();
    };

    return (
        <section
            ref={featuredRef}
            className="reserve-discovery-featured"
            aria-label="서비스 추천"
            aria-roledescription="캐러셀"
            onPointerEnter={event => {
                if (event.pointerType === 'mouse' || event.pointerType === 'pen') setIsPointerOver(true);
            }}
            onPointerLeave={event => {
                if (event.pointerType === 'mouse' || event.pointerType === 'pen') setIsPointerOver(false);
            }}
            onPointerDown={() => { pointerInputRef.current = true; }}
            onFocus={() => {
                if (!pointerInputRef.current) setIsKeyboardFocusWithin(true);
            }}
            onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    pointerInputRef.current = false;
                    setIsKeyboardFocusWithin(false);
                }
            }}
        >
            <div
                ref={trackRef}
                className="reserve-discovery-banner-track"
                onScroll={updateActiveSlide}
            >
                {FEATURED_SLIDES.map((slide, index) => (
                    <Link
                        key={slide.key}
                        to={withRegion(slide.to, region)}
                        state={{ reserveDiscoveryEntry: 'featured-banner' }}
                        onKeyDown={handleKeyboardInput}
                        className={'reserve-discovery-banner' + (index === activeIndex ? ' reserve-discovery-banner--current' : '')}
                        aria-label={slide.accessibleLabel ?? (slide.title.join(' ') + ' — ' + slide.kicker + ' 둘러보기')}
                    >
                        <picture>
                            <source
                                media="(min-width: 900px)"
                                srcSet={ASSET_ROOT + slide.desktopAsset + '.' + (slide.extension ?? 'webp')}
                            />
                            <img
                                src={ASSET_ROOT + slide.asset + '.' + (slide.extension ?? 'webp')}
                                alt=""
                                width={960}
                                height={640}
                                loading={index === 0 ? 'eager' : 'lazy'}
                                fetchPriority={index === 0 ? 'high' : 'auto'}
                                draggable={false}
                            />
                        </picture>
                        <span className="reserve-discovery-banner-copy">
                            <span className="reserve-discovery-banner-kicker">{slide.kicker}</span>
                            <strong>{slide.title[0]}<br />{slide.title[1]}</strong>
                            <span className="reserve-discovery-banner-description">{slide.description}</span>
                        </span>
                    </Link>
                ))}
            </div>
            <button
                type="button"
                className="reserve-discovery-banner-next"
                onClick={handleNextClick}
                onKeyDown={handleKeyboardInput}
                aria-label="다음 추천 배너 보기"
            >
                <span>{activeIndex + 1} / {FEATURED_SLIDES.length}</span>
                <RightOutlined aria-hidden="true" />
            </button>
        </section>
    );
}

FeaturedCarousel.propTypes = { region: PropTypes.string };

function DiscoveryShortcuts({ region = '' }) {
    return (
        <section id="home-services" className="reserve-discovery-shortcuts" aria-labelledby="home-services-title">
            <h2 id="home-services-title" className="reserve-discovery-visually-hidden">서비스 둘러보기</h2>
            <div className="reserve-discovery-shortcut-grid">
                {SHORTCUT_GROUPS.map(group => (
                    <div key={group.key} className={'reserve-discovery-shortcut-group reserve-discovery-shortcut-group--' + group.key}>
                        <h3 className="reserve-discovery-shortcut-group-title">{group.title}</h3>
                        <div className="reserve-discovery-shortcut-items">
                            {group.items.map(shortcut => (
                                <Link
                                    key={shortcut.key}
                                    to={withRegion(shortcut.to, region)}
                                    className="reserve-discovery-shortcut"
                                    aria-label={shortcut.accessibleLabel || shortcut.label}
                                >
                                    <span className="reserve-discovery-shortcut-media" aria-hidden="true">
                                        <img
                                            src={ASSET_ROOT + shortcut.asset + '.webp'}
                                            alt=""
                                            width={shortcut.width}
                                            height={shortcut.height}
                                            draggable={false}
                                        />
                                    </span>
                                    <span>{shortcut.label}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

DiscoveryShortcuts.propTypes = { region: PropTypes.string };

function RecommendedStores({ region = '' }) {
    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: homeKeys.recommendedStores(region),
        queryFn: () => storeService.getStores({ page: 0, size: 4, sort: 'rating', ...(region ? { region } : {}) }),
        staleTime: 1000 * 60 * 3,
    });
    const stores = storeContent(data);

    // 로딩 → 실패 → 빈 목록 → 목록 순으로 판정한다.
    // 로딩 영역은 <output>(암묵 role=status)이다. display 는 .reserve-discovery-store-list 가 grid 로 정한다.
    const renderStores = () => {
        if (isLoading) {
            return (
                <output className="reserve-discovery-store-list reserve-store-list-rows" aria-label="추천 가게를 불러오는 중" aria-busy="true">
                    <StoreListRowSkeleton count={4} />
                </output>
            );
        }
        if (isError) {
            return (
                <DataState state="error" kind="store" subject="추천 가게" error={error}
                    title="추천 가게를 불러오지 못했어요." onRetry={refetch} retrying={isFetching} compact />
            );
        }
        if (stores.length === 0) {
            return (
                <div className="reserve-discovery-empty">
                    <DataState state="empty" kind="store" title={region ? '이 지역에 등록된 가게가 없습니다.' : '아직 추천할 가게가 없습니다.'} />
                </div>
            );
        }
        return (
            <ul className="reserve-discovery-store-list reserve-store-list-rows">
                {stores.map(store => (
                    <li key={store.id}><StoreListRow store={store} /></li>
                ))}
            </ul>
        );
    };

    return (
        <section className="reserve-discovery-recommended" aria-labelledby="home-recommended-title">
            <SectionHeading
                title={<span id="home-recommended-title">이런 곳은 어때요?</span>}
                action={<Link to={withRegion('/stores?sort=rating', region)} className="reserve-discovery-more">전체 보기 <ArrowRightOutlined aria-hidden="true" /></Link>}
            />
            {renderStores()}
        </section>
    );
}

RecommendedStores.propTypes = { region: PropTypes.string };

export default function Home() {
    useDocumentTitle(null);
    const navigate = useNavigate();
    const { request: requestLocation, requesting: locating } = useGeolocation();
    const { message } = useMessage();
    const user = useAuthStore(state => state.user);
    const setLiveLocation = useLocationStore(state => state.setLiveLocation);
    const [homeParams, setHomeParams] = useSearchParams();
    const region = homeParams.get('region') || '';
    const [regionOpen, setRegionOpen] = useState(false);

    const openRegion = () => {
        setRegionOpen(true);
    };

    const applyRegion = nextRegion => {
        setHomeParams(prev => {
            const next = new URLSearchParams(prev);
            if (nextRegion) next.set('region', nextRegion);
            else next.delete('region');
            return next;
        });
        setRegionOpen(false);
    };

    const handleCurrentLocation = useCallback(async () => {
        const position = await requestLocation();
        let location = position;
        if (position) {
            setLiveLocation(position);
        } else if (user?.latitude != null && user?.longitude != null) {
            location = { latitude: user.latitude, longitude: user.longitude };
            message.info('마이페이지에 등록된 위치 기준으로 정렬할게요.');
        }
        if (!location) return;

        const distanceParams = distanceSortParams(location);
        if (!distanceParams) return;
        const params = new URLSearchParams(distanceParams);
        if (region) params.set('region', region);
        navigate('/stores?' + params.toString());
    }, [requestLocation, setLiveLocation, user, message, navigate, region]);

    useEffect(() => { window.scrollTo(0, 0); }, []);

    return (
        <div className="reserve-discovery-home">
            <h1 className="reserve-discovery-visually-hidden">RESERVE — 가게를 찾고 예약하세요</h1>
            <div className="reserve-discovery-location">
                <button type="button" className="reserve-discovery-location-link"
                    aria-haspopup="dialog" aria-expanded={regionOpen} onClick={openRegion}>
                    <EnvironmentOutlined aria-hidden="true" />
                    <strong>{region ? formatRegionLabel(region) : '전체 지역'}</strong>
                    <DownOutlined aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="reserve-discovery-current-location"
                    onClick={handleCurrentLocation}
                    disabled={locating}
                    aria-busy={locating}
                >
                    {locating ? '위치 확인 중' : '현재 위치로'}
                </button>
            </div>
            <FeaturedCarousel region={region} />
            <DiscoveryShortcuts region={region} />
            <RecommendedStores region={region} />
            <RegionSheet open={regionOpen} value={region} onClose={() => setRegionOpen(false)} onApply={applyRegion} />
        </div>
    );
}
