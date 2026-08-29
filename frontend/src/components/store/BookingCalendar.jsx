/**
 * 예약 날짜 선택 — **필드는 그대로 두고, 누르면 달력 모달이 뜬다.**
 *
 * <h3>왜 AntD DatePicker 를 안 쓰나 (2026-08-25)</h3>
 * `disabledDate` 는 **회색으로 막는 것밖에 못 한다.** 그래서 정기휴무·임시휴무·운영기간 밖·
 * 예약 범위 초과·정원 마감이 **전부 같은 회색 하나**로 뭉개졌다.
 * 손님은 "왜 안 눌리지"를, 사장님은 "왜 예약이 안 들어오지"를 알 방법이 없었다.
 *
 * <h3>★★ 이 컴포넌트는 판정하지 않는다. 그리기만 한다.</h3>
 * 각 날짜의 상태·사유는 **서버가 준다**(`GET /api/reservations/calendar`).
 * 여기서 휴무나 기간을 다시 계산하면 서버 `Store.isBookableOn` 과 언젠가 어긋나고,
 * 그 순간 이 프로젝트가 반복해서 당한 **"달력엔 눌리는데 예약하면 거절"** 이 돌아온다.
 * → 새 규칙을 넣고 싶으면 `ReservationService.describeDay` 에 넣을 것. 여기가 아니다.
 *
 * <h3>★★ 왜 인라인이 아니라 모달인가 (2026-08-25, 세 번 갈아엎고 내린 결론)</h3>
 * 인라인으로 펼치는 안을 두 번 만들었고 둘 다 같은 벽에 부딪혔다 —
 *
 *   필드 아래에 펼치기   같은 정보(고른 날짜)가 위아래로 두 번 나오고 폼이 한 줄 길어진다
 *   필드 자리를 대체하기 열려 있는 동안 **필드가 사라져서**, 자동으로 접지 않으면 되돌아올 길이 없다.
 *                        그렇다고 자동으로 접으면 여러 날을 비교하며 고를 수가 없다.
 *
 * 두 요구("필드는 항상 보인다" + "고르는 동안 달력이 떠 있다")는 **한 자리에서 동시에 만족할 수 없다.**
 * 층을 하나 더 쓰면 그냥 풀린다 → 필드는 자리를 지키고, 달력은 위에 뜬다.
 *
 * <p>원래 팝업을 버린 이유는 **"AntD 가 사유를 못 그린다"** 와 **"드롭다운이 잘린다"** 였다.
 * 둘 다 모달로 가도 그대로 해결된다 — 사유는 우리가 그리고, 가운데 뜨는 모달은 잘릴 자리가 없다.
 *
 * <h3>색은 "예약 시간" pill 과 같은 언어</h3>
 *   모달 바탕  흰색 + 검은 글자          ← 시간 pill 이 놓인 배경과 같다
 *   hover     둥근 연한 회색 gray[100]   ← `.rsv-time-pill:hover`
 *   선택      둥근 회색 gray[200] + 600  ← `.rsv-time-pill.rsv-selected`
 *   불가      연한 회색(text.disabled)   ← 취소선은 안 쓴다. 사유 라벨이 이미 말해준다
 *   화살표    평소엔 아이콘만, hover 에만 둥근 회색 판 (버튼이 작아서 항상 판을 깔면 답답하다)
 *
 * ⚠️ **파란색(primary)을 쓰지 않는다.** 예약 폼 전체가 무채색이라 파랑이 하나 끼면 그 칸만 튄다.
 *
 * <h3>값 규약</h3>
 * `value`/`onChange` 는 **dayjs** 다 — 기존 `FormDatePicker` 와 같아서 호출부(`StoreDetail`)의
 * `dateValue` 계산과 제출 로직이 한 줄도 안 바뀐다. 고르면 모달이 닫히고 필드에 날짜가 뜨며,
 * 그 값 변화가 그대로 시간 슬롯 조회를 깨운다.
 */
import React, { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form, Modal } from 'antd';
import { LeftOutlined, RightOutlined, DoubleLeftOutlined, DoubleRightOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useBookingCalendar } from '../../hooks';
import { colors, radius, fontSize, fontWeight, animation, field } from '../../styles/tokens';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 이만큼은 가로로 밀어야 달이 넘어간다. 더 짧으면 날짜를 누르다 손가락이 흔들린 것까지 잡힌다. */
const SWIPE_MIN_PX = 45;


