import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { Layout, Button, Space, Dropdown, Typography } from 'antd';
import {
    CalendarOutlined,
    LogoutOutlined,
    ShopOutlined,
    PlusOutlined,
    ScheduleOutlined,
    SettingOutlined,
    HeartOutlined,
} from '@ant-design/icons';
import { useMessage } from '../../hooks';
import { API_ENDPOINTS } from '../../constants';
import { USER_ROLE_LABELS, hasOwnerAccess } from '../../constants/roles';
import { colors, radius, shadows, heights, fontWeight } from '../../styles/tokens';
import Avatar from '../common/Avatar';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isLoggedIn } = useAuthStore();
    const { message } = useMessage();

    // RESERVE 로고 클릭: 홈이면 맨 위로 스크롤, 아니면 홈으로 이동
    const handleLogoClick = (e) => {
        e.preventDefault();
        if (location.pathname === '/') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            navigate('/');
        }
    };

    const handleLogout = async () => {
        try {
            await api.post(API_ENDPOINTS.AUTH.LOGOUT);
        } catch {
            // logout API 실패해도 클라이언트 상태는 정리
        } finally {
            useAuthStore.getState().logout();
            navigate('/', { replace: true });
            message.success('성공적으로 로그아웃되었습니다.');
        }
    };

    const getMenuItems = () => {
        const items = [
            {
                key: 'profile-info',
                label: (
                    <div style={{ padding: '8px 4px', cursor: 'pointer' }} onClick={() => navigate('/my-page')}>
                        <Text strong style={{ fontSize: 15 }}>{user?.name || '사용자'}님</Text>
                        <div style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>{user?.email}</div>
                        <div style={{ fontSize: 11, color: colors.primary.main, marginTop: 3, fontWeight: fontWeight.semibold }}>
                            {USER_ROLE_LABELS[user?.role] || user?.role}
                        </div>
                    </div>
                ),
                disabled: false,
            },
            { type: 'divider' },
            { key: 'my-reservations', icon: <CalendarOutlined />, label: '내 예약 확인', onClick: () => navigate('/my-reservations') },
            { key: 'my-favorites',    icon: <HeartOutlined />,    label: '즐겨찾기',    onClick: () => navigate('/my-favorites') },
        ];

        if (user?.role === 'ADMIN') {
            items.push({ type: 'divider' });
            items.push({ key: 'admin', icon: <SettingOutlined />, label: '관리자 패널', onClick: () => navigate('/admin') });
        }

        if (hasOwnerAccess(user?.role)) {
            items.push({ key: 'business', icon: <ScheduleOutlined />, label: '사업자 패널', onClick: () => navigate('/business') });
            items.push({ type: 'divider' });
            items.push({ key: 'my-stores', icon: <ShopOutlined />, label: '내 가게 관리', onClick: () => navigate('/my-stores') });
            items.push({ key: 'store-register', icon: <PlusOutlined />, label: '새 가게 등록', onClick: () => navigate('/store/register') });
        }

        items.push({ type: 'divider' }, { key: 'logout', icon: <LogoutOutlined />, label: '로그아웃', danger: true, onClick: handleLogout });
        return items;
    };

    return (
        <AntHeader style={styles.header}>
            <a href="/" onClick={handleLogoClick} style={styles.logo}>RESERVE</a>
            <Space size="middle">
                {isLoggedIn ? (
                    <Dropdown
                        menu={{ items: getMenuItems() }}
                        placement="bottomRight"
                        arrow={{ pointAtCenter: true }}
                        trigger={['click']}
                    >
                        <div style={styles.myPageTrigger}>
                            <Avatar src={user?.profileImage} size={36} />
                        </div>
                    </Dropdown>
                ) : (
                    <Space size={8}>
                        <Button type="text" onClick={() => navigate('/login')} style={styles.navBtn}>로그인</Button>
                        <Button type="primary" onClick={() => navigate('/signup')} style={styles.actionBtn}>시작하기</Button>
                    </Space>
                )}
            </Space>
        </AntHeader>
    );
};

const styles = {
    header: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        borderBottom: `1px solid ${colors.border.light}`,
        height: heights.header,
    },
    logo: {
        fontSize: 22,
        fontWeight: fontWeight.heavy,
        color: colors.primary.main,
        letterSpacing: '-0.8px',
        textDecoration: 'none',
        cursor: 'pointer',
    },
    myPageTrigger: { cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, transition: 'opacity 0.2s' },
    avatar: { backgroundColor: colors.primary.main, color: '#fff', boxShadow: shadows.avatar },
    navBtn: { color: colors.text.secondary, fontWeight: fontWeight.semibold, borderRadius: radius.md, height: heights.buttonMd, border: 'none' },
    actionBtn: { borderRadius: radius.md, fontWeight: fontWeight.semibold, backgroundColor: colors.primary.main, border: 'none', height: heights.buttonMd, padding: '0 20px' },
};

export default Header;
