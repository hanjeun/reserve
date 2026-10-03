/** RESERVE time fields share the calendar modal surface and keep Dayjs form values. */
import React, { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { Form, Modal } from 'antd';
import { ClockCircleOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import Button from './Button';
import ModalActions from './ModalActions';
import TimeWheelColumn, { TIME_WHEEL_ROW_HEIGHT } from './TimeWheelColumn';
import { colors, field, fontSize, fontWeight } from '../../styles/tokens';

const PERIODS = [{ value: 0, label: '오전' }, { value: 1, label: '오후' }];
const HOURS = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: String(index + 1).padStart(2, '0') }));
const MINUTES = Array.from({ length: 60 }, (_, index) => ({ value: index, label: String(index).padStart(2, '0') }));
const validTime = value => (dayjs.isDayjs(value) && value.isValid() ? value : null);
const timeKey = value => validTime(value)?.format('HH:mm') ?? '';
const initialTime = () => dayjs('2000-01-01T09:00:00');
const sortTimes = values => [...values].sort((left, right) => timeKey(left).localeCompare(timeKey(right)));
const uniqueTimes = values => sortTimes([...new Map(values.filter(validTime).map(item => [timeKey(item), item])).values()]);
const parseTypedTime = text => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim()) ?? /^(\d{2})(\d{2})$/.exec(text.trim());
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    return { hour: Number(match[1]), minute: Number(match[2]) };
};

