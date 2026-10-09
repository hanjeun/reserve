import PropTypes from 'prop-types';
import Bone from '../common/Bone';
import FilterToolbarSkeleton from '../common/FilterToolbarSkeleton';
import AdminTableSkeletonTable from '../common/AdminTableSkeletonTable';
import StatCard from '../common/StatCard';
import ChartCard from '../common/ChartCard';
import { ReservationSummaryCardSkeleton } from '../common/Skeletons';
import ChatIntroEditorSkeleton from '../chat/ChatIntroEditorSkeleton';
import { ListingToolbarSkeleton, SegmentedControlSkeleton } from './routeSkeletonParts';
import { reservationSkeletonFilters } from './reservationSkeletonFilters';
import { colors, radius } from '../../styles/tokens';
import { RESERVATION_STATUS_FILTER_OPTIONS, RESERVATION_SORT_OPTIONS } from '../../constants';
import {
    BUSINESS_VERIFICATION_SKELETON_COLS,
    BUSINESS_VERIFICATION_SKELETON_HEADERS,
    BUSINESS_VERIFICATION_SKELETON_ROWS,
} from '../admin/businessVerificationSkeleton';

const SEARCH = { value: '' };
const TABLES = {
    members: { headers: ['ID', '이름', '이메일', '권한', '로그인', '상태', '처리'], cols: [60, 100, 220, 90, 90, 90, 230], actionBtns: 2, search: true },
    'stores-admin': { headers: ['ID', '가게명', '카테고리', '주소', '평점', '상태', '처리'], cols: [60, 180, 100, 200, 140, 90, 230], actionBtns: 2, search: true },
    'audit-logs': { headers: ['일시', '행위', '대상', '로그 내용', '처리자'], cols: [155, 115, 120, null, 200], filterWidth: 140, notice: true },
    trash: { headers: ['유형', 'ID', '핵심 정보', '삭제한 관리자', '삭제일', '잔여', '처리'], cols: [80, 55, null, 190, 100, 60, 90], actionBtns: 1, filterWidth: 140, notice: true },
    reports: { headers: ['신고', '가게', '신고자', '사유', '대상', '설명', '상태', '접수 시각', '처리'], cols: [78, 160, 90, 120, 110, 260, 100, 180, 260], actionBtns: 3, rows: 4, filterWidth: 132 },
    ads: { headers: ['가게', '유형', '기간', '금액', '상태', '처리'], cols: [220, 90, 190, 100, 160, 110], actionBtns: 1, search: true },
    reservations: { headers: ['가게', '예약자', '날짜', '시간', '인원', '예약금', '상태', '처리'], cols: [130, 100, 110, 80, 60, 90, 90, 80], actionBtns: 1 },
};

function NoticeSkeleton() {
    return <div aria-hidden="true" style={{ background: colors.gray[50], border: `1px solid ${colors.border.light}`, borderRadius: radius.md, padding: '10px 16px', marginBottom: 16 }}>
        <Bone width="min(560px, 90%)" height={20} />
    </div>;
}

function TableTabSkeleton({ tab }) {
    const spec = TABLES[tab];
    if (!spec) return null;
    return <>
        <FilterToolbarSkeleton count={0} search={spec.search ? SEARCH : undefined}
            selects={spec.filterWidth ? [{ key: 'filter', value: '', options: [], width: spec.filterWidth }] : []} />
        {spec.notice && <NoticeSkeleton />}
        <AdminTableSkeletonTable headers={spec.headers} cols={spec.cols} rows={spec.rows ?? 8} actionBtns={spec.actionBtns ?? 0} />
    </>;
}
TableTabSkeleton.propTypes = { tab: PropTypes.string.isRequired };

