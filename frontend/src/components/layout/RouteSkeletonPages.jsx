import StoreCardSkeleton from '../common/StoreCardSkeleton';
import { PageStatusSkeleton } from '../common/PageStatus';
import BenefitListSkeleton from '../common/BenefitListSkeleton';
import BenefitDetailSkeleton from '../common/BenefitDetailSkeleton';
import StoreListRowSkeleton from '../store/StoreListRowSkeleton';
import { STORE_LIST_PAGE_SIZE } from '../../constants/storeListPageSize';
import MyPageSkeleton from './MyPageSkeleton';
import { SERVICE_DOMAIN_OPTIONS, SERVICE_DOMAIN_FILTER_OPTIONS, OWNER_STORE_SORT_OPTIONS, SORT_OPTIONS,
    RESERVATION_STATUS_FILTER_OPTIONS, RESERVATION_SORT_OPTIONS } from '../../constants';
import PropTypes from 'prop-types';
import { PageTitle, PageDescription } from '../common/PageTypography';
import Bone from '../common/Bone';
import PageContainer from '../common/PageContainer';
import { ReservationCardSkeleton, ReservationSummaryCardSkeleton, StoreDetailSkeleton, MyReservationCardSkeleton } from '../common/Skeletons';
import StoreOnboardingSkeleton from '../store/StoreOnboardingSkeleton';
import { ListingHeader, ListingToolbarSkeleton, RefreshToolbarSkeleton, SegmentedControlSkeleton } from './routeSkeletonParts';
import { reservationSkeletonFilters } from './reservationSkeletonFilters';
import { WaitingTabSkeleton, MyWaitingSkeleton, WaitingStoresSkeleton } from '../waiting/WaitingSkeleton';
import AdminTabRouteSkeleton, { AdsRouteSkeleton, StatisticsRouteSkeleton, ChatIntroRouteSkeleton } from './WorkspaceRouteSkeletons';
import { normalizeRouteSkeletonPath } from './routeSkeletonKind';
import { discoveryComingSoonScreen } from '../../constants/discoveryComingSoon';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { resolveViewMode } from '../../utils/viewMode';
import { breakpoints, colors, field } from '../../styles/tokens';
import { StateIllustrationSkeleton } from '../common/StateIllustration';
import { GUIDE_PAGES, guidePageForPath, guideStyles } from '../../pages/legal/GuidePageMetadata';

// 2026-09-29 — 청크 로딩 뼈대가 실제 페이지와 같은 틀·여백·순서로 그려지도록 페이지별 뼈대를 모았다.
// 제목·설명·라벨처럼 서버 데이터가 아닌 고정 문구는 실제 글자로 둔다(ListingHeader 와 같은 원칙) —
// 글자 크기·줄바꿈이 실제와 같아 로딩이 끝나도 아래 내용이 밀리지 않는다. 입력칸·버튼·목록만 뼈대다.


/** 글자 모양 뼈대 — 문구는 투명하게 두고 줄마다 막대를 그린다. 폭에 따른 줄바꿈이 실제 문구와 같다. */
export function TextBone({ children }) {
    return <span className="reserve-skeleton-block reserve-route-skeleton-text">{children}</span>;
}
TextBone.propTypes = { children: PropTypes.node.isRequired };

const optionValueOr = (options, value, fallback) => options.some(option => option.value === value) ? value : fallback;
const storeSkeletonFilters = (params, sortOptions, fallbackSort) => [
    { value: params.get('domain') || '', options: SERVICE_DOMAIN_FILTER_OPTIONS, className: 'reserve-explore-domain-filter' },
    { value: optionValueOr(sortOptions, params.get('sort'), fallbackSort), options: sortOptions, className: 'reserve-explore-sort-filter' },
];

/* ── 로그인·회원가입·비밀번호 찾기·소셜 약관 동의 ─────────────────────────── */

const authTitle = { marginBottom: 12 };
const authSubtitle = { display: 'block' };
const centerRow = (height, extra) => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', height, ...extra });
const buttonBone = <Bone height={56} borderRadius={16} />;

