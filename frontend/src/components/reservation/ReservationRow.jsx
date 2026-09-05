import React from 'react';
import { Typography, Tooltip } from 'antd';
import { FileTextOutlined, NumberOutlined, UserOutlined, TeamOutlined, CalendarOutlined, ClockCircleOutlined } from '@ant-design/icons';
import ReservationStatusBadge from './ReservationStatusBadge';
import { formatCurrency, formatTime, getThumbnailUrl } from '../../utils';
import { colors, radius, fontSize, fontWeight } from '../../styles/tokens';
import { useWindowWidth } from '../../hooks';

const { Text } = Typography;

/**
 * 예약 한 줄(행) 공용 셸. 사업자 패널(예약 관리 탭)과 손님(내 예약)이 공유한다.
 *
 * ── 2026-07-30 구조 변경: 3열 → "썸네일 + 3줄 독립 정렬" ──────────────────────
 * 예전 구조는 [썸네일][정보 3줄][상태·가격·버튼 3줄]의 3열이었다. 이러면 정보 쪽 세 줄이
 * **하나의 폭을 공유**하기 때문에, 버튼이 4개가 되는 미결제 예약에서 오른쪽 열이 넓어지면
 * 그 압력이 세 줄 전부에 걸려 가게 이름과 예약번호까지 같이 잘렸다("RESERVE" → "RES…").
 *
 * 지금은 각 줄이 자기만의 flex row라서 줄마다 좌우 폭을 독립적으로 나눈다:
 *
 *   [썸네일] [ 가게명 ......................... 승인 대기 (미결제) ]
 *            [ 예약번호 ................ (10분 내 결제) 10,000원 ]
 *            [ 날짜 · 시간 (…) ............. 결제하기 변경 취소 ]
 *
 * 1·2줄은 짧은 오른쪽 요소(상태 라벨·금액)만 피하면 되니 이름과 예약번호가 온전히 보이고,
 * 폭이 모자랄 때 줄어드는 건 3줄의 날짜·시간뿐이다. 결제가 끝나 버튼이 줄면 저절로 다시 펴진다.
 * 잘린 값은 카드를 눌러 상세에서 확인할 수 있다.
 *
 * 스켈레톤(Skeletons.jsx의 ReservationRowSkeletonItem)도 같은 3줄 구조여야 로딩 전후가 안 튄다.
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
    // 나중 결제를 허용하지 않은 가게는 이 시간이 지나면 ReservationExpiryScheduler가 자동 취소한다.
    // "시각"이 아니라 "분"으로 적는다 — 서버 컨테이너에 TZ 설정이 없어 createdAt이 UTC로 내려올 수 있다.
    const timeoutNote = unpaid && !allowLatePayment
        ? `${paymentTimeoutMinutes || 30}분 내 결제`
        : null;

    const actionsNode = renderActions ? renderActions(isWide) : null;
    const hasActions = actionsNode != null && (!Array.isArray(actionsNode) || actionsNode.length > 0);

    // 카드 전체가 상세로 가는 클릭 영역이다 — 가격이든 상태 라벨이든 빈 공간이든 어디를 눌러도 열린다.
    // 액션 버튼 영역만 stopPropagation으로 제외한다(눌렀는데 상세가 같이 열리면 안 된다).
    // 키보드·스크린리더 경로는 안쪽 썸네일/가게명 <button> 두 개가 담당하므로 이 div에는
    // role/tabIndex를 주지 않는다 — 주면 같은 동작의 접근성 노드가 셋이 되어 중복이 된다.
    return (
        <div role="presentation" style={styles.row} onClick={onOpenDetail}>
            <div style={styles.mainRow}>
                <button
                    type="button"
                    style={isWide ? styles.imgWrapWide : styles.imgWrap}
                    onClick={onOpenDetail}
                    aria-label={`${storeName} 예약 상세 보기`}
                >
                    <img src={getThumbnailUrl(storeMainImageUrl)} alt={storeName} style={styles.img} />
                </button>

                <div style={styles.lines}>
                    {/* 줄1 — 가게명 | 상태 */}
                    <div style={isWide ? styles.line1Wide : styles.line1}>
                        <button
                            type="button"
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

                    {/* 줄3 — 날짜·시간(공간이 모자라면 여기만 말줄임) | 액션 버튼.
                        래퍼를 두지 않고 평평하게 나열한다 — 중간에 inline-flex 래퍼가 끼면
                        그 래퍼의 overflow:hidden이 안쪽 텍스트가 줄어들기 전에 잘라버려서
                        말줄임표 없이 "2026-07-31"이 "2."로 뭉개진다. */}
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
                            // 버튼 영역만 카드 클릭에서 제외한다 — 승인/취소를 눌렀는데
                            // 상세 모달까지 같이 열리면 안 된다.
                            // <button>으로 감싸면 버튼 중첩(무효 HTML)이 되므로 div + role="presentation".
                            // 안쪽 실제 버튼들이 접근성 노드를 갖고 있어 이 래퍼는 순수 통과용이다.
                            <div
                                role="presentation"
                                className="reserve-reservation-actions"
                                style={isWide ? styles.actionGroupWide : styles.actionGroup}
                                onClick={(e) => e.stopPropagation()}
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

