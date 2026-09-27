/**
 * RESERVE - 사용자 역할 상수
 * ※ 백엔드 Role enum과 정확히 일치: USER / BUSINESS / ADMIN
 */

export const USER_ROLES = {
    USER:     'USER',
    BUSINESS: 'BUSINESS',
    ADMIN:    'ADMIN',
};

export const USER_ROLE_LABELS = {
    USER:     '일반 회원',
    BUSINESS: '파트너 사장님',
    ADMIN:    '시스템 관리자',
};

/**
 * 사업자 이상 권한 체크 (BUSINESS, ADMIN)
 */
export const hasOwnerAccess = (role) => {
    return role === USER_ROLES.BUSINESS || role === USER_ROLES.ADMIN;
};

export const hasAdminAccess = (role) => {
    return role === USER_ROLES.ADMIN;
};