// Form.Item(large) 한 칸 — 입력 54 + 아래 여백 24. 여백은 블록 여백이라 다음 형제의 위 여백과 겹친다(실제 폼과 같다).
const AuthInput = () => <div style={{ marginBottom: 24 }}><Bone height={field.height} borderRadius={field.radius} /></div>;

// 약관 동의 묶음(styles/tokens/agreement): 전체 동의 줄 → 구분선 → 항목 줄들. 순서는 화면마다 다르다.
function AgreementRows({ dividerFirst, itemGap, allHeight = 22 }) {
    const divider = <div style={{ height: 1, background: colors.border.light, marginBottom: 20 }} />;
    return <>
        {dividerFirst && divider}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: allHeight, marginBottom: 14 }}>
            <Bone width={16} height={16} borderRadius={4} /><Bone width={150} height={14} />
        </div>
        {!dividerFirst && divider}
        <div style={{ display: 'flex', flexDirection: 'column', gap: itemGap }}>
            {['terms', 'privacy', 'marketing'].map(key => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 26 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Bone width={16} height={16} borderRadius={4} /><Bone width={30} height={16} borderRadius={4} /><Bone width={110} height={13} />
                    </div>
                    {key !== 'marketing' && <Bone width={22} height={12} />}
                </div>
            ))}
        </div>
    </>;
}
AgreementRows.propTypes = { dividerFirst: PropTypes.bool, itemGap: PropTypes.number.isRequired, allHeight: PropTypes.number };

function LoginSkeleton() {
    return <PageContainer size="sm" paddingTop="80px" center>
        <div>
            <PageTitle style={authTitle}>로그인</PageTitle>
            <PageDescription style={{ ...authSubtitle, marginBottom: 48 }}>특별한 날을 위한 완벽한 예약</PageDescription>
            <AuthInput /><AuthInput />
            <div style={{ ...centerRow(18, { marginTop: -8, marginBottom: 16 }), justifyContent: 'flex-end' }}><Bone width={132} height={13} /></div>
            {buttonBone}
            {/* '또는 소셜 로그인' 구분선 */}
            <div style={{ ...centerRow(22), gap: 16, margin: '32px 0' }}>
                <span style={{ flex: 1, borderTop: `1px solid ${colors.border.light}` }} /><Bone width={92} height={12} /><span style={{ flex: 1, borderTop: `1px solid ${colors.border.light}` }} />
            </div>
            <div style={centerRow(52, { gap: 20 })}>
                {['kakao', 'naver', 'google'].map(key => <Bone key={key} width={52} height={52} borderRadius="50%" />)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 32 }}>
                <div style={centerRow(24)}><Bone width={196} height={14} /></div>
                <div style={centerRow(17)}><Bone width={250} height={12} /></div>
            </div>
        </div>
    </PageContainer>;
}

function SignupSkeleton() {
    return <PageContainer size="sm" paddingTop="60px" center>
        <div style={{ textAlign: 'left' }}>
            <PageTitle style={{ ...authTitle, textAlign: 'center' }}>회원가입</PageTitle>
            <PageDescription style={{ ...authSubtitle, marginBottom: 40, textAlign: 'center' }}>간편한 가입으로 예약을 시작하세요</PageDescription>
            {['name', 'email', 'password', 'confirm'].map(key => <AuthInput key={key} />)}
            <div style={{ marginTop: 32 }}><AgreementRows dividerFirst itemGap={8} /></div>
            <div style={{ marginTop: 20 }}>{buttonBone}</div>
            <div style={centerRow(24, { marginTop: 32 })}><Bone width={220} height={14} /></div>
        </div>
    </PageContainer>;
}

