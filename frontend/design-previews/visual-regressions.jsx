// Actual visual components with inert callbacks. No auth, drafts, saves or withdrawal APIs.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider, Form, theme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import StoreForm from '../src/components/store/StoreForm';
import useMessage from '../src/hooks/useMessage';
import { rawColors, field, fieldPx } from '../src/styles/tokens';
import '../src/index.css';

const noop = () => {};
const withdrawalText = '로그인·연락·위치 정보는 제거되고 계정은 즉시 사용할 수 없게 됩니다. 거래·환불·분쟁 대응에 필요한 기록은 비식별 상태로 보존됩니다. 정말 탈퇴하시겠습니까?';
const demoValues = {
    name: '예시 공방', bookingType: 'SLOT', serviceDomain: 'PERFORMANCE', category: '공방',
    reservationSlotMinutes: 30, phone: '02-0000-0000', noShowDeposit: 0,
    nearbyRadiusKm: 1, fullRefundDays: 3, partialRefundDays: 1, partialRefundRate: 50,
    bookingDeadlineHours: 1, paymentTimeoutMinutes: 10, emailNotificationEnabled: true,
};

function Surface() {
    const [form] = Form.useForm();
    const { confirm } = useMessage();
    const mode = new URLSearchParams(window.location.search).get('mode') === 'create' ? 'create' : 'edit';
    const open = long => confirm({
        title: '회원 탈퇴',
        icon: <ExclamationCircleOutlined style={{ color: rawColors.error }} />,
        content: long ? Array.from({ length: 15 }, () => withdrawalText).join(' ') : withdrawalText,
        okText: '탈퇴하기', cancelText: '취소', okButtonProps: { danger: true },
        onOk: noop,
    });
    return <>
        <header style={{ height: 64, paddingInline: 16, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--c-border-light)', position: 'sticky', top: 0, background: 'var(--c-bg-paper)', zIndex: 10 }}>
            <span className="reserve-header-logo-wordmark" style={{ color: 'var(--c-primary)' }}>RESERVE</span>
        </header>
        <aside style={{ padding: '12px 16px', fontSize: 12 }}>
            <p>시각 fixture · 실제 저장/탈퇴/자동 임시저장 없음. 주소를 입력하거나 파일을 올리지 않습니다.</p>
            <button type="button" onClick={() => open(false)}>탈퇴 모달 미리보기</button>{' '}
            <button type="button" onClick={() => open(true)}>긴 본문 미리보기</button>
        </aside>
        <StoreForm mode={mode} form={form} initialValues={demoValues}
            onSubmit={noop} onSaveDraft={noop} onMainImageChange={noop} onDetailImagesChange={noop}
            onPreview={noop} onPreviewClickCapture={event => event.preventDefault()} />
    </>;
}

export default function Preview() {
    const [dark, setDark] = useState(false);
    const config = {
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: rawColors.primary, borderRadius: fieldPx(field.radius), fontFamily: 'inherit', colorError: dark ? '#ff6b76' : '#f04452' },
        components: { Select: { colorBgContainer: dark ? '#23262b' : rawColors.gray[50], colorBgElevated: dark ? '#1e2126' : '#fff', optionSelectedBg: dark ? '#2d3138' : rawColors.gray[200] } },
    };
    // data-theme is on html so the portal receives the same CSS variable theme.
    React.useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
    return <ConfigProvider locale={koKR} theme={config}><AntApp>
        <main style={{ minHeight: '100svh', background: 'var(--c-bg-paper)', color: 'var(--c-text-primary)' }}>
            <button type="button" onClick={() => setDark(value => !value)} style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 20 }}>테마 전환</button>
            <Surface />
        </main>
    </AntApp></ConfigProvider>;
}

createRoot(document.getElementById('root')).render(<MemoryRouter><Preview /></MemoryRouter>);
