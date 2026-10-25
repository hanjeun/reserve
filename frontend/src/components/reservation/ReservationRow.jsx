import React from 'react';
import { Typography } from 'antd';
import Tooltip from '../common/Tooltip';
import { FileTextOutlined, NumberOutlined, UserOutlined, TeamOutlined, CalendarOutlined, ClockCircleOutlined } from '../common/icons';
import ReservationStatusBadge from './ReservationStatusBadge';
import { formatCurrency, formatTime, getThumbnailUrl } from '../../utils';
import { colors, radius, fontSize, fontWeight } from '../../styles/tokens';
import { useWindowWidth } from '../../hooks';
import LoadingImage from '../common/LoadingImage';

const { Text } = Typography;

/**
 * 사업자 예약 관리와 내 예약이 공유하는 행이다.
 * 썸네일 옆의 세 줄은 독립적인 좌우 정렬을 사용해 액션 폭이 제목·예약번호 폭까지 줄이지 않게 한다.
 * 폭이 부족한 값은 상세에서 확인하며 대응 스켈레톤도 같은 줄 구조와 간격을 유지한다.
 */
const ReservationRow = ({ reservation, onOpenDetail, renderActions, extraNote, showMemberInfo = false }) => {
    const isWide = useWindowWidth() >= 576;
    const {
        storeName, storeMainImageUrl, depositAmount, depositPaid, status, specialRequest,
        reservationCode, reservationDate, reservationTime, memberName, guestCount,
        allowLatePayment, paymentTimeoutMinutes,
    } = reservation;

    // 예약금이 있는데 아직 결제되지 않은 승인 대기 건.
    const unpaid = depositAmount > 0 && !depositPaid && status === 'PENDING';
    // 나중 결제를 허용하지 않고 양수 제한 시간이 있는 미결제 대기 예약만 자동 취소 대상이다.
    // "시각"이 아니라 "분"으로 적는다 — 서버 컨테이너에 TZ 설정이 없어 createdAt이 UTC로 내려올 수 있다.
    const timeout = paymentTimeoutMinutes ?? 30;
    const timeoutNote = unpaid && !allowLatePayment && timeout > 0
        ? `${timeout}분 내 결제`
        : null;

    const actionsNode = renderActions ? renderActions(isWide) : null;
    const hasActions = actionsNode != null && (!Array.isArray(actionsNode) || actionsNode.length > 0);

    // 상세 진입은 가게명 버튼의 행 전체 오버레이로 공유하고 독립 액션은 그 위에 둔다.

    return (
        <div className="reserve-tap-card" style={styles.row} data-list-item-id={`reservation:${reservation.id}`}>
            <div style={styles.mainRow}>
                <div style={isWide ? styles.imgWrapWide : styles.imgWrap}>
                    <LoadingImage src={getThumbnailUrl(storeMainImageUrl)} alt="" style={styles.img} />
                </div>

                <div style={styles.lines}>
                    {/* 줄1 — 가게명 | 상태 */}
                    <div style={isWide ? styles.line1Wide : styles.line1}>
                        <button
                            type="button"
                            className="reserve-tap-card__trigger"
                            style={styles.nameBtn}
                            onClick={onOpenDetail}
                            aria-label={`${storeName} 예약 상세 보기`}
                        >
                            <Text strong style={isWide ? styles.storeNameWide : styles.storeName}>
                                {storeName}
                            </Text>
                            {specialRequest && (
                                <Tooltip title="요청사항 있음 — 눌러서 확인">
                                    <FileTextOutlined style={styles.requestIcon} />
                                </Tooltip>
                            )}
                        </button>
                        <ReservationStatusBadge status={status} unpaid={unpaid} />
                    </div>

                    {/* 줄2 — 예약번호 | (결제 기한) 금액 */}
                    <div style={styles.line2}>
                        <div style={styles.metaLine}>
                            {isWide && <NumberOutlined style={styles.metaIcon} />}
                            <span style={styles.ellipsis}>{reservationCode || '눌러서 상세 보기'}</span>
                        </div>
                        <span style={styles.priceGroup}>
                            {timeoutNote && <Text style={styles.timeout}>({timeoutNote})</Text>}
                            <Text strong style={styles.price}>{formatCurrency(depositAmount)}</Text>
                        </span>
                    </div>

                    {/*
                     * 날짜·시간을 중간 overflow 래퍼 없이 배치해 말줄임을 텍스트에 적용한다.
                     */}
                    <div style={styles.line3}>
                        <div style={styles.metaLine}>
                            {showMemberInfo && isWide && (
                                <>
                                    <UserOutlined style={styles.metaIcon} />
                                    <span style={styles.ellipsis}>{memberName}</span>
                                    <span style={styles.dot}>·</span>
                                    <TeamOutlined style={styles.metaIcon} />
                                    <span style={styles.fixedText}>{guestCount}명</span>
                                    <span style={styles.dot}>·</span>
                                </>
                            )}
                            {isWide && <CalendarOutlined style={styles.metaIcon} />}
                            {/* 날짜가 먼저 줄어들고(shrink 1), 시간은 끝까지 유지된다(shrink 0) */}
                            <span style={styles.ellipsis}>{reservationDate}</span>
                            <span style={styles.dot}>·</span>
                            {isWide && <ClockCircleOutlined style={styles.metaIcon} />}
                            <span style={styles.fixedText}>{formatTime(reservationTime)}</span>
                        </div>
                        {hasActions && (
                            // 상태 변경 도구를 눌러 상세까지 열리지 않게 한다.

                            // 실행 도구 영역은 interactions.css의 예약 행 규칙을 따른다.
                            <div
                                className="reserve-reservation-actions"
                                style={isWide ? styles.actionGroupWide : styles.actionGroup}
                            >
                                {actionsNode}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 거절 사유 등 부가 문구 — 항상 맨 아래 오른쪽 정렬 */}
            {extraNote && <div style={styles.noteRow}>{extraNote}</div>}
        </div>
    );
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
    row:     { display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 0', cursor: 'pointer' },
    mainRow: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'nowrap' },
    // 썸네일은 <button>이 아니라 <div>다 — 가게명 버튼의 오버레이가 이 자리까지 덮으므로
    // 여기에 또 버튼을 두면 같은 동작의 접근성 노드가 둘이 된다(alt=""로 이미지도 장식 처리).
    imgWrap:      { width: 56, height: 56, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 },
    imgWrapWide:  { width: 72, height: 72, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 },
    img:          { width: '100%', height: '100%', objectFit: 'cover' },

    // 3줄 스택 — 남는 폭을 전부 차지하고, 각 줄이 그 안에서 독립적으로 좌우를 나눈다
    lines: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },

    // 줄 높이 고정
    // AntD Typography의 기본 line-height는 1.5714다. 그대로 두면 세 줄 합이 77.6px이 되어
    // 카드가 113.6px로 커지고, 썸네일(56px)보다 한참 크며 스켈레톤(92px)과 어긋난다.
    // 줄 높이를 스켈레톤 Bone과 같은 값으로 고정하고 텍스트 line-height도 같이 눌러
    // 카드를 92px(PC 108px)로 맞춘다 — 정보량 대비 촘촘한 쪽이 보기 좋다.
    // 줄 높이 = 폰트 크기 × 1.2. 조밀한 목록형 UI의 관례값이다(본문은 1.4~1.5, 여기선 과하다 —
    // AntD 기본 1.5714를 그대로 쓰면 카드가 113.6px까지 부풀어 썸네일 56px과 균형이 깨진다).
    // 15px→18, 13px→16(15.6 올림), PC 가게명 16px→20.
    // 결과 카드 높이: 모바일 98px / PC 108px(PC는 썸네일 72가 지배).
    // Skeletons.jsx의 line1/line2/line3와 같은 값이어야 로딩 전후 카드 높이가 같다.
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
    priceGroup: { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 },
    price:      { fontSize: fontSize.base, lineHeight: 1, color: colors.text.primary, whiteSpace: 'nowrap' },
    timeout:    { fontSize: fontSize.xs, lineHeight: 1, color: colors.warning.main, whiteSpace: 'nowrap' },
    // 액션을 한 줄로 유지해 카드 높이를 일정하게 한다.

    // 좁은 화면에서도 날짜·시간과 실행 도구가 겹치지 않을 간격을 둔다.

    actionGroup: { display: 'flex', gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end', flexShrink: 0 },
    // PC는 폭 제약이 전혀 없다 — 3줄 영역 1080px 중 버튼그룹이 198px뿐이라 874px이 남는다.
    // 모바일 때문에 좁힌 gap 6을 PC까지 끌고 갈 이유가 없어서 여기서만 넉넉하게 준다.
    actionGroupWide: { display: 'flex', gap: 14, flexWrap: 'nowrap', justifyContent: 'flex-end', flexShrink: 0 },

    noteRow: { display: 'flex', justifyContent: 'flex-end' },
};

export default ReservationRow;
