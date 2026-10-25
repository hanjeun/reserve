import { StrictMode, useEffect, useState } from 'react';
import { App as AntApp, ConfigProvider } from 'antd';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ReservationEntryNotice from './ReservationEntryNotice';

it('survives the real App maxCount overflow once and stops restoring after the form leaves admission', async () => {
    let messageApi;
    const expiresAt = Date.now() + 180000;
    function Page() {
        const { message } = AntApp.useApp();
        const [active, setActive] = useState(true);
        useEffect(() => { messageApi = message; }, [message]);
        return <>
            <input aria-label="작성 중인 예약" defaultValue="예약 내용 유지" />
            {active && <ReservationEntryNotice expiresAt={expiresAt} />}
            <button onClick={() => {
                for (let number = 1; number <= 3; number += 1) message.info({ key: `ordinary:${number}`, content: `일반 안내 ${number}`, duration: 0 });
            }}>다른 안내 세 개</button>
            <button onClick={() => setActive(false)}>입장 안내 종료</button>
        </>;
    }
    const view = render(<StrictMode><ConfigProvider theme={{ token: { motion: false } }}>
        <AntApp message={{ maxCount: 3 }}><Page /></AntApp>
    </ConfigProvider></StrictMode>);
    const firstTimer = await screen.findByRole('timer');
    const input = screen.getByRole('textbox');
    const open = vi.spyOn(messageApi, 'open');
    fireEvent.click(screen.getByRole('button', { name: '다른 안내 세 개' }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(firstTimer.isConnected).toBe(false);
    expect(screen.getAllByRole('timer')).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(screen.getByText('일반 안내 3')).toBeInTheDocument();
    await act(async () => { await Promise.resolve(); });
    expect(open).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '입장 안내 종료' }));
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull());
    expect(open).toHaveBeenCalledOnce();
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('예약 내용 유지');
    open.mockRestore(); view.unmount();
});