function MailboxTabSkeleton() {
    return <>
        <div style={{ marginBottom: 12 }} aria-hidden="true">
            <Bone width={112} height={40} borderRadius={20} style={{ marginBottom: 10 }} />
            <FilterToolbarSkeleton search={SEARCH} style={{ marginBottom: 0 }} />
        </div>
        <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper }} aria-hidden="true">
            {['first', 'second', 'third', 'fourth'].map(key => <div key={key} style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border.light}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><Bone width="45%" height={13} /><Bone width={44} height={11} /></div>
                <Bone width="65%" height={13} style={{ marginTop: 6 }} /><Bone width="80%" height={11} style={{ marginTop: 6 }} />
            </div>)}
        </div>
    </>;
}

function ChartBodySkeleton({ donut = false, dashboard = false, heights = [60, 100, 75, 130, 95, 150] }) {
    if (donut) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 180, height: 180 }}>
            <Bone width={180} height={180} borderRadius="50%" />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 110, height: 110, borderRadius: '50%', background: colors.background.paper }} />
        </div>
    </div>;
    return <div style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: dashboard ? 24 : 16, paddingBottom: dashboard ? 24 : 20 }}>
        {heights.map(height => <Bone key={height} width={dashboard ? 36 : 28} height={height} borderRadius={6} />)}
    </div>;
}
ChartBodySkeleton.propTypes = { donut: PropTypes.bool, dashboard: PropTypes.bool, heights: PropTypes.arrayOf(PropTypes.number) };

function MetricsSkeleton() {
    return <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {['first', 'second', 'third'].map(key => <div key={key} style={{ flex: '1 1 120px' }}><Bone width={64} height={13} style={{ marginBottom: 8 }} /><Bone width={40} height={26} /></div>)}
    </div>;
}

const STATISTICS_RANGES = [{ value: '7d', label: '7일' }, { value: '30d', label: '30일' }, { value: '90d', label: '90일' }];
export function StatisticsRouteSkeleton({ dashboard = false, search = '' }) {
    const requestedRange = new URLSearchParams(search).get('statisticsRange');
    const range = STATISTICS_RANGES.some(option => option.value === requestedRange) ? requestedRange : '30d';
    const labels = dashboard ? ['사업자 신청', '전체 예약', '휴지통', '감사 로그'] : ['평균 별점', '리뷰 수', '예약금 순결제액', '광고 노출'];
    const charts = dashboard ? ['예약 상태 분포', '최근 50개 휴지통 유형'] : ['예약 추이', '상태별 분포', '예약금 순결제액 추이'];
    return <div className={dashboard ? undefined : 'reserve-statistics-tab'} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <FilterToolbarSkeleton style={{ marginBottom: 0 }}
            selects={dashboard ? [] : [{ key: 'store', value: '', options: [], width: 148, mobileWidth: 112 }]}
            extra={dashboard ? undefined : <SegmentedControlSkeleton options={STATISTICS_RANGES} value={range} />}
            extraSkeleton={dashboard ? undefined : <SegmentedControlSkeleton options={STATISTICS_RANGES} value={range} />} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            {labels.map(label => <StatCard key={label} icon={<Bone width={20} height={20} />} label={label} value={0} loading />)}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {charts.map((title, index) => <ChartCard key={title} title={title} height={dashboard ? 240 : 260}
                minWidth={dashboard ? undefined : index === 1 ? 280 : 340}>
                <ChartBodySkeleton donut={dashboard ? index === 0 : index === 1} dashboard={dashboard}
                    heights={dashboard ? [70, 110, 55, 90] : index === 2 ? [90, 60, 120, 80, 140, 100] : undefined} />
            </ChartCard>)}
        </div>
        <ChartCard title={dashboard ? '최근 감사 로그 요약' : '광고 성과'} height="auto"><MetricsSkeleton /></ChartCard>
    </div>;
}
StatisticsRouteSkeleton.propTypes = { dashboard: PropTypes.bool, search: PropTypes.string };