const STEP_LABEL_WIDTHS = [['email', 59], ['code', 48], ['password', 70]];
function ForgotPasswordSkeleton() {
    return <PageContainer size="sm" paddingTop="60px" center>
        <div>
            <PageTitle style={authTitle}>비밀번호 찾기</PageTitle>
            <PageDescription style={{ ...authSubtitle, marginBottom: 40 }}>가입한 이메일로 인증 후 비밀번호를 재설정해요</PageDescription>
            {/* 단계 표시(StepIndicator): 원 28 + 6 + 글자 17, 단계 사이 선은 글자 줄 위(아래 20)에 걸린다. */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 40 }}>
                {STEP_LABEL_WIDTHS.map(([key, width], index) => (
                    <div key={key} style={{ display: 'contents' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <Bone width={28} height={28} borderRadius="50%" />
                            <div style={centerRow(17)}><Bone width={width} height={11} /></div>
                        </div>
                        {index < STEP_LABEL_WIDTHS.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 8px 20px', background: colors.gray[100] }} />}
                    </div>
                ))}
            </div>
            <AuthInput />
            <div style={centerRow(22, { marginTop: 20 })}><Bone width={121} height={13} /></div>
        </div>
    </PageContainer>;
}

function SocialAgreementSkeleton() {
    return <PageContainer size="sm" paddingTop="80px">
        <div style={{ maxWidth: 400, margin: '0 auto' }}>
            <PageTitle style={{ marginBottom: 8 }}>RESERVE 서비스 이용 동의</PageTitle>
            <PageDescription style={{ ...authSubtitle, marginBottom: 40 }}>서비스 시작을 위해 아래 약관에 동의해주세요.</PageDescription>
            <div style={{ marginTop: 32 }}><AgreementRows itemGap={12} allHeight={24} /></div>
            <div style={{ marginTop: 40 }}>{buttonBone}</div>
            <div style={{ marginTop: 12 }}>{buttonBone}</div>
        </div>
    </PageContainer>;
}

const AUTH_SKELETONS = {
    '/login': LoginSkeleton,
    '/signup': SignupSkeleton,
    '/forgot-password': ForgotPasswordSkeleton,
    '/signup/social': SocialAgreementSkeleton,
};
export function AuthRouteSkeleton({ pathname = '/login' }) {
    const Skeleton = AUTH_SKELETONS[normalizeRouteSkeletonPath(pathname)] ?? LoginSkeleton;
    return <Skeleton />;
}
AuthRouteSkeleton.propTypes = { pathname: PropTypes.string };

/* ── 약관·개인정보·운영 안내·콘텐츠 출처(문서형) ───────────────────────── */

const LEGAL_TITLES = {
    '/terms': '서비스 이용약관',
    '/privacy': '개인정보 처리방침',
    '/content-sources': '콘텐츠 출처·권리 안내',
};
// 문단 줄(15px × 1.8 = 27px) — 실제 Section: 제목(h4 28 + 아래 12) → 본문, 섹션 아래 32.
const LEGAL_SECTIONS = [['a', [100, 92, 64]], ['b', [96, 88, 90, 52]], ['c', [98, 70]]];
export function LegalRouteSkeleton({ pathname = '' }) {
    const title = LEGAL_TITLES[normalizeRouteSkeletonPath(pathname)];
    return <PageContainer size="md" paddingTop="60px">
        <div style={{ marginBottom: 40 }}>
            {title
                ? <PageTitle style={{ marginBottom: 8 }}>{title}</PageTitle>
                : <Bone width="48%" height={30} style={{ margin: '25px 0 12px' }} />}
            {/* 시행일·수정일 한 줄(13px 글자, 22px 줄) */}
            <div style={{ height: 22, display: 'flex', alignItems: 'center' }}><Bone width={170} height={13} /></div>
        </div>
        {LEGAL_SECTIONS.map(([key, lines]) => (
            <div key={key} style={{ marginBottom: 32 }}>
                <div style={{ height: 28, display: 'flex', alignItems: 'center', marginBottom: 12 }}><Bone width="36%" height={18} /></div>
                {lines.map((width, index) => (
                    <div key={`${key}-${width}-${index}`} style={{ height: 27, display: 'flex', alignItems: 'center' }}><Bone width={`${width}%`} height={13} /></div>
                ))}
            </div>
        ))}
    </PageContainer>;
}
LegalRouteSkeleton.propTypes = { pathname: PropTypes.string };

// 제목·설명·안내 구분·섹션 순서는 실제 공개 이용안내와 같은 작은 메타데이터에서 읽는다.
export function GuideRouteSkeleton({ pathname = '' }) {
    const guide = guidePageForPath(normalizeRouteSkeletonPath(pathname));
    if (!guide) return null;
    return <PageContainer size="md" paddingTop="60px">
        <header style={guideStyles.header}>
            <PageTitle level={1} style={guideStyles.title}>{guide.title}</PageTitle>
            <PageDescription style={guideStyles.description}>{guide.description}</PageDescription>
        </header>
        <div style={guideStyles.navigation}>
            {Object.entries(GUIDE_PAGES).map(([path, page]) => <span key={path} style={guideStyles.navigationItem}>
                <TextBone>{page.title}</TextBone>
            </span>)}
        </div>
        {guide.sections.map(section => <section key={section.id} style={guideStyles.section}>
            <h2 style={guideStyles.sectionTitle}>{section.title}</h2>
            {[100, 92, 64].map(width => <div key={width} style={{ height: 27, display: 'flex', alignItems: 'center' }}>
                <Bone width={width + '%'} height={13} />
            </div>)}
            <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}><Bone width={130} height={14} /></div>
        </section>)}
    </PageContainer>;
}
GuideRouteSkeleton.propTypes = { pathname: PropTypes.string };

/* ── 준비 중 탐색 화면(/waiting, /feed) ───────────────────────────────── */

// 실제 화면과 같은 틀(.reserve-discovery-coming-soon — 최소 높이·세로 가운데 정렬)과 같은 문구 줄바꿈을 쓴다.
export function ComingSoonRouteSkeleton({ pathname = '' }) {
    const screen = discoveryComingSoonScreen(pathname);
    return <section className="reserve-discovery-coming-soon">
        <StateIllustrationSkeleton style={{ marginBottom: 8 }} />
        <Bone width={60} height={27} borderRadius={100} />
        {screen && <>
            <PageTitle level={1}><TextBone>{screen.heading}</TextBone></PageTitle>
            <PageDescription><TextBone>{screen.description}</TextBone></PageDescription>
        </>}
        <div style={{ minHeight: 44, marginTop: 8, display: 'flex', alignItems: 'center' }}><Bone width={110} height={16} /></div>
    </section>;
}
ComingSoonRouteSkeleton.propTypes = { pathname: PropTypes.string };

/* ── 결제 결과 — 처음 도착하면 '결제 처리 중(확인 중)' 화면이 뜬다. 그 배치를 따른다. ── */

export function PaymentResultRouteSkeleton() {
    return <PageContainer size="sm" paddingTop="56px" className="reserve-payment-result-page">
        <div className="reserve-payment-result">
            <div className="reserve-payment-result__content">
                <StateIllustrationSkeleton />
                <div className="reserve-payment-result__title reserve-page-title ant-typography" style={{ height: '1.4em', display: 'flex', alignItems: 'center' }}><Bone width={132} height="0.9em" /></div>
                {/* 설명 두 줄 — PageDescription과 같은 16px × 1.65. */}
                <div className="reserve-payment-result__description reserve-page-description ant-typography" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ height: '1.65em', display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'center' }}><Bone width="92%" height={14} /></div>
                    <div style={{ height: '1.65em', display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'center' }}><Bone width="60%" height={14} /></div>
                </div>
                <div className="reserve-payment-result__hint">
                    <div style={{ height: '1.55em', display: 'flex', alignItems: 'center' }}><Bone width="90%" height={12} /></div>
                    <div style={{ height: '1.55em', display: 'flex', alignItems: 'center' }}><Bone width="55%" height={12} /></div>
                </div>
                <div className="reserve-payment-result__recovery" style={{ height: 24, display: 'flex', alignItems: 'center' }}><Bone width={220} height={12} /></div>
            </div>
        </div>
    </PageContainer>;
}