/**
 * 막힌 이유. 여기 없는 상태는 라벨 없이 흐리게만 둔다(PAST·TOO_FAR — 손님이 할 수 있는 게 없다).
 *
 * ★ 예전엔 여기에 "남은 시간 N개"도 같이 찍었는데 뺐다. 30분 단위 가게는 하루 22~24개라
 *   **달력이 같은 숫자로 도배**됐다. 매 칸에 있는 숫자는 정보가 아니라 배경이다.
 */
const BLOCKED_LABEL = {
    CLOSED: '휴무',
    FULL: '마감',
    OUT_OF_PERIOD: '기간 밖',
};

const BookingCalendar = ({ storeId, value, onChange, style }) => {
    const { status } = Form.Item.useStatus();
    const isError = status === 'error';

    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => (value ?? dayjs()).startOf('month'));
    /** 스와이프 판정용 시작점. 모바일에서 좌우로 밀면 달이 넘어간다. */
    const touchRef = useRef(null);

    const monthKey = month.format('YYYY-MM');
    // 닫혀 있을 땐 부르지 않는다 — 열어야 볼 수 있는 정보라 미리 받아둘 이유가 없다.
    const { byDate, loading, fetching, error, refetch } = useBookingCalendar(storeId, open ? monthKey : null);

    const thisMonth = dayjs().startOf('month');
    // 지난 달로는 못 간다 — 어차피 전부 PAST 라 볼 것이 없고, 쿼리만 한 번 더 나간다.
    const canGoPrev = month.isAfter(thisMonth);

    const todayKey = dayjs().format('YYYY-MM-DD');
    const selectedKey = value ? value.format('YYYY-MM-DD') : null;
    const leading = month.day();                 // 1일이 무슨 요일인지 = 앞에 비울 칸 수
    const daysInMonth = month.daysInMonth();

    const cells = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(month.date(d));

    const openCalendar = () => {
        // 열 때는 항상 고른 날짜(없으면 이번 달)로 돌아간다 —
        // 지난번에 넘겨 둔 달이 그대로 뜨면 "내가 고른 날이 어디 갔지"가 된다.
        setMonth((value ?? dayjs()).startOf('month'));
        setOpen(true);
    };

    /**
     * 고르는 순간 확정하고 닫는다.
     *
     * ★ 초안 + [취소][확인] 안도 만들어봤는데 되돌렸다(2026-08-25).
     *   버튼 두 개가 달력 아래 붙으면 옛날 폼처럼 보이고, 무엇보다 **고민은 누르기 전에
     *   격자를 보면서 하는 것**이다 — 휴무·마감·기간 밖이 이미 칸에 다 적혀 있다.
     *   누르는 건 이미 결정한 것이므로, 거기서 한 번 더 확인을 받는 건 일을 늘리기만 한다.
     *   마음이 바뀌면 다시 여는 게 탭 한 번이고, 그동안 필드엔 직전 선택이 그대로 남아 있다.
     */
    const pick = (date) => {
        onChange?.(date);
        setOpen(false);
    };

    /** 이번 달보다 뒤로는 못 간다. 한 해를 빼서 과거로 넘어가면 이번 달로 붙인다. */
    const goMonth = (delta) => {
        const next = month.add(delta, 'month');
        setMonth(next.isBefore(thisMonth) ? thisMonth : next);
    };
    const goYear = (delta) => {
        const next = month.add(delta, 'year');
        setMonth(next.isBefore(thisMonth) ? thisMonth : next);
    };

    /*
     * 모바일 스와이프 — 좌우로 밀면 달이 넘어간다.
     * 터치 이벤트만 듣는다: PC 는 마우스 드래그로 달이 넘어가면 오히려 사고가 난다(날짜를 누르려다 끌림).
     *
     * ⚠️ "두 번 연속 스와이프 = 연 이동"은 넣지 않았다. 두 달 뒤로 가려고 두 번 미는 게
     *    가장 흔한 동작인데 그게 갑자기 1년을 날려버린다. 연 이동은 « » 버튼이 맡는다.
     */
    const onTouchStart = (e) => {
        const t = e.changedTouches[0];
        touchRef.current = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = (e) => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        // 세로로 더 많이 움직였으면 스크롤 의도다. 가로로 확실히 밀었을 때만 넘긴다.
        if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
        goMonth(dx < 0 ? 1 : -1);
    };

    const renderDay = (date, index) => {
        const key = date.format('YYYY-MM-DD');
        const info = byDate[key];
        // 응답이 아직 없으면 **누를 수 없게** 둔다. 낙관적으로 열어두면 막힌 날을 고르게 된다.
        const dayStatus = info?.status ?? 'PAST';
        const isOpenDay = dayStatus === 'OPEN';
        const isSelected = key === selectedKey;
        const isToday = key === todayKey;
        // 빨간날 = 일요일 + 공휴일. 공휴일 여부는 **서버가 준다**(HolidayService) —
        // 여기서 날짜를 보고 판정하지 않는다. 대체공휴일·임시공휴일을 프론트가 알 방법이 없다.
        // 키가 없거나 공공데이터포털이 죽으면 holiday 가 전부 false 로 와서 일요일만 남는다.
        const isRedDay = date.day() === 0 || info?.holiday === true;

        const cls = ['rsv-tap-btn', 'reserve-cal-cell'];
        if (isSelected) cls.push('is-selected');
        if (!isOpenDay) cls.push('is-blocked');
        // 막힌 날에는 안 준다: 연한 회색이 "못 고른다"를 말해야 하는데 빨강이 끼면 신호가 섞인다.
        if (isRedDay && isOpenDay && !isSelected) cls.push('is-holiday');

        return (
            <button
                key={key}
                type="button"                       /* Form 안이라 기본값(submit)이면 눌릴 때마다 제출된다 */
                className={cls.join(' ')}
                disabled={!isOpenDay}
                onClick={() => pick(date)}
                aria-pressed={isSelected}
                aria-label={`${date.format('M월 D일')}${BLOCKED_LABEL[dayStatus] ? ` ${BLOCKED_LABEL[dayStatus]}` : ''}`}
                style={{
                    ...styles.cell,
                    ...(isToday && !isSelected ? styles.cellToday : null),
                    // 시간 pill 과 같은 등장 방식. 31칸이라 간격은 훨씬 짧게 잡는다.
                    animation: animation.scaleSpringIn,
                    animationDelay: `${index * 10}ms`,
                }}
            >
                {/*
                 * ★ 숫자는 칸의 정가운데. 사유 라벨은 흐름에서 빼서 아래에 띄운다.
                 *   예전엔 둘을 세로로 쌓았는데, 라벨이 없는 날도 자리를 차지해서
                 *   **숫자가 위로 밀려 보였다**(선택된 회색 칸에서 특히 눈에 띈다).
                 */}
                <span className="reserve-cal-day" style={styles.dayNum}>{date.date()}</span>
                {BLOCKED_LABEL[dayStatus]
                    ? <span style={styles.tag}>{BLOCKED_LABEL[dayStatus]}</span>
                    : null}
            </button>
        );
    };

    return (
        <>
            {/* 필드는 항상 자리를 지킨다 — 다른 입력칸과 같은 높이·같은 채움색. */}
            <button
                type="button"
                className="rsv-tap-btn reserve-cal-trigger"
                onClick={openCalendar}
                style={{ ...styles.trigger, ...(isError ? styles.triggerError : null), ...style }}
            >
                {/* key 를 값에 걸어 두면 날짜가 바뀔 때마다 다시 마운트돼 슬라이드-인이 다시 돈다. */}
                <span key={selectedKey ?? 'empty'}
                      style={{ ...styles.triggerText, ...(value ? null : styles.placeholder),
                               animation: animation.slideUpIn }}>
                    {value ? `${value.format('YYYY. M. D.')} (${WEEKDAYS[value.day()]})` : '날짜 선택'}
                </span>
                <CalendarOutlined style={{
                    fontSize: field.iconSize,
                    color: isError && !value ? colors.error.main : colors.text.placeholder,
                }} />
            </button>

            <Modal
                open={open}
                onCancel={() => setOpen(false)}
                footer={null}
                centered
                width={332}
                destroyOnHidden
                title={null}
                /*
                 * 닫기 X 를 없앤다 — 332px 폭에서 오른쪽 위는 "다음 달" 화살표 자리다.
                 * 둘을 같이 두면 겹친다(실제로 겹쳤다). 닫는 길은 이미 셋이다:
                 * 날짜 선택 · 바깥(마스크) 클릭 · Esc.
                 */
                closable={false}
                /*
                 * ⚠️ classNames={{ content }} 를 쓰면 안 붙는다 — AntD 6 는 그 자리가
                 *   `.ant-modal-content` 가 아니라 `.ant-modal-container` 다(v5→v6 클래스 리네임).
                 *   `rootClassName` 은 두 버전 모두에서 최상위에 그대로 붙어 안전하다.
                 */
                rootClassName="reserve-cal-modal"
            >
                <div style={styles.header}>
                    <div style={styles.navGroup}>
                        <button type="button" className="rsv-tap-btn reserve-cal-nav" disabled={!canGoPrev}
                                onClick={() => goYear(-1)} aria-label="이전 해">
                            <DoubleLeftOutlined style={{ fontSize: 11 }} />
                        </button>
                        <button type="button" className="rsv-tap-btn reserve-cal-nav" disabled={!canGoPrev}
                                onClick={() => goMonth(-1)} aria-label="이전 달">
                            <LeftOutlined style={{ fontSize: 12 }} />
                        </button>
                    </div>
                    <span style={styles.monthLabel}>{month.format('YYYY년 M월')}</span>
                    <div style={styles.navGroup}>
                        <button type="button" className="rsv-tap-btn reserve-cal-nav"
                                onClick={() => goMonth(1)} aria-label="다음 달">
                            <RightOutlined style={{ fontSize: 12 }} />
                        </button>
                        <button type="button" className="rsv-tap-btn reserve-cal-nav"
                                onClick={() => goYear(1)} aria-label="다음 해">
                            <DoubleRightOutlined style={{ fontSize: 11 }} />
                        </button>
                    </div>
                </div>

                <div style={styles.grid}>
                    {WEEKDAYS.map((w, i) => (
                        <span key={w} style={{ ...styles.weekday, ...(i === 0 ? styles.weekdaySun : null) }}>{w}</span>
                    ))}
                </div>

                <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                {error ? (
                    <div style={styles.message}>
                        {error}{' '}
                        <button type="button" onClick={refetch} style={styles.retry}>다시 시도</button>
                    </div>
                ) : (
                    <div style={{ ...styles.grid, opacity: loading || fetching ? 0.45 : 1 }}>
                        {cells.map((date, i) => (date ? renderDay(date, i) : <span key={`blank-${i}`} />))}
                    </div>
                )}
                </div>
            </Modal>
        </>
    );
};