const FormTimePickerBase = ({
    mode, controlled, value, defaultValue, onChange, onBlur, onFocus, placeholder,
    disabled = false, format = 'HH:mm', style, id, className = '',
    'aria-describedby': describedBy, 'aria-invalid': ariaInvalid,
}) => {
    const { status } = Form.Item.useStatus();
    const [internalValue, setInternalValue] = useState(defaultValue);
    const currentValue = controlled ? value : internalValue;
    const [open, setOpen] = useState(false);
    const [cursor, setCursor] = useState(initialTime);
    const [rangePart, setRangePart] = useState(0);
    const [draftRange, setDraftRange] = useState([null, null]);
    const [typedRange, setTypedRange] = useState(['', '']);
    const [draftMultiple, setDraftMultiple] = useState([]);
    const hintId = useId();
    const rangeLabels = Array.isArray(placeholder) ? placeholder : ['시작 시간', '종료 시간'];
    let dialogLabel = '시간 선택';
    if (mode === 'range') dialogLabel = '시간 범위 선택';
    else if (mode === 'multiple') dialogLabel = '회차 시각 선택';
    const inputErrors = mode === 'range'
        ? typedRange.map((text, part) => Boolean(text || draftRange[part]) && !parseTypedTime(text)) : [];
    const hasInputError = inputErrors.some(Boolean);

    const closePicker = () => {
        setOpen(false);
        onBlur?.();
    };

    const commitValue = next => {
        if (!controlled) setInternalValue(next);
        onChange?.(next, Array.isArray(next) ? next.map(item => item.format(format)) : next?.format(format) ?? '');
        closePicker();
    };

    const openPicker = () => {
        if (disabled) return;
        if (mode === 'range') {
            const next = [validTime(currentValue?.[0]), validTime(currentValue?.[1])];
            const part = next[0] && !next[1] ? 1 : 0;
            setDraftRange(next);
            setTypedRange(next.map(timeKey));
            setRangePart(part);
            setCursor(next[part] ?? next[0] ?? next[1] ?? initialTime());
        } else if (mode === 'multiple') {
            const next = uniqueTimes(Array.isArray(currentValue) ? currentValue : []);
            setDraftMultiple(next);
            setCursor(next[0] ?? initialTime());
        } else {
            setCursor(validTime(currentValue) ?? initialTime());
        }
        setOpen(true);
    };

    const changeTime = next => {
        setCursor(next);
        if (mode === 'range') {
            setDraftRange(current => current.map((item, index) => index === rangePart ? next : item));
            setTypedRange(current => current.map((text, index) => index === rangePart ? timeKey(next) : text));
        }
    };

    const changeHour = hour => changeTime(cursor.hour((hour % 12) + (cursor.hour() >= 12 ? 12 : 0)).second(0));
    const changePeriod = period => changeTime(cursor.hour((cursor.hour() % 12) + period * 12).second(0));
    const changeMinute = minute => changeTime(cursor.minute(minute).second(0));

    const selectRangePart = part => {
        setRangePart(part);
        setCursor(draftRange[part] ?? draftRange[1 - part] ?? initialTime());
    };

    const typeRangeTime = (part, text) => {
        setTypedRange(current => current.map((item, index) => index === part ? text : item));
        const parsed = parseTypedTime(text);
        if (!parsed) return;
        const next = (draftRange[part] ?? cursor).hour(parsed.hour).minute(parsed.minute).second(0).millisecond(0);
        setCursor(next);
        setDraftRange(current => current.map((item, index) => index === part ? next : item));
    };

    const normalizeRangeText = part => {
        if (!parseTypedTime(typedRange[part])) return;
        setTypedRange(current => current.map((text, index) => index === part ? timeKey(draftRange[part]) : text));
    };

    const confirm = () => {
        if (hasInputError) return;
        if (mode === 'multiple') {
            commitValue(draftMultiple);
        } else if (mode === 'range') {
            const next = [...draftRange];
            next[rangePart] = cursor;
            const otherPart = 1 - rangePart;
            if (!next[otherPart]) {
                setDraftRange(next);
                setTypedRange(next.map(timeKey));
                setRangePart(otherPart);
                // This is only a visible wheel starting point; the other end still needs confirmation.
                setCursor(cursor.hour(Math.max(0, Math.min(23, cursor.hour() + (otherPart === 1 ? 1 : -1)))));
                return;
            }
            // Compare the time of day, not the date attached to a Dayjs value.
            commitValue(sortTimes(next));
        } else {
            commitValue(cursor);
        }
    };

    const clearValue = () => commitValue(mode === 'multiple' ? [] : null);
    const hasValue = mode === 'single' ? Boolean(validTime(currentValue)) : Array.isArray(currentValue) && currentValue.some(validTime);
    const isError = status === 'error';
    const fieldInvalid = ariaInvalid ?? (isError || undefined);
    let iconColor = field.placeholderColor;
    if (disabled) iconColor = colors.gray[400];
    else if (isError && !hasValue) iconColor = colors.error.main;
    else if (hasValue) iconColor = colors.primary.main;
    let label = validTime(currentValue)?.format(format) ?? placeholder ?? '시간 선택';
    if (mode === 'multiple') {
        const times = uniqueTimes(Array.isArray(currentValue) ? currentValue : []);
        label = placeholder ?? '회차 시각 선택';
        if (times.length) {
            label = times[0].format(format);
            if (times.length > 1) label += ` 외 ${times.length - 1}개`;
        }
    }
    let hintText = '위아래로 밀거나 스크롤해서 선택해주세요.';
    if (hasInputError) hintText = '00:00부터 23:59까지 입력해주세요. 예: 1052 또는 10:52';
    else if (mode === 'range') hintText = '숫자를 눌러 입력하거나 위아래로 밀어 선택해주세요.';

    return (
        <>
            <button
                id={typeof id === 'string' ? id : undefined}
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-describedby={describedBy}
                className={`rsv-tap-btn reserve-cal-trigger reserve-form-date-trigger reserve-form-time-trigger ${className}`.trim()}
                onClick={openPicker}
                onBlur={() => { if (!open) onBlur?.(); }}
                onFocus={onFocus}
                style={{ ...styles.trigger, ...(disabled ? styles.disabled : null), ...(isError ? styles.error : null), ...style }}
            >
                {mode === 'range' ? (
                    <span style={styles.rangeTrigger}>
                        {[0, 1].map((part, index) => (
                            <React.Fragment key={part}>
                                {index === 1 && <span aria-hidden="true" style={{ color: field.placeholderColor }}>→</span>}
                                <span style={currentValue?.[part] ? styles.value : styles.placeholder}>
                                    {validTime(currentValue?.[part])?.format(format) ?? rangeLabels[part]}
                                </span>
                            </React.Fragment>
                        ))}
                    </span>
                ) : <span style={hasValue ? styles.value : styles.placeholder}>{label}</span>}
                <ClockCircleOutlined aria-hidden="true" style={{ color: iconColor, fontSize: field.iconSize }} />
            </button>

            <Modal
                open={open}
                onCancel={closePicker}
                footer={null}
                title={<span style={styles.visuallyHidden}>{dialogLabel}</span>}
                styles={{ header: styles.hiddenHeader }}
                centered width={356} destroyOnHidden closable={false}
                rootClassName="reserve-cal-modal reserve-time-modal"
            >
                {mode === 'range' ? (
                    <fieldset className="reserve-time-parts" aria-label="편집할 시간">
                        {[0, 1].map(part => (
                            <div key={part} className={`reserve-form-cal-part ${rangePart === part ? 'is-active' : ''}`}
                                style={inputErrors[part] ? styles.error : undefined}>
                                <button type="button" className="reserve-time-part-label"
                                    aria-label={`${rangeLabels[part]} ${draftRange[part]?.format(format) ?? '선택 전'}`}
                                    aria-pressed={rangePart === part} onClick={() => selectRangePart(part)}>
                                    {rangeLabels[part]}
                                </button>
                                <input type="text" inputMode="numeric" maxLength={5} autoComplete="off"
                                    className="reserve-time-part-value" aria-label={`${rangeLabels[part]} 직접 입력`}
                                    aria-invalid={inputErrors[part] ? true : fieldInvalid}
                                    aria-describedby={inputErrors[part] ? [describedBy, hintId].filter(Boolean).join(' ') : describedBy}
                                    placeholder="선택 전" value={typedRange[part]}
                                    onFocus={event => { selectRangePart(part); event.currentTarget.select(); }}
                                    onChange={event => typeRangeTime(part, event.target.value)}
                                    onBlur={() => normalizeRangeText(part)}
                                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); confirm(); } }} />
                            </div>
                        ))}
                    </fieldset>
                ) : <div className="reserve-time-heading">{dialogLabel}</div>}

                <div className="reserve-time-wheels" style={{ '--reserve-time-row-height': `${TIME_WHEEL_ROW_HEIGHT}px` }}>
                    <TimeWheelColumn label="오전·오후" options={PERIODS} value={cursor.hour() >= 12 ? 1 : 0} onChange={changePeriod} />
                    <TimeWheelColumn label="시" options={HOURS} value={cursor.hour() % 12 || 12} onChange={changeHour} />
                    <TimeWheelColumn label="분" options={MINUTES} value={cursor.minute()} onChange={changeMinute} />
                </div>
                <p id={hintId} className="reserve-time-hint" style={hasInputError ? { color: colors.error.main } : undefined}>
                    {hintText}
                </p>

                {mode === 'multiple' && (
                    <div className="reserve-time-sessions">
                        <Button variant="secondary" size="sm" onClick={() => setDraftMultiple(current => uniqueTimes([...current, cursor]))}>
                            {cursor.format(format)} 회차 추가
                        </Button>
                        <fieldset className="reserve-time-session-list" aria-label="선택한 회차">
                            {draftMultiple.map(time => (
                                <button key={timeKey(time)} type="button" className="rsv-tap-btn reserve-time-session"
                                    aria-label={`${time.format(format)} 회차 삭제`}
                                    onClick={() => setDraftMultiple(current => current.filter(item => timeKey(item) !== timeKey(time)))}>
                                    {time.format(format)} <CloseOutlined aria-hidden="true" />
                                </button>
                            ))}
                        </fieldset>
                    </div>
                )}

                <div className="reserve-time-footer">
                    <Button variant="ghost-sm" size="sm" onClick={clearValue}>전체 해제</Button>
                    <ModalActions onCancel={closePicker} onConfirm={confirm}
                        disabled={hasInputError || (mode === 'multiple' && draftMultiple.length === 0)}
                        confirmText={mode === 'range' && !draftRange[1 - rangePart] ? '다음' : '선택 완료'} />
                </div>
            </Modal>
        </>
    );
};