/* ── 관리자·파트너 패널 — 제목/설명 → 알약 탭 → (탭별) 도구줄 → 목록 ─────────── */

const ADMIN_TAB_TEXT_WIDTHS = [67, 80, 62, 62, 80, 62, 94, 76, 76, 80, 80, 80, 80];
const ADMIN_TAB_KEYS = ['pending', 'all', 'mailbox', 'reports', 'chat-intro', 'trash', 'audit-logs', 'dashboard', 'members', 'stores-admin', 'reservations', 'payments', 'ads'];
const BUSINESS_TAB_KEYS = ['reservations', 'waiting', 'qr-checkin', 'ads', 'analytics', 'chat-intro'];
const BUSINESS_TAB_TEXT_WIDTHS = [81, 62, 87, 80, 89, 80];

// AntD Tabs(reserve-pill-tabs) 자리 — 탭 한 칸은 위아래 8·좌우 18(≤768px 은 7·10) 여백 + 24px 글자 줄, 탭 사이 4.
function PanelTabsSkeleton({ widths, more = false, activeIndex = 0 }) {
    return <div className="reserve-route-panel-tabs">
        <div className="reserve-route-panel-tabs-list">
            {widths.map((width, index) => (
                <span key={`${width}-${index}`} className={`reserve-route-panel-tab${index === activeIndex ? ' is-active' : ''}`}><Bone width={width} height={14} /></span>
            ))}
        </div>
        {more && <span className="reserve-route-panel-tabs-more"><Bone width={16} height={16} /></span>}
    </div>;
}
PanelTabsSkeleton.propTypes = { widths: PropTypes.arrayOf(PropTypes.number).isRequired, more: PropTypes.bool, activeIndex: PropTypes.number };

