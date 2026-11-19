const format = (value, pattern) => value?.format?.(pattern);

export function bookingOpeningFromForm(values) {
    if (values.bookingOpeningMode !== 'SCHEDULED') return null;
    const date = format(values.bookingOpeningDate, 'YYYY-MM-DD');
    const time = format(values.bookingOpeningTime, 'HH:mm');
    const from = format(values.bookingOpeningPeriod?.[0], 'YYYY-MM-DD');
    const to = format(values.bookingOpeningPeriod?.[1], 'YYYY-MM-DD');
    return { opensAt: date && time ? `${date}T${time}:00` : null, from, to };
}

export function bookingOpeningTimestamp(opening) {
    return opening?.opensAt ? Date.parse(`${opening.opensAt}+09:00`) : NaN;
}
