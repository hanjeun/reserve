/**
 * RESERVE - 이미지 유틸리티
 */

import { API_BASE_URL } from '../constants/api';

/*
 * 외부 이미지 URL은 보존하고 로컬 업로드 경로에는 API 주소를 붙인다. 값이 없으면 대체 이미지를 반환한다.
 */
const FALLBACKS = {
    thumbnail:  'https://placehold.co/300x200?text=No+Image',
    detail:     'https://placehold.co/800x450?text=No+Image',
    profile:    'https://placehold.co/80x80?text=User',
};

export const getImageUrl = (url, fallback = FALLBACKS.thumbnail) => {
    if (!url) return fallback;
    // CloudFront URL, 소셜 로그인 이미지 등 절대 URL은 그대로
    if (url.startsWith('http')) return url;
    // 로컬 개발 환경 fallback (/uploads/xxx.jpg → API 서버에서 직접 서빙)
    return `${API_BASE_URL}${url}`;
};

/** 상세 이미지 (큰 크기) */
export const getDetailImageUrl = (url) => getImageUrl(url, FALLBACKS.detail);

/** 썸네일 이미지 */
export const getThumbnailUrl = (url) => getImageUrl(url, FALLBACKS.thumbnail);

/** 프로필 이미지 */
export const getProfileImageUrl = (url) => getImageUrl(url, FALLBACKS.profile);
