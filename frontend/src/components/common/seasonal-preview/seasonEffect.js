const seoulDate = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
const effects = ['snowfall', 'spring', 'summer', 'autumn'];

export function getSeasonEffect(location = globalThis.location, date = new Date()) {
    if (['localhost', '127.0.0.1', '[::1]'].includes(location?.hostname)) {
        const preview = new URLSearchParams(location.search).get('season-preview');
        if (effects.includes(preview)) return preview;
    }
    const [month, day] = seoulDate.format(date).split('/').map(Number);
    const calendarDay = month * 100 + day;
    if (calendarDay >= 1215 || calendarDay <= 125) return 'snowfall';
    if (calendarDay >= 320 && calendarDay <= 430) return 'spring';
    if (calendarDay >= 715 && calendarDay <= 815) return 'summer';
    if (calendarDay >= 1015 && calendarDay <= 1125) return 'autumn';
    return null;
}
