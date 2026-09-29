import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { useLocation } from 'react-router-dom';
import Bone from '../common/Bone';
import StoreCardSkeleton from '../common/StoreCardSkeleton';
import { StoreDetailSkeleton, MyReservationCardSkeleton, ReservationSummaryCardSkeleton } from '../common/Skeletons';
import PageContainer from '../common/PageContainer';
import BenefitListSkeleton from '../common/BenefitListSkeleton';
import StoreFormSkeleton from '../store/StoreFormSkeleton';
import StoreListRowSkeleton from '../store/StoreListRowSkeleton';
import { STORE_LIST_PAGE_SIZE } from '../../constants/storeListPageSize';
import { field } from '../../styles/tokens/field';
import { fontWeight, fontSize } from '../../styles/tokens';
import { getRouteSkeletonKind } from './routeSkeletonKind';
import { resolveViewMode } from '../../utils/viewMode';
import MyPageSkeleton from './MyPageSkeleton';
import { SERVICE_DOMAIN_OPTIONS } from '../../constants';

const ROWS = ['one', 'two', 'three', 'four'];
// 홈 바로가기 두 묶음 — 서비스 분야별(분야 수만큼) + 빠른 메뉴 4칸(평점순·관심 가게·내 예약·메시지). pages/Home 의 SHORTCUT_GROUPS 와 같은 개수.
const HOME_SHORTCUT_GROUPS = [
    { key: 'services', count: SERVICE_DOMAIN_OPTIONS.length },
    { key: 'quick', count: 4 },
];

function ListingHeader({ title, description, marginBottom = 32 }) {
    return <div style={{ marginBottom }}>
        <Typography.Title level={2} style={{ margin: '0 0 8px', fontWeight: fontWeight.extrabold }}>{title}</Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: fontSize.lg }}>{description}</Typography.Text>
    </div>;
}
ListingHeader.propTypes = { title: PropTypes.string.isRequired, description: PropTypes.string.isRequired, marginBottom: PropTypes.number };

function ListingToolbarSkeleton() {
    // 실제 줄은 보기 전환·필터 버튼이 44px 터치 영역이라 44 + 아래 8 + 구분선 1 = 53px 이다.
    // 뼈대만 두면 36px 로 줄어 로딩이 끝날 때 아래 내용이 8px 밀렸다(2026-09-29 실측).
    return <div className="reserve-explore-filters" aria-hidden="true" style={{ minHeight: 44, boxSizing: 'content-box' }}>
        <Bone width={72} height={36} />
        <span style={{ flex: 1 }} />
        <div className="reserve-explore-filter-controls"><Bone width={82} height={36} /><Bone width={90} height={36} /></div>
    </div>;
}

function RefreshToolbarSkeleton({ search = false }) {
    // 실제 FilterToolbar 와 같은 배치: 검색칸은 남는 폭을 채우되 줄어들 수 있고(최대 480px),
    // 새로고침은 같은 .reserve-filter-toolbar-refresh 자리에 글자 버튼 크기(약 70x18)로 둔다.
    // Bone 은 기본이 flexShrink 0 이라 100% 폭 검색 뼈대가 줄지 않아 새로고침이 화면 밖(390 폭에서 x=406)으로 밀렸다.
    return <div className="reserve-filter-toolbar" aria-hidden="true">
        <div className={`reserve-filter-toolbar-secondary${search ? '' : ' reserve-filter-toolbar-secondary--refresh-only'}`}>
            {search && <Bone height={40} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, maxWidth: 480 }} />}
            <div className="reserve-filter-toolbar-refresh"><Bone width={70} height={16} /></div>
        </div>
    </div>;
}
RefreshToolbarSkeleton.propTypes = { search: PropTypes.bool };

function DocumentSkeleton() {
    return (
        <div className="reserve-route-skeleton-copy">
            <Bone width="48%" height={24} />
            {ROWS.map(key => <Bone key={key} width="90%" height={14} />)}
        </div>
    );
}

function FormSkeleton() {
    return (
        <div className="reserve-route-skeleton-form">
            <Bone width="55%" height={24} />
            {ROWS.map(key => <Bone key={key} height={field.height} borderRadius={field.radius} />)}
        </div>
    );
}

