/**
 * RESERVE - 이미지 유틸리티
 */

import { API_BASE_URL } from '../constants/api';

/**
 * 이미지 URL을 전체 경로로 변환
 * @param {string} url - 이미지 경로
 * @param {string} fallback - 기본 이미지 URL
 * @returns {string} 전체 이미지 URL
 */
const FALLBACKS = {
    thumbnail:  'https://placehold.co/300x200?text=No+Image',
    detail:     'https://placehold.co/800x450?text=No+Image',
    profile:    'https://placehold.co/80x80?text=User',
};

export const getImageUrl = (url, fallback = FALLBACKS.thumbnail) => {
    if (!url) return fallback;
    return url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
};

/** 상세 이미지 (큰 크기) */
export const getDetailImageUrl = (url) => getImageUrl(url, FALLBACKS.detail);

/** 썸네일 이미지 */
export const getThumbnailUrl = (url) => getImageUrl(url, FALLBACKS.thumbnail);

/** 프로필 이미지 */
export const getProfileImageUrl = (url) => getImageUrl(url, FALLBACKS.profile);
