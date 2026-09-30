import PropTypes from 'prop-types';
import { Typography } from 'antd';
import Bone from '../common/Bone';
import PageContainer from '../common/PageContainer';
import AdminTableSkeletonTable from '../common/AdminTableSkeletonTable';
import { ReservationCardSkeleton, ReservationSummaryCardSkeleton } from '../common/Skeletons';
import StoreFormSkeleton from '../store/StoreFormSkeleton';
import { ListingHeader, ListingToolbarSkeleton, RefreshToolbarSkeleton } from './routeSkeletonParts';
import { normalizeRouteSkeletonPath } from './routeSkeletonKind';
import {
    BUSINESS_VERIFICATION_SKELETON_COLS,
    BUSINESS_VERIFICATION_SKELETON_HEADERS,
    BUSINESS_VERIFICATION_SKELETON_ROWS,
} from '../admin/businessVerificationSkeleton';
import { discoveryComingSoonScreen } from '../../constants/discoveryComingSoon';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { resolveViewMode } from '../../utils/viewMode';
import { breakpoints, colors, field, fontSize, fontWeight } from '../../styles/tokens';

// 2026-09-29 — 청크 로딩 뼈대가 실제 페이지와 같은 틀·여백·순서로 그려지도록 페이지별 뼈대를 모았다.
// 제목·설명·라벨처럼 서버 데이터가 아닌 고정 문구는 실제 글자로 둔다(ListingHeader 와 같은 원칙) —
// 글자 크기·줄바꿈이 실제와 같아 로딩이 끝나도 아래 내용이 밀리지 않는다. 입력칸·버튼·목록만 뼈대다.

const { Title, Text } = Typography;

/** 글자 모양 뼈대 — 문구는 투명하게 두고 줄마다 막대를 그린다. 폭에 따른 줄바꿈이 실제 문구와 같다. */
export function TextBone({ children }) {
    return <span className="reserve-skeleton-block reserve-route-skeleton-text">{children}</span>;
}
TextBone.propTypes = { children: PropTypes.node.isRequired };

/* ── 로그인·회원가입·비밀번호 찾기·소셜 약관 동의 ─────────────────────────── */