const FormTimePicker = ({ multiple = false, ...props }) => (
    <FormTimePickerBase {...props} controlled={Object.hasOwn(props, 'value')} mode={multiple ? 'multiple' : 'single'} />
);
FormTimePicker.RangePicker = props => <FormTimePickerBase {...props} controlled={Object.hasOwn(props, 'value')} mode="range" />;

const sharedPropTypes = {
    value: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    defaultValue: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    onChange: PropTypes.func, onBlur: PropTypes.func, onFocus: PropTypes.func,
    placeholder: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
    disabled: PropTypes.bool, format: PropTypes.string, style: PropTypes.object,
    id: PropTypes.string, className: PropTypes.string, multiple: PropTypes.bool,
};
FormTimePicker.propTypes = sharedPropTypes;
FormTimePicker.RangePicker.propTypes = sharedPropTypes;

const styles = {
    trigger: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        width: '100%', height: field.height, padding: '0 11px', boxSizing: 'border-box',
        border: 'none', borderRadius: field.radius, background: field.bg,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    },
    disabled: { background: colors.gray[100], cursor: 'not-allowed', opacity: 0.7 },
    error: { boxShadow: field.errorRing },
    value: { minWidth: 0, color: colors.text.primary, fontSize: fontSize.lg, fontWeight: fontWeight.regular },
    placeholder: { minWidth: 0, color: field.placeholderColor, fontSize: fontSize.lg, fontWeight: fontWeight.regular },
    rangeTrigger: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, fontVariantNumeric: 'tabular-nums' },
    hiddenHeader: { height: 0, margin: 0, overflow: 'hidden' },
    visuallyHidden: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 },
};

export default FormTimePicker;
