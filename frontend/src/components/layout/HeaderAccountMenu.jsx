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
    const { user } = useAuthStore();
    const { message } = useMessage();

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
        if (user?.termsAgreed === false) {
            return [
                {
                    key: 'terms-notice',
                    icon: <ExclamationCircleOutlined style={{ color: colors.warning?.main || '#faad14' }} />,
                    label: '서비스 이용 동의 필요',
                    onClick: () => navigate('/signup/social'),
                },
                { type: 'divider' },
                { key: 'logout', icon: <LogoutOutlined />, label: '로그아웃', danger: true, onClick: handleLogout },
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
            items.push({ type: 'divider' });
            items.push({ key: 'admin', icon: <SettingOutlined />, label: '관리자 패널', onClick: () => navigate('/admin') });
        }

        if (hasOwnerAccess(user?.role)) {
            items.push({ key: 'business', icon: <ScheduleOutlined />, label: '사업자 패널', onClick: () => navigate('/business') });
            items.push({ type: 'divider' });
            items.push({ key: 'my-stores', icon: <ShopOutlined />, label: '내 가게 관리', onClick: () => navigate('/my-stores') });
            items.push({ key: 'store-register', icon: <PlusOutlined />, label: '새 가게 등록', onClick: () => navigate('/store/register') });
        }

        items.push(
            { type: 'divider' },
            { key: 'logout', icon: <LogoutOutlined />, label: '로그아웃', danger: true, onClick: handleLogout },
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