export function AdminRouteSkeleton({ search = '' }) {
    const requestedTab = new URLSearchParams(search).get('tab') || 'pending';
    const tab = requestedTab === 'chat' ? 'reports' : requestedTab;
    return <PageContainer size="xl" paddingTop="40px">
        <ListingHeader title="관리자 패널" description="사업자 인증 신청을 검토하고, 전체 예약 현황을 모니터링하세요." marginBottom={40} />
        <PanelTabsSkeleton widths={ADMIN_TAB_TEXT_WIDTHS} activeIndex={ADMIN_TAB_KEYS.indexOf(tab)} more />
        <AdminTabRouteSkeleton tab={tab} search={search} />
    </PageContainer>;
}
AdminRouteSkeleton.propTypes = { search: PropTypes.string };

export function BusinessRouteSkeleton({ search = '' }) {
    const params = new URLSearchParams(search);
    const requestedTab = params.get('tab');
    const tab = BUSINESS_TAB_KEYS.includes(requestedTab) ? requestedTab : 'reservations';
    const isCards = resolveViewMode('/business', params, 'list') === 'cards';
    return <PageContainer size="xl" paddingTop="40px">
        <ListingHeader title="사업자 파트너 패널" description="예약 현황을 실시간으로 확인하고 승인·거절하세요." marginBottom={40} />
        {/* 실제 Tabs 는 style={{ marginBottom: 8 }} — 탭+내용 묶음 아래 8px */}
        <div style={{ marginBottom: 8 }}>
            <PanelTabsSkeleton widths={BUSINESS_TAB_TEXT_WIDTHS} activeIndex={BUSINESS_TAB_KEYS.indexOf(tab)} />
            {tab === 'waiting' && <WaitingTabSkeleton view={isCards ? 'cards' : 'list'} />}
            {tab === 'ads' && <AdsRouteSkeleton />}
            {tab === 'analytics' && <StatisticsRouteSkeleton search={search} />}
            {tab === 'chat-intro' && <ChatIntroRouteSkeleton business />}
            {tab === 'reservations' && <>
                <ListingToolbarSkeleton filters={reservationSkeletonFilters({
                    store: params.get('reservationStore') || 'ALL',
                    status: optionValueOr(RESERVATION_STATUS_FILTER_OPTIONS, params.get('reservationStatus'), 'ALL'),
                    sort: optionValueOr(RESERVATION_SORT_OPTIONS, params.get('reservationSort'), 'recent'),
                })} />
                <RefreshToolbarSkeleton search />
                {isCards ? <ReservationSummaryCardSkeleton count={5} /> : <ReservationCardSkeleton count={5} />}
            </>}
        </div>
    </PageContainer>;
}
BusinessRouteSkeleton.propTypes = { search: PropTypes.string };