const authTitle = { marginBottom: 12, fontWeight: fontWeight.extrabold, letterSpacing: '-1.2px', color: colors.text.primary };
const authSubtitle = { display: 'block', color: colors.text.tertiary, fontSize: fontSize.lg };
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
            <Title level={2} style={authTitle}>로그인</Title>
            <Text type="secondary" style={{ ...authSubtitle, marginBottom: 48 }}>특별한 날을 위한 완벽한 예약</Text>
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
            <Title level={2} style={{ ...authTitle, textAlign: 'center' }}>회원가입</Title>
            <Text type="secondary" style={{ ...authSubtitle, marginBottom: 40, textAlign: 'center' }}>간편한 가입으로 예약을 시작하세요</Text>
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
            <Title level={2} style={authTitle}>비밀번호 찾기</Title>
            <Text type="secondary" style={{ ...authSubtitle, marginBottom: 40 }}>가입한 이메일로 인증 후 비밀번호를 재설정합니다</Text>
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
            <Title level={2} style={{ fontWeight: fontWeight.extrabold, marginBottom: 8, letterSpacing: '-1px', color: colors.text.primary }}>RESERVE 서비스 이용 동의</Title>
            <Text type="secondary" style={{ ...authSubtitle, marginBottom: 40 }}>서비스 시작을 위해 아래 약관에 동의해주세요.</Text>
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
    '/operation-guide': '운영 안내',
    '/content-sources': '콘텐츠 출처·권리 안내',
};
// 문단 줄(15px × 1.8 = 27px) — 실제 Section: 제목(h4 28 + 아래 12) → 본문, 섹션 아래 32.
const LEGAL_SECTIONS = [['a', [100, 92, 64]], ['b', [96, 88, 90, 52]], ['c', [98, 70]]];
export function LegalRouteSkeleton({ pathname = '' }) {
    const title = LEGAL_TITLES[normalizeRouteSkeletonPath(pathname)];
    return <PageContainer size="md" paddingTop="60px">
        <div style={{ marginBottom: 40 }}>
            {title
                ? <Title level={2} style={{ fontWeight: fontWeight.extrabold, color: colors.text.primary, marginBottom: 8 }}>{title}</Title>
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

/* ── 준비 중 탐색 화면(/waiting, /feed) ───────────────────────────────── */

// 실제 화면과 같은 틀(.reserve-discovery-coming-soon — 최소 높이·세로 가운데 정렬)과 같은 문구 줄바꿈을 쓴다.
export function ComingSoonRouteSkeleton({ pathname = '' }) {
    const screen = discoveryComingSoonScreen(pathname);
    return <section className="reserve-discovery-coming-soon">
        <Bone width={48} height={48} borderRadius="50%" style={{ marginBottom: 8 }} />
        <Bone width={60} height={27} borderRadius={100} />
        {screen && <>
            <h1><TextBone>{screen.heading}</TextBone></h1>
            <p><TextBone>{screen.description}</TextBone></p>
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
                <Bone width={64} height={64} borderRadius="50%" />
                <div className="reserve-payment-result__title" style={{ height: '1.3em', display: 'flex', alignItems: 'center' }}><Bone width={132} height="0.9em" /></div>
                {/* 설명 두 줄(15px × 1.65) */}
                <div className="reserve-payment-result__description" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
const BUSINESS_TAB_TEXT_WIDTHS = [81, 87, 80, 89, 80];

// AntD Tabs(reserve-pill-tabs) 자리 — 탭 한 칸은 위아래 8·좌우 18(≤768px 은 7·10) 여백 + 24px 글자 줄, 탭 사이 4.
function PanelTabsSkeleton({ widths, more = false }) {
    return <div className="reserve-route-panel-tabs">
        <div className="reserve-route-panel-tabs-list">
            {widths.map((width, index) => (
                <span key={`${width}-${index}`} className={`reserve-route-panel-tab${index === 0 ? ' is-active' : ''}`}><Bone width={width} height={14} /></span>
            ))}
        </div>
        {more && <span className="reserve-route-panel-tabs-more"><Bone width={16} height={16} /></span>}
    </div>;
}
PanelTabsSkeleton.propTypes = { widths: PropTypes.arrayOf(PropTypes.number).isRequired, more: PropTypes.bool };

export function AdminRouteSkeleton() {
    return <PageContainer size="xl" paddingTop="40px">
        <ListingHeader title="관리자 패널" description="사업자 인증 신청을 검토하고, 전체 예약 현황을 모니터링하세요." marginBottom={40} descriptionSize={fontSize.base} />
        <PanelTabsSkeleton widths={ADMIN_TAB_TEXT_WIDTHS} more />
        {/* 기본 탭(사업자 인증 대기 중)의 검색 도구줄 + 표. 다른 탭도 같은 '도구줄 → 표' 골격이다. */}
        <RefreshToolbarSkeleton search />
        <AdminTableSkeletonTable
            rows={BUSINESS_VERIFICATION_SKELETON_ROWS}
            cols={[...BUSINESS_VERIFICATION_SKELETON_COLS]}
            headers={[...BUSINESS_VERIFICATION_SKELETON_HEADERS]}
            actionBtns={3}
            stackFirstCol
        />
    </PageContainer>;
}

export function BusinessRouteSkeleton({ search = '' }) {
    const params = new URLSearchParams(search);
    const tab = params.get('tab');
    // 예약 관리 탭(기본)만 목록을 미리 그린다. 광고·통계·채팅 탭은 각자 모양이 달라 제목·탭까지만 둔다.
    const isReservations = !tab || tab === 'reservations' || tab === 'qr-checkin';
    const isCards = resolveViewMode('/business', params, 'list') === 'cards';
    return <PageContainer size="xl" paddingTop="40px">
        <ListingHeader title="사업자 파트너 패널" description="예약 현황을 실시간으로 확인하고 승인·거절하세요." marginBottom={40} descriptionSize={fontSize.base} />
        {/* 실제 Tabs 는 style={{ marginBottom: 8 }} — 탭+내용 묶음 아래 8px */}
        <div style={{ marginBottom: 8 }}>
            <PanelTabsSkeleton widths={BUSINESS_TAB_TEXT_WIDTHS} />
            {isReservations && <>
                <ListingToolbarSkeleton />
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

/* ── 가게 등록·수정 — 뼈대가 실제 폼과 같은 PageContainer 를 직접 그린다(StoreFormSkeleton). ── */
export function StoreFormRouteSkeleton({ pathname = '' }) {
    return <StoreFormSkeleton mode={normalizeRouteSkeletonPath(pathname).endsWith('/edit') ? 'edit' : 'create'} />;
}
StoreFormRouteSkeleton.propTypes = { pathname: PropTypes.string };
