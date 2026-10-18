export const STORE_NEWS_TYPES = [
    { value: 'NEWS', label: '소식' }, { value: 'NOTICE', label: '공지' },
    { value: 'EVENT', label: '행사' }, { value: 'BENEFIT', label: '혜택' },
];
export const STORE_NEWS_STATES = [
    { value: 'ALL', label: '전체 상태' }, { value: 'DRAFT', label: '임시저장' },
    { value: 'PUBLISHED', label: '게시됨' }, { value: 'ENDED', label: '기간 종료' },
    { value: 'HIDDEN', label: '관리자 숨김' },
];
export const storeNewsTypeLabel = value => STORE_NEWS_TYPES.find(item => item.value === value)?.label || '소식';
export const storeNewsPeriodLabel = value => ({ UPCOMING: '진행 예정', ONGOING: '진행 중', ENDED: '기간 종료' }[value] || '');
export const timedStoreNews = value => ['EVENT', 'BENEFIT'].includes(value);
export const storeNewsExcerpt = value => {
    const text = (value || '').trim().replace(/\s+/g, ' ');
    const characters = Array.from(text);
    return characters.length > 160 ? `${characters.slice(0, 159).join('')}…` : text;
};
export const toKstInput = value => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
};
export const fromKstInput = value => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('기간을 다시 입력해주세요.');
    const date = new Date(`${value}:00+09:00`);
    if (Number.isNaN(date.getTime()) || toKstInput(date.toISOString()) !== value) throw new Error('기간을 다시 입력해주세요.');
    return date.toISOString();
};
export const previewStoreNewsPeriod = (type, startsAt, endsAt) => {
    if (!timedStoreNews(type) || !startsAt || !endsAt) return null;
    const now = Date.now();
    if (new Date(endsAt).getTime() <= now) return 'ENDED';
    return new Date(startsAt).getTime() > now ? 'UPCOMING' : 'ONGOING';
};

export const benefitReviewLabel = state => ({
    NONE: '혜택 미신청', DRAFT: '혜택 신청 초안', PENDING: '혜택 승인 대기', APPROVED: '혜택 승인', REJECTED: '혜택 반려',
}[state] || '혜택 신청 준비 중');