/* ── 메시지(모바일 전용 — PC 는 바로 이전 화면의 패널로 넘긴다) ───────────────── */

export function MessagesRouteSkeleton({ search = '' }) {
    const isWide = useWindowWidth() >= breakpoints.tablet;
    // PC 에서는 실제 페이지가 아무것도 그리지 않고 곧바로 돌아간다 — 빈 자리만 둔다.
    if (isWide) return <div style={{ minHeight: 'calc(100svh - 64px)' }} />;
    const storeId = Number(new URLSearchParams(search).get('storeId'));
    if (Number.isInteger(storeId) && storeId > 0) {
        // 가게 문의로 바로 들어오면 대화 화면이 열린다(MessengerContent 의 모바일 대화 배치).
        return <div className="reserve-messages-page">
            <div className="reserve-messenger reserve-messenger--page has-thread has-mobile-thread">
                <section className="reserve-messenger-thread">
                    <div className="reserve-messenger-thread-heading">
                        <Bone width={40} height={40} borderRadius={15} />
                        <span className="reserve-messenger-thread-copy" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Bone width={120} height={15} /><Bone width={64} height={11} /></span>
                    </div>
                    <div className="reserve-messenger-thread-body">
                        <div className="reserve-messenger-thread-skeleton">
                            <div><Bone width="65%" height={44} borderRadius={14} /><Bone width="50%" height={44} borderRadius={14} style={{ marginLeft: 'auto' }} /><Bone width="75%" height={44} borderRadius={14} /></div>
                        </div>
                    </div>
                </section>
            </div>
        </div>;
    }
    // 기본은 메신저 홈: 표지 200 → 고객지원 안내 카드 → 아래 탭 3개.
    return <div className="reserve-messages-page">
        <div className="reserve-messenger reserve-messenger--page is-home">
            <section className="reserve-messenger-home">
                <div className="reserve-messenger-brand-cover"><Bone height="100%" borderRadius={0} /></div>
                <div className="reserve-messenger-home-scroll">
                    <div className="reserve-messenger-welcome">
                        <div className="reserve-messenger-welcome-sender"><Bone width={40} height={40} borderRadius={15} /><Bone width={132} height={15} /></div>
                        <div style={{ margin: '14px 0 18px', height: 23, display: 'flex', alignItems: 'center' }}><Bone width="85%" height={14} /></div>
                        <Bone height={46} borderRadius={12} />
                    </div>
                </div>
            </section>
            <div className="reserve-messenger-footer">
                {['home', 'conversations', 'settings'].map(key => (
                    <div key={key} className="reserve-messenger-footer-tab"><Bone width={21} height={21} borderRadius={6} /><span style={{ height: 17, display: 'flex', alignItems: 'center' }}><Bone width={22} height={11} /></span></div>
                ))}
            </div>
        </div>
    </div>;
}
MessagesRouteSkeleton.propTypes = { search: PropTypes.string };

/* ── 가게 등록·수정 — 첫 질문·항목 선택과 같은 PageContainer 를 그린다. ── */
export function StoreFormRouteSkeleton({ pathname = '' }) {
    return <StoreOnboardingSkeleton mode={normalizeRouteSkeletonPath(pathname).endsWith('/edit') ? 'edit' : 'create'} />;
}
StoreFormRouteSkeleton.propTypes = { pathname: PropTypes.string };

