/**
 * RESERVE Design System - FormDatePicker
 *
 * AntD DatePicker의 필드 API(value/onChange)는 유지하되 달력 표면은 RESERVE가 직접 그린다.
 * 가게 설정·광고 신청·예약 화면이 서로 다른 달력 언어를 쓰지 않게 하는 공통 관문이다.
 */
import React, { useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form, Modal } from 'antd';
import {
    CalendarOutlined,
    DoubleLeftOutlined,
    DoubleRightOutlined,
    LeftOutlined,
    RightOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import Button from './Button';
import useHolidayDates from '../../hooks/useHolidayDates';
import { animation, colors, field, fontSize, fontWeight, radius } from '../../styles/tokens';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SWIPE_MIN_PX = 45;

const validDay = value => (value && dayjs.isDayjs(value) && value.isValid() ? value : null);
const dayKey = value => validDay(value)?.format('YYYY-MM-DD') ?? null;
const sameDay = (left, right) => Boolean(left && right && left.isSame(right, 'day'));

const initialMonthFor = (mode, value) => {
    if (mode === 'range') return validDay(value?.[0]) ?? validDay(value?.[1]) ?? dayjs();
    if (mode === 'multiple') return validDay(value?.[0]) ?? dayjs();
    return validDay(value) ?? dayjs();
};

const triggerLabel = (mode, value, placeholder, format) => {
    if (mode === 'range') {
        const start = validDay(value?.[0]);
        const end = validDay(value?.[1]);
        return {
            start: start?.format(format) ?? placeholder?.[0] ?? '시작일',
            end: end?.format(format) ?? placeholder?.[1] ?? '종료일',
            hasStart: Boolean(start),
            hasEnd: Boolean(end),
        };
    }

    if (mode === 'multiple') {
        const dates = (Array.isArray(value) ? value : []).map(validDay).filter(Boolean);
        if (dates.length === 0) return placeholder ?? '날짜 선택';
        if (dates.length === 1) return dates[0].format(format);
        return `${dates[0].format(format)} 외 ${dates.length - 1}일`;
    }

    return validDay(value)?.format(format) ?? placeholder ?? '날짜 선택';
};

const validDays = value => (Array.isArray(value) ? value : []).map(validDay).filter(Boolean);

const hasPickerValue = (mode, value) => {
    if (mode === 'range') return Boolean(validDay(value?.[0]) || validDay(value?.[1]));
    if (mode === 'multiple') return Array.isArray(value) && value.some(item => Boolean(validDay(item)));
    return Boolean(validDay(value));
};

const resolveIconColor = (disabled, isError, hasValue) => {
    if (disabled) return colors.gray[400];
    if (isError && !hasValue) return colors.error.main;
    if (hasValue) return colors.primary.main;
    return field.placeholderColor;
};

const canCommitRange = (draftRange, allowEmpty) => (
    (Boolean(draftRange[0]) || allowEmpty[0] === true)
    && (Boolean(draftRange[1]) || allowEmpty[1] === true)
    && draftRange.some(Boolean)
);

// 앞쪽 빈칸(지난달 날짜 키) + 이번 달 날짜
const buildMonthCells = month => {
    const cells = [];
    for (let index = month.day(); index > 0; index -= 1) {
        cells.push({ blank: true, key: month.subtract(index, 'day').format('YYYY-MM-DD') });
    }
    for (let date = 1; date <= month.daysInMonth(); date += 1) {
        const current = month.date(date);
        cells.push({ blank: false, key: current.format('YYYY-MM-DD'), date: current });
    }
    return cells;
};

const toggleDate = (current, date) => {
    const exists = current.some(item => sameDay(item, date));
    if (exists) return current.filter(item => !sameDay(item, date));
    return [...current, date].sort((a, b) => a.valueOf() - b.valueOf());
};

const pickRangeDate = (current, date, rangePart, setRangePart) => {
    const next = [...current];
    if (rangePart === 0) {
        next[0] = date;
        if (next[1]?.isBefore(date, 'day')) next[1] = null;
        setRangePart(1);
    } else if (next[0]?.isAfter(date, 'day')) {
        // 끝 날짜를 시작 날짜보다 먼저 고르면 선택을 무효화하지 않고 날짜순으로
        // 정렬한다. 사용자가 시작/종료 탭을 다시 찾아 누르게 만드는 상태를 피한다.
        next[1] = next[0];
        next[0] = date;
    } else {
        next[1] = date;
    }
    return next;
};

// 가로 스와이프면 이동할 달(+1/-1), 아니면 0
const swipeMonthDelta = (start, touch) => {
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return 0;
    return dx < 0 ? 1 : -1;
};

const cellPresentation = ({ cell, mode, disabledDate, selectedKeys, draftRange, holidays }) => {
    const date = cell.date;
    const isDisabled = Boolean(disabledDate?.(date));
    const isSelected = selectedKeys.has(cell.key);
    const start = draftRange[0];
    const end = draftRange[1];
    const isInsideRange = mode === 'range' && start && end
        && date.isAfter(start, 'day') && date.isBefore(end, 'day');
    const isToday = date.isSame(dayjs(), 'day');
    const classNames = ['rsv-tap-btn', 'reserve-cal-cell', 'reserve-form-cal-cell'];
    if (isSelected) classNames.push('is-selected');
    if (isInsideRange) classNames.push('is-range');
    if (isToday && !isDisabled) classNames.push('is-today');
    const isPublicHoliday = holidays.has(cell.key);
    if ((date.day() === 0 || isPublicHoliday) && !isDisabled && !isSelected) classNames.push('is-holiday');

    let stateLabel = isPublicHoliday ? ' 공휴일' : '';
    if (isDisabled) stateLabel += ' 선택 불가';
    else if (isSelected) stateLabel += ' 선택됨';
    else if (isInsideRange) stateLabel += ' 선택 범위';

    return { isDisabled, isSelected, className: classNames.join(' '), stateLabel };
};

function TriggerLabel({ mode, label, hasValue }) {
    if (mode === 'range') {
        return (
            <span style={styles.rangeTrigger}>
                <span style={label.hasStart ? styles.value : styles.placeholder}>{label.start}</span>
                <span aria-hidden="true" style={styles.arrow}>→</span>
                <span style={label.hasEnd ? styles.value : styles.placeholder}>{label.end}</span>
            </span>
        );
    }
    return (
        <span key={hasValue ? String(label) : 'empty'} style={{
            ...(hasValue ? styles.value : styles.placeholder),
            animation: animation.slideUpIn,
        }}>
            {label}
        </span>
    );
}

TriggerLabel.propTypes = {
    mode: PropTypes.string,
    label: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    hasValue: PropTypes.bool,
};

function RangePartChoice({ draftRange, rangePart, setRangePart }) {
    return (
        <div role="group" style={styles.rangeChoice} aria-label="선택할 날짜 종류">
            {[0, 1].map(part => {
                const date = draftRange[part];
                return (
                    <button
                        key={part}
                        type="button"
                        className={`reserve-form-cal-part${rangePart === part ? ' is-active' : ''}`}
                        aria-pressed={rangePart === part}
                        onClick={() => setRangePart(part)}
                    >
                        <span style={styles.partLabel}>{part === 0 ? '시작일' : '종료일'}</span>
                        <span style={date ? styles.partValue : styles.partPlaceholder}>
                            {date ? date.format('YYYY. M. D.') : '선택 안 함'}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

RangePartChoice.propTypes = {
    draftRange: PropTypes.array.isRequired,
    rangePart: PropTypes.number.isRequired,
    setRangePart: PropTypes.func.isRequired,
};

const FormDatePickerBase = ({
    mode = 'single',
    value,
    onChange,
    onBlur,
    placeholder,
    disabled = false,
    disabledDate,
    format = 'YYYY-MM-DD',
    style,
    id,
    className = '',
    allowEmpty = [false, false],
    highlightHolidays = false,
}) => {
    const { status } = Form.Item.useStatus();
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => initialMonthFor(mode, value).startOf('month'));
    // 공휴일(빨간날)은 서버 HolidayService 가 준다. 받기 전·실패 시에는 빈 집합이라 예전처럼 일요일만 빨갛다.
    // 기본은 꺼 두고 호출부가 켠다 — 단위 테스트·미리보기에서 공통 입력이 네트워크를 부르지 않게.
    const holidays = useHolidayDates(month.format('YYYY-MM'), open && highlightHolidays);
    const [draftSingle, setDraftSingle] = useState(() => validDay(value));
    const [draftMultiple, setDraftMultiple] = useState(() => validDays(value));
    const [draftRange, setDraftRange] = useState(() => [validDay(value?.[0]), validDay(value?.[1])]);
    const [rangePart, setRangePart] = useState(0);
    const touchRef = useRef(null);

    const selectedKeys = useMemo(() => {
        if (mode === 'range') return new Set(draftRange.map(dayKey).filter(Boolean));
        if (mode === 'multiple') return new Set(draftMultiple.map(dayKey).filter(Boolean));
        return new Set([dayKey(draftSingle)].filter(Boolean));
    }, [draftMultiple, draftRange, draftSingle, mode]);

    const openPicker = () => {
        if (disabled) return;
        setMonth(initialMonthFor(mode, value).startOf('month'));
        if (mode === 'range') {
            const next = [validDay(value?.[0]), validDay(value?.[1])];
            setDraftRange(next);
            setRangePart(next[0] && !next[1] ? 1 : 0);
        } else if (mode === 'multiple') {
            setDraftMultiple(validDays(value));
        } else {
            setDraftSingle(validDay(value));
        }
        setOpen(true);
    };

    const closePicker = () => {
        setOpen(false);
        onBlur?.();
    };

    const pickDate = date => {
        if (mode === 'single') {
            setDraftSingle(date);
            onChange?.(date);
            closePicker();
            return;
        }

        if (mode === 'multiple') {
            setDraftMultiple(current => toggleDate(current, date));
            return;
        }

        setDraftRange(current => pickRangeDate(current, date, rangePart, setRangePart));
    };

    const clearValue = () => {
        if (mode === 'range') onChange?.(null);
        else if (mode === 'multiple') onChange?.([]);
        else onChange?.(null);
        closePicker();
    };

    const commitDraft = () => {
        if (mode === 'range') onChange?.(draftRange.some(Boolean) ? draftRange : null);
        else if (mode === 'multiple') onChange?.(draftMultiple);
        else onChange?.(draftSingle);
        closePicker();
    };

    const rangeCanCommit = mode !== 'range' || canCommitRange(draftRange, allowEmpty);

    const cells = buildMonthCells(month);

    const goMonth = delta => setMonth(current => current.add(delta, 'month'));
    const goYear = delta => setMonth(current => current.add(delta, 'year'));
    const onTouchStart = event => {
        const touch = event.changedTouches[0];
        touchRef.current = { x: touch.clientX, y: touch.clientY };
    };
    const onTouchEnd = event => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start) return;
        const delta = swipeMonthDelta(start, event.changedTouches[0]);
        if (delta === 0) return;
        goMonth(delta);
    };

    const renderCell = (cell, index) => {
        if (cell.blank) return <span key={cell.key} aria-hidden="true" />;

        const date = cell.date;
        const { isDisabled, isSelected, className: cellClassName, stateLabel } = cellPresentation({
            cell, mode, disabledDate, selectedKeys, draftRange, holidays,
        });

        return (
            <button
                key={cell.key}
                type="button"
                className={cellClassName}
                disabled={isDisabled}
                aria-pressed={isSelected}
                aria-label={`${date.format('M월 D일')}${stateLabel}`}
                onClick={() => pickDate(date)}
                style={{
                    ...styles.cell,
                    animation: animation.scaleSpringIn,
                    animationDelay: `${index * 8}ms`,
                }}
            >
                {date.date()}
            </button>
        );
    };

    const hasValue = hasPickerValue(mode, value);

    const label = triggerLabel(mode, value, placeholder, format);
    const dialogLabel = mode === 'range' ? '날짜 범위 선택' : '날짜 선택';
    const isError = status === 'error';
    const iconColor = resolveIconColor(disabled, isError, hasValue);

    return (
        <>
            <button
                id={typeof id === 'string' ? id : undefined}
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={`rsv-tap-btn reserve-cal-trigger reserve-form-date-trigger ${className}`.trim()}
                onClick={openPicker}
                style={{
                    ...styles.trigger,
                    ...(disabled ? styles.triggerDisabled : null),
                    ...(isError ? styles.triggerError : null),
                    ...style,
                }}
            >
                <TriggerLabel mode={mode} label={label} hasValue={hasValue} />
                <CalendarOutlined aria-hidden="true" style={{
                    flexShrink: 0,
                    fontSize: field.iconSize,
                    color: iconColor,
                }} />
            </button>

            <Modal
                open={open}
                onCancel={closePicker}
                footer={null}
                title={<span style={styles.visuallyHidden}>{dialogLabel}</span>}
                styles={{ header: styles.visuallyHiddenHeader }}
                centered
                width={356}
                destroyOnHidden
                closable={false}
                rootClassName="reserve-cal-modal reserve-form-cal-modal"
            >
                {mode === 'range' && (
                    <RangePartChoice draftRange={draftRange} rangePart={rangePart} setRangePart={setRangePart} />
                )}

                <div style={styles.header}>
                    <div style={styles.navGroup}>
                        <button type="button" className="rsv-tap-btn reserve-cal-nav" onClick={() => goYear(-1)} aria-label="이전 해">
                            <DoubleLeftOutlined style={{ fontSize: 11 }} />
                        </button>
                        <button type="button" className="rsv-tap-btn reserve-cal-nav" onClick={() => goMonth(-1)} aria-label="이전 달">
                            <LeftOutlined style={{ fontSize: 12 }} />
                        </button>
                    </div>
                    <span style={styles.monthLabel}>{month.format('YYYY년 M월')}</span>
                    <div style={styles.navGroup}>
                        <button type="button" className="rsv-tap-btn reserve-cal-nav" onClick={() => goMonth(1)} aria-label="다음 달">
                            <RightOutlined style={{ fontSize: 12 }} />
                        </button>
                        <button type="button" className="rsv-tap-btn reserve-cal-nav" onClick={() => goYear(1)} aria-label="다음 해">
                            <DoubleRightOutlined style={{ fontSize: 11 }} />
                        </button>
                    </div>
                </div>

                <div style={styles.grid}>
                    {WEEKDAYS.map((weekday, index) => (
                        <span key={weekday} style={{ ...styles.weekday, ...(index === 0 ? styles.sunday : null) }}>
                            {weekday}
                        </span>
                    ))}
                </div>
                <div style={styles.grid} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                    {cells.map((cell, index) => renderCell(cell, index))}
                </div>

                {mode !== 'single' && (
                    <div style={styles.footer}>
                        <Button variant="ghost-sm" size="sm" onClick={clearValue}>전체 해제</Button>
                        <Button variant="primary" size="sm" disabled={!rangeCanCommit} onClick={commitDraft}
                            style={{ minWidth: 92, padding: '0 18px' }}>
                            선택 완료
                        </Button>
                    </div>
                )}
            </Modal>
        </>
    );
};

const FormDatePicker = ({ multiple = false, ...props }) => (
    <FormDatePickerBase {...props} mode={multiple ? 'multiple' : 'single'} />
);
FormDatePicker.RangePicker = props => <FormDatePickerBase {...props} mode="range" />;

const sharedPropTypes = {
    value: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    onChange: PropTypes.func,
    onBlur: PropTypes.func,
    placeholder: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
    disabled: PropTypes.bool,
    disabledDate: PropTypes.func,
    format: PropTypes.string,
    style: PropTypes.object,
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    className: PropTypes.string,
    multiple: PropTypes.bool,
    highlightHolidays: PropTypes.bool,
};

FormDatePicker.propTypes = sharedPropTypes;
FormDatePicker.RangePicker.propTypes = {
    ...sharedPropTypes,
    allowEmpty: PropTypes.arrayOf(PropTypes.bool),
};

const styles = {
    trigger: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        width: '100%', height: field.height, padding: '0 11px', boxSizing: 'border-box',
        border: 'none', borderRadius: field.radius, background: field.bg,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    },
    triggerDisabled: { background: colors.gray[100], cursor: 'not-allowed', opacity: 0.7 },
    triggerError: { boxShadow: field.errorRing },
    rangeTrigger: {
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        alignItems: 'center', gap: 10, minWidth: 0, flex: 1,
        fontVariantNumeric: 'tabular-nums',
    },
    value: { minWidth: 0, color: colors.text.primary, fontSize: fontSize.lg, fontWeight: fontWeight.regular },
    placeholder: { minWidth: 0, color: field.placeholderColor, fontSize: fontSize.lg, fontWeight: fontWeight.regular },
    arrow: { color: colors.text.placeholder, textAlign: 'center' },
    rangeChoice: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 },
    partLabel: { display: 'block', marginBottom: 3, fontSize: fontSize.xs, color: colors.text.tertiary },
    partValue: { display: 'block', fontSize: fontSize.sm, color: colors.text.primary, fontVariantNumeric: 'tabular-nums' },
    partPlaceholder: { display: 'block', fontSize: fontSize.sm, color: field.placeholderColor },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    navGroup: { display: 'flex', gap: 2 },
    monthLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text.primary },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
    weekday: { textAlign: 'center', padding: '4px 0 6px', fontSize: fontSize.xs, color: colors.text.tertiary, fontWeight: fontWeight.medium },
    sunday: { color: colors.error.main },
    cell: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 40, padding: 0, border: 'none', borderRadius: radius.md,
        fontFamily: 'inherit', fontSize: fontSize.sm, fontWeight: fontWeight.medium,
        fontVariantNumeric: 'tabular-nums',
    },
    footer: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${colors.border.light}`,
    },
    visuallyHiddenHeader: { height: 0, margin: 0, overflow: 'hidden' },
    visuallyHidden: {
        position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
        overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
    },
};

export default FormDatePicker;
