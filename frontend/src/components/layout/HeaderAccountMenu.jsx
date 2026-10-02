import React from 'react';
import { Dropdown, Typography } from 'antd';
import {
    CalendarOutlined,
    ExclamationCircleOutlined,
    HeartOutlined,
    LogoutOutlined,
    PlusOutlined,
    ScheduleOutlined,
    SettingOutlined,
    ShopOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import useMessage from '../../hooks/useMessage';
import { API_ENDPOINTS } from '../../constants';
import { USER_ROLE_LABELS, hasOwnerAccess } from '../../constants/roles';
import { colors, fontWeight, radius } from '../../styles/tokens';
import Avatar from '../common/Avatar';

const { Text } = Typography;

/** 로그인한 사용자에게만 필요한 Dropdown·메뉴·아이콘 묶음. Header에서 지연 로딩한다. */
const HeaderAccountMenu = () => {
    const navigate = useNavigate();
    const { user, isLoggingOut, setLoggingOut } = useAuthStore();
    const { message } = useMessage();

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setLoggingOut(true);
        const dismissProgress = message.loading('로그아웃하는 중입니다.', 0);
        let serverLogoutFailed = false;
        try {
            // 로그아웃은 더 이상 토큰이 필요 없는 단방향 요청이다. 401 refresh를 시도하거나
            // 공용 30초 제한까지 기다리면 사용자에게 "로그아웃이 멈춘 것"처럼 보인다.
            await api.post(API_ENDPOINTS.AUTH.LOGOUT, undefined, { timeout: 8000, skipAuthRefresh: true });
        } catch {
            // 서버 응답이 없더라도 이 기기의 세션·개인 캐시는 즉시 정리한다.
            serverLogoutFailed = true;
        } finally {
            dismissProgress?.();
            useAuthStore.getState().logout();
            // 로그아웃 → 홈. 로고로 홈에 갈 때와 같은 방향(왼쪽에서)으로 돌아간다.
            navigate('/', { replace: true, state: { reserveRouteMotion: 'from-left' } });
            if (serverLogoutFailed) {
                message.warning('이 기기에서 로그아웃했습니다. 서버 연결은 확인하지 못했습니다.');
            } else {
                message.success('성공적으로 로그아웃되었습니다.');
            }
        }
    };

    const getMenuItems = () => {
        if (user?.termsAgreed === false) {
            return [
                {
                    key: 'terms-notice',
                    icon: <ExclamationCircleOutlined style={{ color: colors.warning?.main || '#faad14' }} />,
                    label: '서비스 이용 동의 필요',
                    onClick: () => navigate('/signup/social'),
                },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: isLoggingOut ? '로그아웃 중…' : '로그아웃', danger: true, disabled: isLoggingOut, onClick: handleLogout },
            ];
        }

        const items = [
            {
                key: 'profile-info',
                label: (
                    <div style={{ padding: '8px 4px' }}>
                        <Text strong style={{ fontSize: 15 }}>{user?.name || '사용자'}님</Text>
                        <div style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>{user?.email}</div>
                        <div style={{ fontSize: 11, color: colors.primary.main, marginTop: 3, fontWeight: fontWeight.semibold }}>
                            {USER_ROLE_LABELS[user?.role] || user?.role}
                        </div>
                    </div>
                ),
                disabled: false,
                onClick: () => navigate('/my-page'),
            },
            { type: 'divider' },
            { key: 'my-reservations', icon: <CalendarOutlined />, label: '내 예약 확인', onClick: () => navigate('/my-reservations') },
            { key: 'my-favorites', icon: <HeartOutlined />, label: '즐겨찾기', onClick: () => navigate('/my-favorites') },
        ];

        if (user?.role === 'ADMIN') {
            items.push(
                { type: 'divider' },
                { key: 'admin', icon: <SettingOutlined />, label: '관리자 패널', onClick: () => navigate('/admin') },
            );
        }

        if (hasOwnerAccess(user?.role)) {
            items.push(
                { key: 'business', icon: <ScheduleOutlined />, label: '사업자 패널', onClick: () => navigate('/business') },
                { type: 'divider' },
                { key: 'my-stores', icon: <ShopOutlined />, label: '내 가게 관리', onClick: () => navigate('/my-stores') },
                { key: 'store-register', icon: <PlusOutlined />, label: '새 가게 등록', onClick: () => navigate('/store/register') },
            );
        }

        items.push(
            { type: 'divider' },
            { key: 'logout', icon: <LogoutOutlined />, label: isLoggingOut ? '로그아웃 중…' : '로그아웃', danger: true, disabled: isLoggingOut, onClick: handleLogout },
        );
        return items;
    };

    return (
        <Dropdown
            menu={{ items: getMenuItems() }}
            placement="bottomRight"
            arrow={{ pointAtCenter: true }}
            trigger={['click']}
            getPopupContainer={(trigger) => trigger.parentElement ?? document.body}
        >
            <button
                type="button"
                className="reserve-header-avatar-trigger"
                style={styles.trigger}
                aria-label="내 계정 메뉴 열기"
                aria-haspopup="menu"
            >
                <Avatar src={user?.profileImageUrl || user?.profileImage} size={36} />
            </button>
        </Dropdown>
    );
};

const styles = {
    trigger: {
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 0,
        padding: 0,
        background: 'transparent',
        borderRadius: radius.full,
        transition: 'opacity 0.2s',
    },
};

export default HeaderAccountMenu;
