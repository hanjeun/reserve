import React, { useEffect, useRef } from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { useMessage } from '../hooks';
import { saveRedirect, pathFromLocation } from '../utils/redirect';

/**
 * 인증 및 역할 기반 라우트 가드
 * - 비로그인 → /login 리다이렉트 (로그인 후 다시 이 페이지로 돌아오도록 경로를 저장)
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
        // 로그인 후 원래 가려던 페이지로 돌아가기 위해 경로를 저장해둔다.
        // state.from도 그대로 남기지만(이메일 로그인용), 소셜 로그인은 window.location.href로
        // 전체 페이지를 넘기므로 React Router의 state가 살아남지 못한다 — 그래서
        // sessionStorage에도 같이 저장해서 이메일/소셜 둘 다 같은 경로를 쓰게 한다.
        saveRedirect(pathFromLocation(location));
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
