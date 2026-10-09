/**
 * RESERVE Design System - FormDatePicker
 *
 * AntD DatePicker의 필드 API(value/onChange)는 유지하되 달력 표면은 RESERVE가 직접 그린다.
 * 가게 설정·광고 신청·예약 화면이 서로 다른 달력 언어를 쓰지 않게 하는 공통 관문이다.
 */
import React, { useId, useMemo, useRef, useState } from 'react';
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
import ModalActions from './ModalActions';
import RollingFieldValue from './RollingFieldValue';
import useHolidayDates from '../../hooks/useHolidayDates';
import { animation, colors, field, fontSize, fontWeight, radius, transitions } from '../../styles/tokens';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SWIPE_MIN_PX = 45;

const validDay = value => (value && dayjs.isDayjs(value) && value.isValid() ? value : null);
const dayKey = value => validDay(value)?.format('YYYY-MM-DD') ?? null;
const sameDay = (left, right) => Boolean(left && right && left.isSame(right, 'day'));

const dateText = value => dayKey(value) ?? '';
const parseTypedDate = text => {
    const trimmed = text.trim();
    const separated = /^(\d{4})([-./])(\d{2})\2(\d{2})$/.exec(trimmed);
    const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
    // Also accept the previous calendar label's complete dotted form, including its final dot.
    const dottedLabel = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.$/.exec(trimmed);
    const parts = separated ? [separated[1], separated[3], separated[4]] : (compact ?? dottedLabel)?.slice(1);
    if (!parts) return null;
    const [year, month, date] = parts.map(Number);
    if (year < 1 || year > 9999 || month < 1 || month > 12 || date < 1 || date > 31) return null;
    const parsed = dayjs('2000-01-01').year(year).month(month - 1).date(date).startOf('day');
    return parsed.isValid() && parsed.year() === year && parsed.month() === month - 1 && parsed.date() === date ? parsed : null;
};

const typedDateState = (mode, texts, composing, disabledDate) => {
    const dates = texts.map((text, part) => composing.has(part) ? null : parseTypedDate(text));
    const errors = texts.map((text, part) => {
        if (!text.trim() || composing.has(part)) return null;
        if (!dates[part]) return '올바른 날짜를 끝까지 입력해주세요. 예: 2026-10-08 또는 20261008';
        if (disabledDate?.(dates[part])) return '선택할 수 없는 날짜예요.';
        return null;
    });
    const accepted = dates.map((date, part) => errors[part] ? null : date);
    if (mode === 'range' && accepted[0] && accepted[1]?.isBefore(accepted[0], 'day')) {
        errors[1] = '종료일은 시작일과 같거나 늦어야 해요.';
        accepted[1] = null;
    }
    return { dates: accepted, errors };
};

const pickerInputTexts = (mode, value) => mode === 'range'
    ? [dateText(value?.[0]), dateText(value?.[1])] : [mode === 'single' ? dateText(value) : ''];

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

const addDate = (current, date) => !date || current.some(item => sameDay(item, date))
    ? current : [...current, date].sort((a, b) => a.valueOf() - b.valueOf());

