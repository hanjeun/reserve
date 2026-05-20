import React, { useEffect, useRef } from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { useMessage } from '../hooks';

/**
 * 인증 및 역할 기반 라우트 가드
 * - 비로그인 → /login 리다이렉트
 * - 약관 미동의 → /signup/social 강제 이동
 * - 역할 불일치 → / 리다이렉트 + 메시지 1회
 */
const PrivateRoute = ({ allowedRoles }) => {
    const { isLoggedIn, user, isLoggingOut } = useAuthStore();
    const location = useLocation();
    const { message } = useMessage();
    const notifiedRef = useRef(false);

    const roleBlocked = isLoggedIn
        && allowedRoles?.length > 0
        && !allowedRoles.includes(user?.role);

    // 소셜 로그인 약관 미동의 체크
    const termsNotAgreed = isLoggedIn && user?.termsAgreed === false;

    useEffect(() => {
        if (roleBlocked && !notifiedRef.current) {
            notifiedRef.current = true;
            message.error('접근 권한이 없습니다.');
        }
    }, [roleBlocked, message]);

    if (isLoggingOut) return <Navigate to="/" replace />;

    if (!isLoggedIn) {
        return <Navigate to="/login" replace state={{ from: location, prevented: true }} />;
    }

    // 약관 미동의 유저 — 소셜 동의 페이지로 강제 이동
    if (termsNotAgreed) {
        return <Navigate to="/signup/social" replace />;
    }

    if (roleBlocked) return <Navigate to="/" replace />;

    return <Outlet />;
};

export default PrivateRoute;