// StoreDetail.jsx 의 BREAKPOINT 와 같은 값 — PC 두 칸 배치가 시작되는 폭.
const STORE_DETAIL_BREAKPOINT = 900;
// 홈 바로가기 두 묶음 — 서비스 분야별(분야 수만큼) + 빠른 메뉴 4칸(평점순·관심 가게·내 예약·메시지). pages/Home 의 SHORTCUT_GROUPS 와 같은 개수.
const HOME_SHORTCUT_GROUPS = [
    { key: 'services', count: SERVICE_DOMAIN_OPTIONS.length },
    { key: 'quick', count: 4 },
];

// 페이지가 데이터 로딩 때 그리는 것과 같은 컴포넌트·개수·보기 방식 — 코드 로딩 → 데이터 로딩으로 넘어갈 때 모양이 안 바뀐다(2026-09-24).
function CardsSkeleton({ pathname = '', search = '' }) {
    const isList = resolveViewMode(pathname, new URLSearchParams(search), 'cards') === 'list';
    if (pathname.startsWith('/my-favorites')) {
        return <PageContainer size="xl" paddingTop="40px">
            <ListingHeader title="즐겨찾기" description="즐겨찾기를 불러오는 중이에요." />
            <RefreshToolbarSkeleton viewControl />
            <div className={isList ? 'reserve-store-list-rows' : 'rsv-fav-grid'}>
                {isList ? <StoreListRowSkeleton count={8} /> : <StoreCardSkeleton count={8} />}
            </div>
        </PageContainer>;
    }
    return <PageContainer size="xl" paddingTop="40px" className="reserve-mystore-page">
        <ListingHeader title="내 가게 관리" description="등록된 가게를 수정하거나 관리할 수 있어요." marginBottom={40} />
        <ListingToolbarSkeleton className="" filters={storeSkeletonFilters(new URLSearchParams(search), OWNER_STORE_SORT_OPTIONS, 'recent')} />
        <div className={isList ? 'reserve-store-list-rows' : 'rsv-mystore-grid'}>
            {isList ? <StoreListRowSkeleton count={4} /> : <StoreCardSkeleton count={4} withActions />}
        </div>
    </PageContainer>;
}
CardsSkeleton.propTypes = { pathname: PropTypes.string, search: PropTypes.string };

function StoreListRouteSkeleton({ pathname = '/stores', search = '' }) {
    const params = new URLSearchParams(search);
    const isList = resolveViewMode(pathname, params, 'cards') === 'list';
    return (
        <>
            <ListingToolbarSkeleton className="" region count={null} filters={storeSkeletonFilters(params, SORT_OPTIONS, 'recommended')} />
            <div className={isList ? 'reserve-store-list-rows' : 'rsv-store-grid'}>
                {isList
                    ? <StoreListRowSkeleton count={STORE_LIST_PAGE_SIZE} />
                    : <StoreCardSkeleton count={STORE_LIST_PAGE_SIZE} />}
            </div>
        </>
    );
}
StoreListRouteSkeleton.propTypes = { pathname: PropTypes.string, search: PropTypes.string };

function WaitingRouteSkeleton({ pathname, search }) {
    const isList = resolveViewMode(pathname, new URLSearchParams(search), 'cards') === 'list';
    return <PageContainer size="xl" paddingTop="32px">
        <div className="reserve-waiting-heading"><PageTitle level={1}>웨이팅</PageTitle><PageDescription>접수 가능한 가게를 찾고, 내 예약에서 대기 현황을 확인해요.</PageDescription></div>
        <WaitingStoresSkeleton view={isList ? 'list' : 'cards'} />
    </PageContainer>;
}
WaitingRouteSkeleton.propTypes = { pathname: PropTypes.string, search: PropTypes.string };

