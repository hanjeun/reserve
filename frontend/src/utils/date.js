/**
 * RESERVE - 날짜/시간 유틸리티
 */

import dayjs from 'dayjs';

/**
 * 날짜를 YYYY-MM-DD 형식으로 포맷
 */
export const formatDate = (date) => {
    if (!date) return '';
    return dayjs(date).format('YYYY-MM-DD');
};

/**
 * 시간을 HH:mm 형식으로 포맷
 */
export const formatTime = (time) => {
    if (!time) return '';
    // HH:mm:ss 형식이면 HH:mm만 추출
    if (typeof time === 'string' && time.includes(':')) {
        return time.substring(0, 5);
    }
    return dayjs(time).format('HH:mm');
};

/**
 * 시간을 HH:mm:ss 형식으로 포맷 (API 전송용)
 */
export const formatTimeForApi = (time) => {
    if (!time) return '';
    if (dayjs.isDayjs(time)) {
        return time.format('HH:mm:ss');
    }
    return time;
};

/**
 * 날짜와 시간을 합쳐서 표시
 */
export const formatDateTime = (date, time) => {
    const formattedDate = formatDate(date);
    const formattedTime = formatTime(time);
    return `${formattedDate} ${formattedTime}`;
};

/**
 * 상대적 시간 표시 (예: 3일 전)
 */
export const formatRelativeTime = (date) => {
    if (!date) return '';
    const now = dayjs();
    const target = dayjs(date);
    const diffDays = now.diff(target, 'day');
    
    if (diffDays === 0) return '오늘';
    if (diffDays === 1) return '어제';
    if (diffDays < 7) return `${diffDays}일 전`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}개월 전`;
    return `${Math.floor(diffDays / 365)}년 전`;
};

/**
 * 현재 시간 이후인지 체크
 */
export const isAfterNow = (date, time) => {
    const now = dayjs();
    const target = dayjs(`${formatDate(date)} ${formatTime(time)}`);
    return target.isAfter(now);
};

/**
 * 오늘인지 체크
 */
export const isToday = (date) => {
    return dayjs(date).isSame(dayjs(), 'day');
};
