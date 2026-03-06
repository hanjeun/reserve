/**
 * RESERVE - 일반 유틸리티
 */

/**
 * 금액을 원화 형식으로 포맷
 */
export const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '0원';
    return `${Number(amount).toLocaleString('ko-KR')}원`;
};
