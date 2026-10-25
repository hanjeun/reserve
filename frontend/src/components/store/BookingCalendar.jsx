import LoadingStatus from '../common/LoadingStatus';
/*
 * 날짜 값은 Dayjs를 유지하고 가능 여부·불가 사유는 서버 달력 응답을 사용한다.
 */
import React, { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import RollingFieldValue from '../common/RollingFieldValue';
import Tooltip from '../common/Tooltip';
import { Form, Modal } from 'antd';
import { LeftOutlined, RightOutlined, DoubleLeftOutlined, DoubleRightOutlined, CalendarOutlined } from '../common/icons';
import dayjs from 'dayjs';
import { useBookingCalendar } from '../../hooks';
import { colors, radius, fontSize, fontWeight, animation, field, transitions } from '../../styles/tokens';
import { DataState } from '../common';
import { Bone } from '../common/Skeletons';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 이만큼은 가로로 밀어야 달이 넘어간다. 더 짧으면 날짜를 누르다 손가락이 흔들린 것까지 잡힌다. */
const SWIPE_MIN_PX = 45;

/* 휴무·마감은 라벨로, 기간·예약 범위 밖 날짜는 비활성 상태로 구분한다. */
const BLOCKED_LABEL = {
    CLOSED: '휴무',
    FULL: '마감',
};

const BookingCalendar = ({ storeId, reservationId, value, onChange, style, disabled = false }) => {
    const { status } = Form.Item.useStatus();
    const isError = status === 'error';

    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => (value ?? dayjs()).startOf('month'));
    /** 스와이프 판정용 시작점. 모바일에서 좌우로 밀면 달이 넘어간다. */
    const touchRef = useRef(null);

    const monthKey = month.format('YYYY-MM');
    // 닫혀 있을 땐 부르지 않는다 — 열어야 볼 수 있는 정보라 미리 받아둘 이유가 없다.
    const { byDate, loading, fetching, error, refetch } = useBookingCalendar(storeId, open ? monthKey : null, reservationId);

    const thisMonth = dayjs().startOf('month');
    // 지난 달로는 못 간다 — 어차피 전부 PAST 라 볼 것이 없고, 쿼리만 한 번 더 나간다.
    const canGoPrev = month.isAfter(thisMonth);

    const todayKey = dayjs().format('YYYY-MM-DD');
    const selectedKey = value ? value.format('YYYY-MM-DD') : null;
    const leading = month.day();                 // 1일이 무슨 요일인지 = 앞에 비울 칸 수
    const daysInMonth = month.daysInMonth();

    /*
     * 앞쪽 빈칸에도 실제 날짜 키를 사용해 달 전환 시 다른 날짜의 DOM을 재사용하지 않게 한다.
     */
    const cells = [];
    for (let i = leading; i > 0; i -= 1) cells.push({ blank: true, key: month.subtract(i, 'day').format('YYYY-MM-DD') });
    for (let d = 1; d <= daysInMonth; d += 1) cells.push({ blank: false, date: month.date(d) });

    const openCalendar = () => {
        // 열 때는 항상 고른 날짜(없으면 이번 달)로 돌아간다 —
        // 지난번에 넘겨 둔 달이 그대로 뜨면 "내가 고른 날이 어디 갔지"가 된다.
        setMonth((value ?? dayjs()).startOf('month'));
        setOpen(true);
    };

    /*
     * 선택 가능한 날짜를 누르면 즉시 확정하고 닫는다.
     */
    const pick = (date) => {
        onChange?.(date);
        setOpen(false);
    };

    /* 연 이동으로 과거에 진입하면 이번 달로 보정한다. */
    const goMonth = (delta) => {
        const next = month.add(delta, 'month');
        setMonth(next.isBefore(thisMonth) ? thisMonth : next);
    };
    const goYear = (delta) => {
        const next = month.add(delta, 'year');
        setMonth(next.isBefore(thisMonth) ? thisMonth : next);
    };

    /*
     * 터치 스와이프는 한 달만 이동하며 연 이동은 별도 버튼을 사용한다.
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

        const blockedLabel = BLOCKED_LABEL[dayStatus];
        const blockedReason = blockedLabel ?? (dayStatus === 'OUT_OF_PERIOD' ? '예약 가능한 기간이 아니에요' : null);
        const dayLabel = date.format('M월 D일');
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
                aria-label={blockedReason ? `${dayLabel} ${blockedReason}` : dayLabel}
                style={{
                    ...styles.cell,
                    ...(isToday && !isSelected ? styles.cellToday : null),
                    // 시간 pill 과 같은 등장 방식. 31칸이라 간격은 훨씬 짧게 잡는다.
                    animation: animation.scaleSpringIn,
                    animationDelay: `${index * 10}ms`,
                }}
            >
                {/*
                 * 날짜 숫자는 중앙에 두고 사유 라벨은 문서 흐름 밖 아래에 배치한다.
                 */}
                <span className="reserve-cal-day" style={styles.dayNum}>{date.date()}</span>
                {blockedLabel ? <span style={styles.tag}>{blockedLabel}</span> : null}
            </button>
        );
    };

    // 날짜 그리드 본문 — 오류 → 로딩(스켈레톤) → 날짜 칸 순으로 판정한다.
    const renderDayGrid = () => {
        if (error) {
            return <DataState state="error" title={error} onRetry={refetch} compact />;
        }
        if (loading || fetching) {
            return (
                <LoadingStatus aria-label="예약 가능한 날짜를 불러오는 중" aria-busy="true">
                    <div style={styles.grid} aria-hidden="true">
                        {cells.map(cell => cell.blank ? <span key={cell.key} /> : <Bone key={cell.date.format('YYYY-MM-DD')} pageLoading={false} height={40} borderRadius={radius.md} />)}
                    </div>
                </LoadingStatus>
            );
        }
        return (
            <div style={styles.grid}>
                {cells.map((cell, i) => (cell.blank
                    ? <span key={cell.key} />
                    : renderDay(cell.date, i)))}
            </div>
        );
    };

    return (
        <>
            {/* 필드는 항상 자리를 지킨다 — 다른 입력칸과 같은 높이·같은 채움색. */}
            <button
                type="button"
                className="rsv-tap-btn reserve-cal-trigger"
                disabled={disabled}
                onClick={openCalendar}
                style={{ ...styles.trigger, ...(isError ? styles.triggerError : null), ...style }}
            >
                <span style={{ ...styles.triggerText, ...(value ? null : styles.placeholder) }}>
                    <RollingFieldValue value={value?.startOf('day').valueOf()} modalOpen={open}>
                        {value ? `${value.format('YYYY. M. D.')} (${WEEKDAYS[value.day()]})` : '날짜 선택'}
                    </RollingFieldValue>
                </span>
                <CalendarOutlined aria-hidden="true" style={{
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
                title={<span style={styles.visuallyHidden}>예약 날짜 선택</span>}
                styles={{ header: styles.visuallyHiddenHeader }}
                /*
                 * 다음 달 도구와 겹치는 닫기 버튼은 생략하고 선택·바깥 클릭·Escape로 닫는다.
                 */
                closable={false}
                /*
                 * AntD 6의 실제 최상위 클래스에 연결하도록 rootClassName을 사용한다.
                 */
                rootClassName="reserve-cal-modal"
            >
                <div style={styles.header}>
                    <div style={styles.navGroup}>
                        <Tooltip title="이전 해"><button type="button" className="rsv-tap-btn reserve-cal-nav" disabled={!canGoPrev}
                                onClick={() => goYear(-1)} aria-label="이전 해">
                            <DoubleLeftOutlined style={{ fontSize: 11 }} />
                        </button></Tooltip>
                        <Tooltip title="이전 달"><button type="button" className="rsv-tap-btn reserve-cal-nav" disabled={!canGoPrev}
                                onClick={() => goMonth(-1)} aria-label="이전 달">
                            <LeftOutlined style={{ fontSize: 12 }} />
                        </button></Tooltip>
                    </div>
                    <span style={styles.monthLabel}>{month.format('YYYY년 M월')}</span>
                    <div style={styles.navGroup}>
                        <Tooltip title="다음 달"><button type="button" className="rsv-tap-btn reserve-cal-nav"
                                onClick={() => goMonth(1)} aria-label="다음 달">
                            <RightOutlined style={{ fontSize: 12 }} />
                        </button></Tooltip>
                        <Tooltip title="다음 해"><button type="button" className="rsv-tap-btn reserve-cal-nav"
                                onClick={() => goYear(1)} aria-label="다음 해">
                            <DoubleRightOutlined style={{ fontSize: 11 }} />
                        </button></Tooltip>
                    </div>
                </div>

                <div style={styles.grid}>
                    {WEEKDAYS.map((w, i) => (
                        <span key={w} style={{ ...styles.weekday, ...(i === 0 ? styles.weekdaySun : null) }}>{w}</span>
                    ))}
                </div>

                <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                {renderDayGrid()}
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
        transition: `all ${transitions.fast} ${transitions.easing}`,
    },
    // 에러 링은 field.errorRing 관문 하나에서만 온다 —
    // 바로 아래 "예약 시간" 자리표시자와 같은 값을 써야 두 칸이 같은 말을 한다.
    triggerError: { boxShadow: field.errorRing },
    triggerText: {
        ...field.textStyle,
        color: colors.text.primary,
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
    visuallyHidden: {
        position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
        overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
    },
    visuallyHiddenHeader: {
        position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
        overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
    },
};

BookingCalendar.propTypes = {
    storeId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    reservationId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    /** dayjs. Form.Item 이 주입한다. */
    value: PropTypes.object,
    onChange: PropTypes.func,
    style: PropTypes.object,
    disabled: PropTypes.bool,
};

export default BookingCalendar;