// 페이지가 데이터 로딩 때 그리는 것과 같은 컴포넌트·개수·보기 방식 — 코드 로딩 → 데이터 로딩으로 넘어갈 때 모양이 안 바뀐다(2026-09-24).
function CardsSkeleton({ pathname = '', search = '' }) {
    if (/^\/my-favorites/.test(pathname)) {
        return <PageContainer size="xl" paddingTop="40px">
            <ListingHeader title="즐겨찾기" description="즐겨찾기를 불러오는 중입니다." />
            <RefreshToolbarSkeleton />
            <div className="rsv-fav-grid"><StoreCardSkeleton count={8} /></div>
        </PageContainer>;
    }
    const isList = resolveViewMode(pathname, new URLSearchParams(search), 'cards') === 'list';
    return <PageContainer size="xl" paddingTop="40px" className="reserve-mystore-page">
        <ListingHeader title="내 가게 관리" description="등록된 가게를 수정하거나 관리할 수 있습니다." marginBottom={40} />
        <ListingToolbarSkeleton />
        <div className={isList ? 'reserve-store-list-rows' : 'rsv-mystore-grid'}>
            {isList ? <StoreListRowSkeleton count={4} /> : <StoreCardSkeleton count={4} withActions />}
        </div>
    </PageContainer>;
}
CardsSkeleton.propTypes = { pathname: PropTypes.string, search: PropTypes.string };

function StoreListRouteSkeleton({ pathname = '/stores', search = '' }) {
    const isList = resolveViewMode(pathname, new URLSearchParams(search), 'cards') === 'list';
    return (
        <>
            <div className="reserve-route-store-toolbar">
                <Bone width={44} height={44} borderRadius={10} />
                <span className="reserve-route-store-toolbar-spacer" />
                <Bone width={90} height={36} />
                <Bone width={84} height={36} />
            </div>
            <div className={isList ? 'reserve-store-list-rows' : 'rsv-store-grid'}>
                {isList
                    ? <StoreListRowSkeleton count={STORE_LIST_PAGE_SIZE} />
                    : <StoreCardSkeleton count={STORE_LIST_PAGE_SIZE} />}
            </div>
        </>
    );
}
StoreListRouteSkeleton.propTypes = { pathname: PropTypes.string, search: PropTypes.string };

function ReservationsSkeleton({ pathname = '/my-reservations', search = '' }) {
    const isCards = resolveViewMode(pathname, new URLSearchParams(search), 'list') === 'cards';
    return <PageContainer size="xl" paddingTop="40px" className="reserve-myreservation-page">
        <ListingHeader title="내 예약 확인" description="예약 현황을 확인하고 방문 후 리뷰를 남겨보세요" />
        <ListingToolbarSkeleton />
        <RefreshToolbarSkeleton search />
        {isCards ? <ReservationSummaryCardSkeleton count={4} /> : <MyReservationCardSkeleton count={4} />}
    </PageContainer>;
}
ReservationsSkeleton.propTypes = { pathname: PropTypes.string, search: PropTypes.string };

function BenefitsRouteSkeleton() {
    return <section className="reserve-benefits-page"><section className="reserve-benefits-news">
        <div className="reserve-benefits-news-content"><BenefitListSkeleton /></div>
    </section></section>;
}