const pickRangeDate = (current, date, rangePart, setRangePart) => {
    const next = [...current];
    if (rangePart === 0) {
        next[0] = date;
        if (next[1]?.isBefore(date, 'day')) next[1] = null;
        setRangePart(1);
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
    if (date.day() === 0 || isPublicHoliday) classNames.push('is-holiday');

    let stateLabel = isPublicHoliday ? ' 공휴일' : '';
    if (isDisabled) stateLabel += ' 선택 불가';
    else if (isSelected) stateLabel += ' 선택됨';
    else if (isInsideRange) stateLabel += ' 선택 범위';

    return { isDisabled, isSelected, className: classNames.join(' '), stateLabel };
};

function TriggerLabel({ mode, label, hasValue, value, modalOpen }) {
    if (mode === 'range') {
        return (
            <span style={styles.rangeTrigger}>
                <span style={label.hasStart ? styles.value : styles.placeholder}>
                    <RollingFieldValue value={validDay(value?.[0])?.startOf('day').valueOf()} modalOpen={modalOpen}>{label.start}</RollingFieldValue>
                </span>
                <span aria-hidden="true" style={styles.arrow}>→</span>
                <span style={label.hasEnd ? styles.value : styles.placeholder}>
                    <RollingFieldValue value={validDay(value?.[1])?.startOf('day').valueOf()} modalOpen={modalOpen}>{label.end}</RollingFieldValue>
                </span>
            </span>
        );
    }
    if (mode !== 'multiple') return (
        <span style={hasValue ? styles.value : styles.placeholder}>
            <RollingFieldValue value={validDay(value)?.startOf('day').valueOf()} modalOpen={modalOpen}>{label}</RollingFieldValue>
        </span>
    );
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
    value: PropTypes.oneOfType([PropTypes.object, PropTypes.arrayOf(PropTypes.object)]),
    modalOpen: PropTypes.bool,
};

function DateTextInput({ label, text, date, active, onSelect, onType, onNormalize,
    onCompositionStart, onCompositionEnd, onEnter, composing, error, fieldInvalid, describedBy, disabled }) {
    const inputId = useId();
    return (
        <div className={`reserve-form-cal-part reserve-date-input${active ? ' is-active' : ''}`}
            style={error ? styles.triggerError : undefined}>
            {onSelect ? <button type="button" className="reserve-date-part-label" disabled={disabled}
                aria-label={`${label} ${date ? date.format('YYYY. M. D.') : '선택 안 함'}`}
                aria-pressed={active} onClick={onSelect}>{label}</button>
                : <label className="reserve-date-part-label" htmlFor={inputId}>{label}</label>}
            <input id={inputId} type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
                className="reserve-date-part-value" aria-label={`${label} 직접 입력`} disabled={disabled}
                aria-invalid={error ? true : fieldInvalid} aria-describedby={describedBy}
                placeholder="YYYY-MM-DD" value={text}
                onFocus={event => { onSelect?.(); event.currentTarget.select(); }}
                onChange={onType} onBlur={onNormalize}
                onCompositionStart={onCompositionStart} onCompositionEnd={onCompositionEnd}
                onKeyDown={event => {
                    if (event.key !== 'Enter') return;
                    event.stopPropagation();
                    if (composing || event.nativeEvent.isComposing || event.keyCode === 229) return;
                    event.preventDefault();
                    onEnter();
                }} />
        </div>
    );
}

DateTextInput.propTypes = {
    label: PropTypes.string.isRequired, text: PropTypes.string.isRequired,
    date: PropTypes.object, active: PropTypes.bool, onSelect: PropTypes.func,
    onType: PropTypes.func.isRequired, onNormalize: PropTypes.func.isRequired,
    onCompositionStart: PropTypes.func.isRequired, onCompositionEnd: PropTypes.func.isRequired,
    onEnter: PropTypes.func.isRequired, composing: PropTypes.bool,
    error: PropTypes.string, fieldInvalid: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
    describedBy: PropTypes.string, disabled: PropTypes.bool,
};

const FormDatePickerBase = ({
    mode = 'single',
    value,
    onChange,
    onBlur,
    onFocus,
    placeholder,
    disabled = false,
    disabledDate,
    format = 'YYYY-MM-DD',
    style,
    id,
    className = '',
    allowEmpty = [false, false],
    highlightHolidays = false,
    'aria-describedby': describedBy,
    'aria-invalid': ariaInvalid,
}) => {
    const { status } = Form.Item.useStatus();
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => initialMonthFor(mode, value).startOf('month'));
    // 공휴일(빨간날)은 서버 HolidayService 가 준다. 받기 전·실패 시에는 빈 집합이라 예전처럼 일요일만 빨갛다.
    // 기본은 꺼 두고 호출부가 켠다 — 단위 테스트·미리보기에서 공통 입력이 네트워크를 부르지 않게.
    const holidays = useHolidayDates(month.format('YYYY-MM'), open && highlightHolidays);
    const [draftSingle, setDraftSingle] = useState(() => validDay(value));
    const [draftMultiple, setDraftMultiple] = useState(() => validDays(value));
    const draftMultipleRef = useRef(draftMultiple);
    const [draftRange, setDraftRange] = useState(() => [validDay(value?.[0]), validDay(value?.[1])]);
    const [rangePart, setRangePart] = useState(0);
    const [typedDates, setTypedDates] = useState(() => pickerInputTexts(mode, value));
    const typedDatesRef = useRef(typedDates);
    const composingRef = useRef(new Set());
    const [composingParts, setComposingParts] = useState([false, false]);
    const hintId = useId();
    const touchRef = useRef(null);
    const inputState = typedDateState(mode, typedDates, new Set([0, 1].filter(part => composingParts[part])), disabledDate);
    const hasInputError = inputState.errors.some(Boolean) || composingParts.some(Boolean);
    const rangeLabels = Array.isArray(placeholder) ? placeholder : ['시작일', '종료일'];

    const selectedKeys = useMemo(() => {
        if (mode === 'range') return new Set(draftRange.map(dayKey).filter(Boolean));
        if (mode === 'multiple') return new Set([...draftMultiple, draftSingle].map(dayKey).filter(Boolean));
        return new Set([dayKey(draftSingle)].filter(Boolean));
    }, [draftMultiple, draftRange, draftSingle, mode]);

    const setInputTexts = texts => {
        typedDatesRef.current = texts;
        setTypedDates(texts);
    };
    const setMultipleDates = dates => {
        draftMultipleRef.current = dates;
        setDraftMultiple(dates);
    };
    const updateTypedDraft = (texts, part) => {
        const next = typedDateState(mode, texts, composingRef.current, disabledDate);
        if (mode === 'range') setDraftRange(next.dates);
        else setDraftSingle(next.dates[0]);
        if (next.dates[part]) setMonth(next.dates[part].startOf('month'));
    };
    const typeDate = (part, text) => {
        if (disabled) return;
        const next = [...typedDatesRef.current];
        next[part] = text;
        setInputTexts(next);
        updateTypedDraft(next, part);
    };
    const startComposition = part => {
        composingRef.current.add(part);
        setComposingParts([0, 1].map(index => composingRef.current.has(index)));
        updateTypedDraft(typedDatesRef.current, part);
    };
    const finishComposition = (part, text) => {
        composingRef.current.delete(part);
        setComposingParts([0, 1].map(index => composingRef.current.has(index)));
        typeDate(part, text);
    };
    const normalizeDateText = part => {
        const next = typedDateState(mode, typedDatesRef.current, composingRef.current, disabledDate);
        if (!next.dates[part]) return;
        setInputTexts(typedDatesRef.current.map((text, index) => index === part ? dateText(next.dates[part]) : text));
    };
    const selectRangePart = part => {
        setRangePart(part);
        const date = draftRange[part] ?? draftRange[1 - part];
        if (date) setMonth(date.startOf('month'));
    };

    const openPicker = () => {
        if (disabled) return;
        setInputTexts(pickerInputTexts(mode, value));
        composingRef.current.clear();
        setComposingParts([false, false]);
        setMonth(initialMonthFor(mode, value).startOf('month'));
        if (mode === 'range') {
            const next = [validDay(value?.[0]), validDay(value?.[1])];
            setDraftRange(next);
            setRangePart(next[0] && !next[1] ? 1 : 0);
        } else if (mode === 'multiple') {
            setMultipleDates(validDays(value));
            setDraftSingle(null);
        } else {
            setDraftSingle(validDay(value));
        }
        setOpen(true);
    };

    const closePicker = () => {
        composingRef.current.clear();
        setComposingParts([false, false]);
        setOpen(false);
        onBlur?.();
    };

    const isDateDisabled = date => Boolean(disabledDate?.(date)) || (
        mode === 'range' && rangePart === 1 && Boolean(draftRange[0])
        && date.isBefore(draftRange[0], 'day')
    );

    const pickDate = date => {
        if (disabled || isDateDisabled(date)) return;
        if (mode === 'single') {
            setDraftSingle(date);
            onChange?.(date);
            closePicker();
            return;
        }

        if (mode === 'multiple') {
            const candidate = typedDateState(mode, typedDatesRef.current, composingRef.current, disabledDate).dates[0];
            setMultipleDates(toggleDate(addDate(draftMultipleRef.current, candidate), date));
            setDraftSingle(null);
            setInputTexts(['']);
            return;
        }

        const next = pickRangeDate(draftRange, date, rangePart, setRangePart);
        const texts = [...typedDatesRef.current];
        texts[rangePart] = dateText(next[rangePart]);
        if (rangePart === 0 && parseTypedDate(texts[1])?.isBefore(date, 'day')) texts[1] = '';
        setInputTexts(texts);
        updateTypedDraft(texts, rangePart);
    };

    const clearValue = () => {
        if (disabled) return;
        if (mode === 'range') onChange?.(null);
        else if (mode === 'multiple') onChange?.([]);
        else onChange?.(null);
        closePicker();
    };

    const commitDraft = () => {
        if (disabled || !open || composingRef.current.size) return;
        const next = typedDateState(mode, typedDatesRef.current, composingRef.current, disabledDate);
        if (next.errors.some(Boolean)) return;
        if (mode === 'range') {
            if (!canCommitRange(next.dates, allowEmpty)) return;
            onChange?.(next.dates);
        } else if (mode === 'multiple') onChange?.(addDate(draftMultipleRef.current, next.dates[0]));
        else {
            if (!next.dates[0]) return;
            onChange?.(next.dates[0]);
        }
        closePicker();
    };

    const addTypedDate = () => {
        if (disabled || composingRef.current.size) return;
        const next = typedDateState(mode, typedDatesRef.current, composingRef.current, disabledDate);
        if (next.errors[0] || !next.dates[0]) return;
        setMultipleDates(addDate(draftMultipleRef.current, next.dates[0]));
        setDraftSingle(null);
        setInputTexts(['']);
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
            cell, mode, disabledDate: isDateDisabled, selectedKeys, draftRange, holidays,
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
    const fieldInvalid = ariaInvalid ?? (isError || undefined);
    const iconColor = resolveIconColor(disabled, isError, hasValue);
    const inputDescribedBy = [describedBy, hintId].filter(Boolean).join(' ');
    const renderDateInput = (part, label, onSelect) => <DateTextInput key={part}
        label={label} text={typedDates[part]} date={mode === 'range' ? draftRange[part] : draftSingle}
        active={mode === 'range' && rangePart === part} onSelect={onSelect} disabled={disabled}
        onType={event => {
            if (event.nativeEvent.isComposing && !composingRef.current.has(part)) startComposition(part);
            typeDate(part, event.target.value);
        }}
        onNormalize={() => normalizeDateText(part)}
        onCompositionStart={() => startComposition(part)}
        onCompositionEnd={event => finishComposition(part, event.currentTarget.value)}
        onEnter={mode === 'multiple' ? addTypedDate : commitDraft} composing={composingParts[part]}
        error={inputState.errors[part]} fieldInvalid={fieldInvalid} describedBy={inputDescribedBy} />;

    return (
        <>
            <button
                id={typeof id === 'string' ? id : undefined}
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-describedby={describedBy}
                className={`rsv-tap-btn reserve-cal-trigger reserve-form-date-trigger ${className}`.trim()}
                onClick={openPicker}
                onFocus={onFocus}
                onBlur={() => { if (!open) onBlur?.(); }}
                style={{
                    ...styles.trigger,
                    ...(disabled ? styles.triggerDisabled : null),
                    ...(isError ? styles.triggerError : null),
                    ...style,
                }}
            >
                <TriggerLabel mode={mode} label={label} hasValue={hasValue} value={value} modalOpen={open} />
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
                {mode === 'range' ? <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0, ...styles.rangeChoice }}
                    aria-label="선택할 날짜 종류">
                    {[0, 1].map(part => renderDateInput(part, rangeLabels[part], () => selectRangePart(part)))}
                </fieldset> : <div style={{ marginBottom: 14 }}>
                    {renderDateInput(0, mode === 'multiple' ? '추가할 날짜' : '날짜')}
                </div>}

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

                <p id={hintId} className="reserve-date-input-hint" style={inputState.errors.some(Boolean) ? { color: colors.error.main } : undefined}>
                    {inputState.errors.find(Boolean) || '2026-10-08 또는 20261008처럼 입력하거나 달력에서 골라주세요.'}
                </p>
                <div style={{ ...styles.footer, ...(mode === 'single' ? { justifyContent: 'flex-end' } : null) }}>
                    {mode !== 'single' && <Button variant="ghost-sm" size="sm" onClick={clearValue} disabled={disabled}>전체 해제</Button>}
                    <ModalActions onCancel={closePicker} onConfirm={commitDraft}
                        disabled={disabled || hasInputError || !rangeCanCommit || (mode === 'single' && !draftSingle)} confirmText="선택 완료" />
                </div>
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
    onFocus: PropTypes.func,
    placeholder: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
    disabled: PropTypes.bool,
    disabledDate: PropTypes.func,
    format: PropTypes.string,
    style: PropTypes.object,
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    className: PropTypes.string,
    multiple: PropTypes.bool,
    highlightHolidays: PropTypes.bool,
    'aria-describedby': PropTypes.string,
    'aria-invalid': PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
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
        transition: `all ${transitions.fast} ${transitions.easing}`,
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
        flexWrap: 'wrap', gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${colors.border.light}`,
    },
    visuallyHiddenHeader: { height: 0, margin: 0, overflow: 'hidden' },
    visuallyHidden: {
        position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
        overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
    },
};

export default FormDatePicker;
