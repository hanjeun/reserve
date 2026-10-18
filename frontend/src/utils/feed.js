import { versionedApiUrl } from '../api/apiVersion';
import { REGION_OPTIONS } from '../constants/regions';

export const FEED_PAGE_SIZE = 12;
export const FEED_CONTENT_LIMIT = 2000;
export const FEED_REPORT_REASONS = [
    { value: 'SPAM', label: '광고·스팸' }, { value: 'ABUSE', label: '욕설·괴롭힘' },
    { value: 'PRIVACY', label: '개인정보·권리 침해' }, { value: 'OTHER', label: '그 밖의 문제' },
];
export const feedRegion = value => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().replace(/\s+/g, ' ');
    const [province, district, ...rest] = normalized.split(' ');
    return normalized.length <= 50 && !rest.length && REGION_OPTIONS.some(item => item.value === province)
        && (!district || /^[가-힣A-Za-z0-9·-]+$/.test(district)) ? normalized : null;
};
export const feedPage = value => {
    const number = Number(value ?? 1);
    return Number.isSafeInteger(number) && number > 0 && number <= 10000 ? number : 1;
};
export const feedTotal = result => {
    const total = result?.page?.totalElements ?? result?.totalElements ?? 0;
    return Number.isSafeInteger(total) && total >= 0 ? total : 0;
};
export const feedDate = value => {
    if (!value) return '';
    // 서버의 LocalDateTime은 운영 저장 관례인 UTC이며 오프셋 없는 값에만 Z를 붙인다.
    const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
    }).format(date);
};
export const feedRelativeDate = value => {
    if (!value) return '';
    const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return '방금';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}일`;
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short' }).format(date);
};
export const feedMediaUrl = value => {
    if (!value) return undefined;
    if (value.startsWith('blob:')) return value;
    if (!/^\/api\/(?:v1\/)?(?:feed\/media\/\d+|store-news\/media\/\d+|admin\/feed\/(?:reports|comment-reports|comments)\/\d+\/images\/\d+|admin\/promotions\/\d+\/images\/\d+)$/.test(value)) return undefined;
    return `${import.meta.env.VITE_API_BASE_URL || ''}${versionedApiUrl(value)}`;
};
export const postPath = id => `/feed/posts/${id}`;
export const authorPath = id => `/feed/u/${encodeURIComponent(id)}`;
export const feedStateLabel = state => ({ DRAFT: '임시저장', HIDDEN: '관리자 숨김', DELETED: '삭제됨' }[state]);