// 실제 홈(pages/Home)의 틀 클래스를 그대로 써서 위치·여백·반응형 경계를 홈 CSS 한 곳에서 따라가게 한다(2026-09-29).
// 예전엔 전용 클래스로 따로 그려 홈에 없는 공지 줄, 한 줄 10칸 바로가기, 89px 제목 줄이 있어 로딩 뒤 모양이 바뀌었다.
function DiscoverySkeleton() {
    return (
        <div className="reserve-discovery-home">
            <div className="reserve-discovery-location">
                <Bone width={112} height={20} />
                <Bone width={72} height={20} />
            </div>
            <div className="reserve-discovery-featured">
                <div className="reserve-discovery-banner-track">
                    <Bone height="auto" borderRadius="var(--reserve-home-banner-radius)" style={{ aspectRatio: 'var(--reserve-home-banner-ratio)' }} />
                </div>
            </div>
            <div className="reserve-discovery-shortcuts">
                <div className="reserve-discovery-shortcut-grid">
                    {HOME_SHORTCUT_GROUPS.map(group => (
                        <div key={group.key} className={'reserve-discovery-shortcut-group reserve-discovery-shortcut-group--' + group.key}>
                            {/* 그룹 제목은 PC 에서만 보인다(모바일은 홈 CSS 가 숨긴다). 20px 줄 높이에 맞춘다 —
                                뼈대의 margin 은 부모 밖으로 겹쳐 사라지므로 부모의 padding 으로 높이를 채운다. */}
                            <div className="reserve-discovery-shortcut-group-title" style={{ paddingBlock: 3 }}><Bone width={96} height={14} /></div>
                            <div className="reserve-discovery-shortcut-items">
                                {Array.from({ length: group.count }, (_, index) => (
                                    <div className="reserve-discovery-shortcut" key={`${group.key}-${index}`}>
                                        <span className="reserve-discovery-shortcut-media"><Bone width={48} height={48} borderRadius="50%" /></span>
                                        <span className="reserve-route-discovery-shortcut-label"><Bone width={42} height={12} /></span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="reserve-discovery-recommended">
                <div className="reserve-discovery-section-heading">
                    <div className="reserve-discovery-section-copy"><Bone width={150} height={22} style={{ marginBlock: 3 }} /></div>
                    {/* '전체 보기' 링크의 44px 터치 높이 */}
                    <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}><Bone width={58} height={16} /></div>
                </div>
                {/* 홈 추천은 가게 목록 행(StoreListRow)을 재사용하므로 스켈레톤도 같은 목록 행 스켈레톤이다. */}
                <div className="reserve-discovery-store-list reserve-store-list-rows">
                    <StoreListRowSkeleton count={4} />
                </div>
            </div>
        </div>
    );
}

function WorkspaceSkeleton() {
    return (
        <div className="reserve-route-skeleton-copy">
            <Bone width="32%" height={24} />
            <Bone height={44} borderRadius={16} />
            {ROWS.map(key => <Bone key={key} height={44} />)}
        </div>
    );
}

function SearchSkeleton() {
    return <div className="reserve-search-page">
        <div className="reserve-search-header">
            <div className="reserve-search-field"><Bone width="65%" height={16} style={{ marginLeft: 16 }} /></div>
            <Bone width={44} height={16} />
        </div>
        <div className="reserve-search-content">
            <Bone width={180} height={26} style={{ marginBottom: 20 }} />
            <div className="reserve-search-domain-grid">
                {SERVICE_DOMAIN_OPTIONS.map(domain => <div key={domain.value} className="reserve-search-domain reserve-route-search-domain">
                    <Bone width={64} height={60} borderRadius={12} /><Bone width={68} height={14} />
                </div>)}
            </div>
            <div className="reserve-search-quick">
                <Bone width={88} height={26} style={{ marginBottom: 20 }} />
                <div className="reserve-search-keywords">
                    {SERVICE_DOMAIN_OPTIONS.map(domain => <Bone key={domain.value} width={68} height={44} borderRadius={100} />)}
                </div>
            </div>
            <Bone width={130} height={20} style={{ marginTop: 28 }} />
        </div>
    </div>;
}

const KINDS = {
    search: SearchSkeleton,
    'my-page': MyPageSkeleton,
    discovery: DiscoverySkeleton,
    'store-form': StoreFormSkeleton,
    // 가게 상세 페이지가 데이터 로딩 때 쓰는 것과 같은 스켈레톤
    detail: StoreDetailSkeleton,
    cards: CardsSkeleton,
    'store-list': StoreListRouteSkeleton,
    reservations: ReservationsSkeleton,
    benefits: BenefitsRouteSkeleton,
    form: FormSkeleton,
    workspace: WorkspaceSkeleton,
    document: DocumentSkeleton,
};

export function RouteSkeletonPreview({ pathname, search = '' }) {
    const kind = getRouteSkeletonKind(pathname);
    const Skeleton = KINDS[kind];
    return (
        <section className={`reserve-route-skeleton reserve-route-skeleton--${kind}`} role="status" aria-label="화면을 불러오는 중" aria-busy="true">
            <div aria-hidden="true"><Skeleton pathname={pathname} search={search} /></div>
        </section>
    );
}
RouteSkeletonPreview.propTypes = { pathname: PropTypes.string.isRequired, search: PropTypes.string };

export default function RouteLoadingSkeleton() {
    const { pathname, search } = useLocation();
    return <RouteSkeletonPreview pathname={pathname} search={search} />;
}