function ReservationsSkeleton({ pathname = '/my-reservations', search = '' }) {
    const params = new URLSearchParams(search);
    const isCards = resolveViewMode(pathname, params, 'list') === 'cards';
    const waiting = params.get('tab') === 'waiting';
    return <PageContainer size="xl" paddingTop="40px" className="reserve-myreservation-page">
        <ListingHeader title="내 예약 확인" description="예약과 웨이팅 현황을 확인해요" marginBottom={24} />
        <div style={{ marginBottom: 20 }}><SegmentedControlSkeleton
            value={waiting ? 'waiting' : 'reservation'}
            options={[{ value: 'reservation', label: '예약' }, { value: 'waiting', label: '웨이팅' }]} /></div>
        {waiting ? <MyWaitingSkeleton view={isCards ? 'cards' : 'list'} /> : <>
            <ListingToolbarSkeleton filters={reservationSkeletonFilters({
                status: optionValueOr(RESERVATION_STATUS_FILTER_OPTIONS, params.get('status'), 'ALL'),
                sort: optionValueOr(RESERVATION_SORT_OPTIONS, params.get('sort'), 'recent'),
            })} />
            <RefreshToolbarSkeleton search />
            {isCards ? <ReservationSummaryCardSkeleton count={4} /> : <MyReservationCardSkeleton count={4} />}
        </>}
    </PageContainer>;
}
ReservationsSkeleton.propTypes = { pathname: PropTypes.string, search: PropTypes.string };

function BenefitsRouteSkeleton() {
    return <section className="reserve-benefits-page"><section className="reserve-benefits-news">
        <div className="reserve-benefits-news-content"><BenefitListSkeleton /></div>
    </section></section>;
}

// 가게 소식 상세 — 페이지가 데이터 로딩 때 그리는 뼈대를 그대로 쓴다.
const BenefitDetailRouteSkeleton = () => <BenefitDetailSkeleton />;

// 가게 상세 — 페이지의 데이터 로딩과 같은 틀(PC xl·32 / 900px 미만 md 700·20)과 같은 뼈대.
// 예전엔 라우트 틀(최대 1200·여백 32/20)에 넣어 태블릿(768~899)에서 폭·여백이 실제와 달랐다(2026-09-29).
function DetailRouteSkeleton() {
    const isPC = useWindowWidth() >= STORE_DETAIL_BREAKPOINT;
    return <PageContainer size={isPC ? 'xl' : 'md'} paddingTop={isPC ? '32px' : '20px'}>
        <StoreDetailSkeleton isPC={isPC} />
    </PageContainer>;
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
            <section className="reserve-search-recent">
                <div className="reserve-search-recent-heading"><h2>최근 검색</h2></div>
                <p className="reserve-search-recent-note">이 브라우저에만 저장돼요.</p>
                <div className="reserve-search-recent-empty"><Bone width={150} height={16} /></div>
            </section>
        </div>
    </div>;
}

const KINDS = {
    search: SearchSkeleton,
    'my-page': MyPageSkeleton,
    discovery: DiscoverySkeleton,
    'store-form': StoreFormRouteSkeleton,
    // 가게 상세 페이지가 데이터 로딩 때 쓰는 것과 같은 틀·스켈레톤
    detail: DetailRouteSkeleton,
    cards: CardsSkeleton,
    'store-list': StoreListRouteSkeleton,
    waiting: WaitingRouteSkeleton,
    reservations: ReservationsSkeleton,
    benefits: BenefitsRouteSkeleton,
    'benefit-detail': BenefitDetailRouteSkeleton,
    'coming-soon': ComingSoonRouteSkeleton,
    auth: AuthRouteSkeleton,
    legal: LegalRouteSkeleton,
    guide: GuideRouteSkeleton,
    'payment-result': PaymentResultRouteSkeleton,
    admin: AdminRouteSkeleton,
    business: BusinessRouteSkeleton,
    messages: MessagesRouteSkeleton,
    // 소셜 로그인 콜백 — 문서형 틀
    document: LegalRouteSkeleton,
    // 알 수 없는 주소 — NotFound 와 같은 틀(PageStatus). 작고 오류 폴백과 공유하므로 첫 번들에 둔다.
    'not-found': PageStatusSkeleton,
};

export default function RoutePageSkeleton({ kind, pathname, search }) {
    const Skeleton = KINDS[kind];
    return <Skeleton pathname={pathname} search={search} />;
}
RoutePageSkeleton.propTypes = { kind: PropTypes.string.isRequired, pathname: PropTypes.string.isRequired, search: PropTypes.string };