export function ChatIntroRouteSkeleton({ business = false }) {
    return <div className="reserve-chat-intro-tab">
        <FilterToolbarSkeleton
            selects={business ? [{ key: 'store', value: '', options: [], width: 200 }] : []} />
        <ChatIntroEditorSkeleton />
    </div>;
}
ChatIntroRouteSkeleton.propTypes = { business: PropTypes.bool };

export function AdsRouteSkeleton() {
    return <div className="reserve-ad-manage-tab">
        <div className="reserve-ad-manage-heading" style={{ color: colors.text.secondary, fontSize: 13 }}>
            노출형(1,000원/일)은 가게 목록 상단에 카드·리스트로 우선 노출되고 작은 &quot;광고&quot; 표기가 붙어요. 배너형(5,000원/일)은 화면 우측 하단에 표시돼요.
        </div>
        <div className="reserve-ad-manage-primary-row" aria-hidden="true">
            <Bone width={112} height={36} />
            <div className="reserve-ad-manage-store-summary"><Bone width={90} height={16} /><Bone width={40} height={14} /></div>
        </div>
        <FilterToolbarSkeleton search={SEARCH} />
        <AdminTableSkeletonTable rows={8} headers={TABLES.ads.headers} cols={[220, 90, 190, 100, 100, 220]} actionBtns={2} />
    </div>;
}

function PaymentOperationsRouteSkeleton() {
    return <div>
        <div style={{ maxWidth: 560, marginBottom: 16 }}><SegmentedControlSkeleton block value="ready" options={[
            { value: 'ready', label: '오래된 READY' }, { value: 'issues', label: '수동 대사' },
            { value: 'webhooks', label: '웹훅 inbox' }, { value: 'ads', label: '광고 결제' },
        ]} /></div>
        <NoticeSkeleton />
        <FilterToolbarSkeleton count={0}
            selects={[{ key: 'age', value: '', options: [], width: 76 }]} />
        <AdminTableSkeletonTable rows={6} headers={['결제 ID', '주문번호', '예약', '예약 상태', '금액', '생성일', '처리']}
            cols={[90, 232, 80, 110, 110, 145, 110]} actionBtns={1} />
    </div>;
}

export default function AdminTabRouteSkeleton({ tab, search = '' }) {
    const params = new URLSearchParams(search);
    if (tab === 'pending' || tab === 'all') return <>
        <FilterToolbarSkeleton search={SEARCH} count={0} />
        <AdminTableSkeletonTable rows={BUSINESS_VERIFICATION_SKELETON_ROWS}
            cols={[...BUSINESS_VERIFICATION_SKELETON_COLS]} headers={[...BUSINESS_VERIFICATION_SKELETON_HEADERS]} actionBtns={3} stackFirstCol />
    </>;
    if (tab === 'mailbox') return <MailboxTabSkeleton />;
    if (tab === 'chat-intro') return <ChatIntroRouteSkeleton />;
    if (tab === 'dashboard') return <StatisticsRouteSkeleton dashboard />;
    if (tab === 'payments') return <PaymentOperationsRouteSkeleton />;
    if (tab === 'reservations') return <>
        <ListingToolbarSkeleton filters={reservationSkeletonFilters({
            status: RESERVATION_STATUS_FILTER_OPTIONS.some(option => option.value === params.get('status')) ? params.get('status') : 'ALL',
            sort: RESERVATION_SORT_OPTIONS.some(option => option.value === params.get('sort')) ? params.get('sort') : 'recent',
        })} />
        <FilterToolbarSkeleton search={SEARCH} />
        {params.get('view') === 'cards'
            ? <ReservationSummaryCardSkeleton count={4} />
            : <AdminTableSkeletonTable rows={8} headers={TABLES.reservations.headers} cols={TABLES.reservations.cols} actionBtns={1} />}
    </>;
    return <TableTabSkeleton tab={tab} />;
}
AdminTabRouteSkeleton.propTypes = { tab: PropTypes.string.isRequired, search: PropTypes.string };