// 썸네일·가게명은 <div role="button">이 아니라 네이티브 <button>으로 렌더한다 —
// 키보드(Tab/Enter/Space)와 스크린리더 지원을 브라우저에 맡기기 위해서다(SonarCloud a11y).
// 대신 버튼 기본 외형(배경·테두리·패딩·폰트·가운데정렬)을 지워 예전 div 시절 모양을 유지한다.
const btnReset = { background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left' };

// 왼쪽 요소 공통 — flex item이 내용보다 작아지려면 minWidth:0이 필요하고,
// 그래야 textOverflow:ellipsis가 실제로 동작한다.
const shrinkable = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

const styles = {
    // 카드 전체가 상세로 가는 클릭 영역이다(액션 버튼 영역만 제외).
    row:     { display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 0', cursor: 'pointer' },
    mainRow: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'nowrap' },
    imgWrap:      { ...btnReset, width: 56, height: 56, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0, cursor: 'pointer' },
    imgWrapWide:  { ...btnReset, width: 72, height: 72, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0, cursor: 'pointer' },
    img:          { width: '100%', height: '100%', objectFit: 'cover' },

    // 3줄 스택 — 남는 폭을 전부 차지하고, 각 줄이 그 안에서 독립적으로 좌우를 나눈다
    lines: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },

    // ── 줄 높이 고정 ────────────────────────────────────────────────────────────
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

    nameBtn:       { ...btnReset, ...shrinkable, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
    storeName:     { fontSize: fontSize.base, lineHeight: 1, color: colors.text.primary, ...shrinkable },
    storeNameWide: { fontSize: fontSize.lg, lineHeight: 1, color: colors.text.primary, fontWeight: fontWeight.semibold, ...shrinkable },
    requestIcon:   { fontSize: 12, color: colors.text.tertiary, flexShrink: 0 },

    // 예약번호 줄 / 날짜·시간 줄 — 아이콘과 텍스트를 한 겹에 평평하게 나열한다.
    // ⚠️ text-overflow는 flex 컨테이너에 적용되지 않는다. 텍스트를 inline-flex 래퍼로 한 번 더 감싸면
    //    그 래퍼의 overflow:hidden이 먼저 잘라서 말줄임표가 사라진다("2026-07-31" → "2." 로 뭉개짐).
    //    말줄임을 걸 대상은 flex item이면서 block인 요소여야 한다 → 아래 ellipsis.
    // 2026-07-30: <button>이 아니라 <div>다. 카드 전체가 클릭 영역이 되면서 이 줄들이
    // 따로 버튼일 이유가 없어졌고, 버튼이면 안쪽 액션 버튼과 중첩될 위험도 있었다.
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
    // 항상 한 줄(nowrap) — wrap을 허용하면 버튼 4개일 때 줄이 늘어나 카드 높이가 들쭉날쭉해진다.
    //
    // ── gap 6의 근거 (2026-07-30 브라우저 실측, 13px 폰트) ────────────────────────
    // 미결제 대기 예약의 버튼 3개(결제하기·변경·취소)가 최대 폭이다. 아이콘을 숨긴 모바일 기준
    // 버튼 실폭은 45 + 22.5 + 22.5 = 90px 안팎이다.
    //
    //   390px 화면: 카드 342(뷰포트-좌우패딩 24×2) - 썸네일56 - 갭16 = 3줄 영역 270
    //               버튼그룹 약90 + gap6×2 = 102  →  날짜 몫 약160
    //               "2026-07-31 · 14:00" 필요량 = 70.5+4+3.3+4+32.6 = 114.4  → 22px 여유
    //   375px(iPhone SE): 여유 7px — 아슬아슬하게 들어간다
    //   360px(구형 안드로이드): 8px 부족 — 날짜 끝이 …로 잘린다
    //
    // gap을 1 키울 때마다 3px(갭 3개)씩 날짜 몫이 줄어든다. 즉 gap 10으로 올리면
    // 375px에서 날짜가 잘리기 시작한다. 버튼 사이가 좁아 보이더라도 여기서 올리면 안 되고,
    // 늘리려면 폭을 다른 데서 만들어 와야 한다(예: 버튼 4개일 때만 액션을 아랫줄로).
    actionGroup: { display: 'flex', gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end', flexShrink: 0 },
    // PC는 폭 제약이 전혀 없다 — 3줄 영역 1080px 중 버튼그룹이 198px뿐이라 874px이 남는다.
    // 모바일 때문에 좁힌 gap 6을 PC까지 끌고 갈 이유가 없어서 여기서만 넉넉하게 준다.
    actionGroupWide: { display: 'flex', gap: 14, flexWrap: 'nowrap', justifyContent: 'flex-end', flexShrink: 0 },

    noteRow: { display: 'flex', justifyContent: 'flex-end' },
};

export default ReservationRow;
