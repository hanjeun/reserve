import React from 'react';
import { Typography } from 'antd';
import Tooltip from '../common/Tooltip';
import { FileTextOutlined, NumberOutlined, UserOutlined, TeamOutlined, CalendarOutlined, ClockCircleOutlined } from '../common/icons';
import ReservationStatusBadge from './ReservationStatusBadge';
import PaymentCountdown from './PaymentCountdown';
import useReservationPaymentState from '../../hooks/useReservationPaymentState';
import { filterReservationActions, reservationActionNotice } from './reservationActions';
import { formatCurrency, formatTime, getThumbnailUrl } from '../../utils';
import { colors, fontSize, fontWeight } from '../../styles/tokens';
import { useWindowWidth } from '../../hooks';
import LoadingImage from '../common/LoadingImage';

const { Text } = Typography;

/**
 * 사업자 예약 관리와 내 예약이 공유하는 행이다.
 * 썸네일 옆의 세 줄은 독립적인 좌우 정렬을 사용해 액션 폭이 제목·예약번호 폭까지 줄이지 않게 한다.
 * 폭이 부족한 값은 상세에서 확인하며 대응 스켈레톤도 같은 줄 구조와 간격을 유지한다.
 */
export function ReservationRowLayout({
    itemKey, storeName, imageUrl, onOpenDetail, detailLabel, isWide,
    titleAccessory, statusLabel, reference, summary, metadata, tools, extraNote,
}) {
    return (
        <div className="reserve-tap-card reserve-reservation-row" style={styles.row} data-list-item-id={itemKey}>
            <div className="reserve-reservation-row__action-guard" aria-hidden="true" />
            <div style={styles.mainRow}>
                <div className="reserve-store-list-row-image reserve-reservation-row-image">
                    <LoadingImage src={getThumbnailUrl(imageUrl)} alt="" />
                </div>
                <div style={styles.lines}>
                    <div style={isWide ? styles.line1Wide : styles.line1}>
                        <button type="button" className="reserve-tap-card__trigger" style={styles.nameBtn}
                            onClick={onOpenDetail} aria-label={detailLabel}>
                            <Text strong style={isWide ? styles.storeNameWide : styles.storeName}>{storeName}</Text>
                            {titleAccessory}
                        </button>
                        {statusLabel}
                    </div>
                    <div style={styles.line2}>
                        <div style={styles.metaLine}>
                            {isWide && <NumberOutlined style={styles.metaIcon} />}
                            <span style={styles.ellipsis}>{reference}</span>
                        </div>
                        {summary}
                    </div>
                    <div style={styles.line3}>
                        <div style={styles.metaLine}>{metadata}</div>
                        {tools && (
                            <div className="reserve-reservation-actions reserve-list-row-actions"
                                onClick={event => event.stopPropagation()}>
                                {tools}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {extraNote && <div style={styles.noteRow}>{extraNote}</div>}
        </div>
    );
}

const ReservationRow = ({ reservation, onOpenDetail, renderActions, extraNote, showMemberInfo = false }) => {
    const isWide = useWindowWidth() >= 576;
    const {
        storeName, storeMainImageUrl, depositAmount, depositPaid, status, specialRequest,
        reservationCode, reservationDate, reservationTime, memberName, guestCount,
    } = reservation;
    const unpaid = depositAmount > 0 && !depositPaid && status === 'PENDING';
    const paymentState = useReservationPaymentState(reservation);
    const actions = filterReservationActions(renderActions?.(isWide), paymentState.expired);
    const hasActions = actions != null && (!Array.isArray(actions) || actions.length > 0);
    const notice = reservationActionNotice(reservation, paymentState.expired, hasActions);
    return <ReservationRowLayout itemKey={'reservation:' + reservation.id} storeName={storeName} imageUrl={storeMainImageUrl}
        onOpenDetail={onOpenDetail} detailLabel={storeName + ' 예약 상세 보기'} isWide={isWide}
        titleAccessory={specialRequest && <Tooltip title="요청사항 있음 — 눌러서 확인"><FileTextOutlined style={styles.requestIcon} /></Tooltip>}
        statusLabel={<ReservationStatusBadge status={status} unpaid={unpaid} />}
        reference={reservationCode || '눌러서 상세 보기'}
        summary={<span style={styles.priceGroup}>
            <PaymentCountdown reservation={reservation} state={paymentState} style={styles.timeout} />
            <Text strong style={styles.price}>{formatCurrency(depositAmount)}</Text>
        </span>}
        metadata={<>
            {showMemberInfo && isWide && <>
                <UserOutlined style={styles.metaIcon} />
                <span style={styles.ellipsis}>{reservation.personalInfoHidden ? '조회 기간 만료' : memberName}</span>
                <span style={styles.dot}>·</span>
                <TeamOutlined style={styles.metaIcon} />
                <span style={styles.fixedText}>{guestCount}명</span>
                <span style={styles.dot}>·</span>
            </>}
            {isWide && <CalendarOutlined style={styles.metaIcon} />}
            <span style={styles.ellipsis}>{reservationDate}</span>
            <span style={styles.dot}>·</span>
            {isWide && <ClockCircleOutlined style={styles.metaIcon} />}
            <span style={styles.fixedText}>{formatTime(reservationTime)}</span>
        </>}
        tools={(hasActions || notice) ? <>
            {notice && <span role="status" className="reserve-reservation-action-notice"><ClockCircleOutlined aria-hidden="true" />{notice}</span>}
            {actions}
        </> : null}
        extraNote={extraNote} />;
};

// 가게명은 기본 button으로 키보드·보조기술 동작을 제공한다.

// 실제 버튼의 기본 배경·여백을 초기화해 행의 기존 배치를 유지한다.
const btnReset = { background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left' };

// 왼쪽 요소 공통 — flex item이 내용보다 작아지려면 minWidth:0이 필요하고,
// 그래야 textOverflow:ellipsis가 실제로 동작한다.
const shrinkable = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

const styles = {
    // 카드 전체가 상세로 가는 클릭 영역이다(액션 버튼 영역만 제외).
    // position/user-select/탭 하이라이트는 .reserve-tap-card(interactions.css)가 담당한다 —
    // 오버레이 기준점과 선택 방지는 한 곳에서만 정의해야 카드마다 어긋나지 않는다.
    row:     { display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' },
    mainRow: { display: 'flex', alignItems: 'center', gap: 'var(--reserve-store-list-column-gap)', flexWrap: 'nowrap' },

    // 3줄 스택 — 남는 폭을 전부 차지하고, 각 줄이 그 안에서 독립적으로 좌우를 나눈다
    lines: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },

    // 골격과 본문의 줄 높이를 맞춰 교체할 때 위치가 변하지 않게 한다.
    line1:     { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, height: 18 },
    line1Wide: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, height: 20 },
    line2:     { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, height: 18 },
    line3:     { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, height: 16 },

    // 주의: overflow:hidden 을 주면 안 된다 — 카드 전체를 덮는 ::after 오버레이가 버튼 상자 안으로
    //    잘려서 가게명 위만 클릭 영역이 된다. 말줄임은 어차피 안쪽 storeName이 담당하고,
    //    flex 컨테이너에는 text-overflow가 적용되지도 않는다.
    nameBtn:       { ...btnReset, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
    storeName:     { fontSize: fontSize.base, lineHeight: 1, color: colors.text.primary, ...shrinkable },
    storeNameWide: { fontSize: fontSize.lg, lineHeight: 1, color: colors.text.primary, fontWeight: fontWeight.semibold, ...shrinkable },
    // 오버레이(::after) 위로 올린다 — 안 올리면 Tooltip이 hover를 못 받는다.
    // 클릭은 부모 <button>으로 버블링되므로 눌러도 상세가 열리는 동작은 그대로다.
    requestIcon:   { fontSize: 12, color: colors.text.tertiary, flexShrink: 0, position: 'relative', zIndex: 1 },

    // 말줄임은 flex 컨테이너가 아닌 내부 블록 요소에 적용한다.

    metaLine: { flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: fontSize.sm, lineHeight: 1, color: colors.text.secondary, overflow: 'hidden' },
    metaIcon: { fontSize: 12, color: colors.text.tertiary, flexShrink: 0 },
    dot:      { color: colors.text.tertiary, fontSize: fontSize.xs, flexShrink: 0 },
    // 폭이 모자라면 이 요소가 줄어들며 …이 붙는다(날짜·예약번호·예약자명)
    ellipsis:  { display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    // 시간·인원은 짧고 정보 가치가 높아 끝까지 유지한다
    fixedText: { flexShrink: 0, whiteSpace: 'nowrap' },

    // 오른쪽 요소들 — 절대 줄어들지 않는다(줄어드는 건 왼쪽뿐)
    priceGroup: { display: 'inline-flex', alignItems: 'baseline', gap: 6, flexShrink: 0 },
    price:      { fontSize: fontSize.base, lineHeight: 1, color: colors.text.primary, whiteSpace: 'nowrap' },
    timeout:    { fontSize: fontSize.xs, lineHeight: 1, whiteSpace: 'nowrap' },
    noteRow: { display: 'flex', justifyContent: 'flex-end' },
};

export default ReservationRow;
