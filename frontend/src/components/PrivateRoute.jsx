import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

/**
 * 인증 및 역할 기반 라우트 가드
 *
 * @param {string[]} [allowedRoles] - 허용할 역할 목록 (없으면 로그인만 체크)
 *
 * 사용 예:
 *   <PrivateRoute />                              → 로그인 유저만
 *   <PrivateRoute allowedRoles={['BUSINESS','ADMIN']} /> → 사업자/관리자만
 */
const PrivateRoute = ({ allowedRoles }) => {
    const { isLoggedIn, user, isLoggingOut } = useAuthStore();
    const location = useLocation();

    // 로그아웃 처리 중
    if (isLoggingOut) {
        return <Navigate to="/" replace />;
    }

    // 비로그인
    if (!isLoggedIn) {
        return <Navigate to="/login" replace state={{ from: location, prevented: true }} />;
    }

    // 역할 제한이 있고, 현재 유저 역할이 허용 목록에 없으면
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};

export default PrivateRoute;