const styles = {
    /*
     * 채움형 회색 — 이 앱의 입력칸이 전부 이 톤이다(field.bg = gray[50], field.radius).
     * 테두리는 그리지 않는다 — 다른 입력칸에 선이 없어서 여기만 그리면 또 튄다.
     */
    trigger: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', height: field.height, padding: '0 11px',
        boxSizing: 'border-box',
        border: 'none', borderRadius: field.radius, background: field.bg,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    },
    // 시간 칸이 에러일 때 아이콘이 빨개지는 것과 같은 언어로 반응한다.
    triggerError: { boxShadow: `inset 0 0 0 1px ${colors.error.main}` },
    triggerText: {
        fontSize: fontSize.lg, fontWeight: fontWeight.regular,
        color: colors.text.primary,
        fontVariantNumeric: 'tabular-nums',
    },
    // AntD placeholder 와 같은 색 — 바로 아래 "예약 시간"의 자리표시자와 톤이 정확히 맞는다.
    placeholder: { color: field.placeholderColor },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
    },
    monthLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text.primary },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2,
        transition: 'opacity 0.15s ease',
    },
    weekday: {
        textAlign: 'center', fontSize: fontSize.xs, color: colors.text.tertiary,
        fontWeight: fontWeight.medium, padding: '4px 0 6px',
    },
    weekdaySun: { color: colors.error.main },
    cell: {
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 40, padding: 0,
        border: 'none', borderRadius: radius.md,
        fontFamily: 'inherit',
        // 숫자 폭이 흔들리면 달력 전체가 떨린다.
        fontVariantNumeric: 'tabular-nums',
    },
    // "오늘" — 파란 링을 쓰면 회색 선택보다 더 튀어서 어디가 선택인지 헷갈린다.
    cellToday: { boxShadow: `inset 0 0 0 1px ${colors.gray[300]}` },
    dayNum: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, lineHeight: 1 },
    // 흐름에서 빼서 아래에 띄운다 — 라벨 유무가 숫자 위치를 흔들지 않게(위 주석 참고).
    tag: {
        position: 'absolute', left: 0, right: 0, bottom: 3,
        // 칸 폭이 40px 남짓이라 9px + nowrap 이어야 "기간 밖" 이 옆 칸으로 안 넘친다.
        fontSize: 9, lineHeight: 1, textAlign: 'center', whiteSpace: 'nowrap',
        color: 'inherit', opacity: 0.75,
        pointerEvents: 'none',
    },
    navGroup: { display: 'flex', gap: 2 },
    message: { padding: '24px 0', textAlign: 'center', fontSize: fontSize.sm, color: colors.text.tertiary },
    retry: {
        border: 'none', background: 'transparent', color: colors.primary.main,
        cursor: 'pointer', fontSize: fontSize.sm, fontFamily: 'inherit', padding: 0,
    },
};

BookingCalendar.propTypes = {
    storeId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    /** dayjs. Form.Item 이 주입한다. */
    value: PropTypes.object,
    onChange: PropTypes.func,
    style: PropTypes.object,
};

export default BookingCalendar;
