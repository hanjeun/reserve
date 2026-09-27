import React from 'react';
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { App, ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useMessage from '../useMessage';

const withdrawalContent = '로그인·연락·위치 정보는 제거되고 계정은 즉시 사용할 수 없게 됩니다. 거래·환불·분쟁 대응에 필요한 기록은 비식별 상태로 보존됩니다. 정말 탈퇴하시겠습니까?';

afterEach(() => vi.restoreAllMocks());

describe('useMessage confirmation contract', () => {
    const mockHook = () => {
        const confirm = vi.fn(() => ({ destroy: vi.fn() }));
        const context = { message: {}, modal: { confirm }, notification: {} };
        vi.spyOn(App, 'useApp').mockReturnValue(context);
        return { ...renderHook(useMessage), confirm, context };
    };

    it('keeps the existing notification APIs and default confirmation labels', () => {
        const { result, confirm, context } = mockHook();
        expect(result.current.message).toBe(context.message);
        expect(result.current.modal).toBe(context.modal);
        expect(result.current.notification).toBe(context.notification);
        result.current.confirm({ content: '계속하시겠습니까?' });
        expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
            title: '확인', okText: '확인', cancelText: '취소', centered: true,
            rootClassName: 'reserve-confirm-root', content: '계속하시겠습니까?',
        }));
    });

    it('preserves caller options and callbacks without invoking destructive actions', () => {
        const { result, confirm } = mockHook();
        const onOk = vi.fn();
        const onCancel = vi.fn();
        const okButtonProps = { danger: true, disabled: true };
        const options = {
            title: '회원 탈퇴', content: withdrawalContent, okText: '탈퇴하기', cancelText: '취소',
            rootClassName: 'custom-root', className: 'custom-dialog', centered: false,
            width: 480, okButtonProps, onOk, onCancel,
        };
        result.current.confirm(options);
        const received = confirm.mock.calls[0][0];
        expect(received).toEqual(expect.objectContaining({ ...options, content: expect.anything(), rootClassName: 'reserve-confirm-root custom-root' }));
        expect(received.okButtonProps).toBe(okButtonProps);
        expect(received.onOk).toBe(onOk);
        expect(received.onCancel).toBe(onCancel);
        expect(onOk).not.toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
        expect(options.rootClassName).toBe('custom-root');
    });

    it('keeps all withdrawal wording and splits only sentence boundaries', () => {
        const { result, confirm } = mockHook();
        result.current.confirm({ content: withdrawalContent });
        const content = confirm.mock.calls[0][0].content;
        const { container } = render(<>{content}</>);
        expect(Array.from(container.children).map(element => element.textContent)).toEqual([
            '로그인·연락·위치 정보는 제거되고 계정은 즉시 사용할 수 없게 됩니다.',
            '거래·환불·분쟁 대응에 필요한 기록은 비식별 상태로 보존됩니다.',
            '정말 탈퇴하시겠습니까?',
        ]);
    });

    it('passes explicitly composed React content through unchanged', () => {
        const { result, confirm } = mockHook();
        const content = <section><p>안내</p><input aria-label="확인 문구" /></section>;
        result.current.confirm({ content });
        expect(confirm.mock.calls[0][0].content).toBe(content);
    });
});

describe('real AntD confirmation structure', () => {
    it('renders withdrawal text and cancel/confirm controls without creating any account request', async () => {
        const onOk = vi.fn();
        const onCancel = vi.fn();
        function Fixture() {
            const { confirm } = useMessage();
            return <button onClick={() => confirm({
                title: '회원 탈퇴', content: withdrawalContent, okText: '탈퇴하기', cancelText: '취소',
                okButtonProps: { danger: true }, onOk, onCancel,
            })}>안내 열기</button>;
        }
        render(<ConfigProvider theme={{ token: { motion: false } }}><App><Fixture /></App></ConfigProvider>);
        fireEvent.click(screen.getByRole('button', { name: '안내 열기' }));
        const dialog = await screen.findByRole('dialog', { name: '회원 탈퇴' });
        expect(dialog.closest('.ant-modal-root')).toHaveClass('reserve-confirm-root');
        expect(dialog.querySelector('.ant-modal-container')).not.toBeNull();
        expect(dialog.querySelector('.ant-modal-content')).toBeNull();
        expect(dialog.querySelector('.ant-modal-confirm-paragraph')).not.toBeNull();
        expect(dialog.querySelector('.ant-modal-confirm-content')).toHaveTextContent('정말 탈퇴하시겠습니까?');
        await waitFor(() => expect(within(dialog).getByRole('button', { name: '탈퇴하기' })).toBeVisible());
        expect(onOk).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(onOk).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalledOnce();
    });
});
