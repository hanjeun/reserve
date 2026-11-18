import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ReservationChallengeModal from './ReservationChallengeModal';

vi.mock('../common/ResponsiveModal', () => ({ default: ({ open, children, footer }) => open ? <div>{children}{footer}</div> : null }));

const challenge = { siteKey: 'test-site', action: 'reservation_submit', requestId: 'sample-request' };

afterEach(() => { delete window.turnstile; });

it('loads the challenge only when shown and binds the widget to the current request', async () => {
    const widget = { render: vi.fn().mockReturnValue('widget-1'), remove: vi.fn() };
    window.turnstile = widget;
    const onToken = vi.fn();
    const onClose = vi.fn();
    const view = render(<ReservationChallengeModal open={false} challenge={challenge} onToken={onToken} onClose={onClose} />);
    expect(widget.render).not.toHaveBeenCalled();
    view.rerender(<ReservationChallengeModal open challenge={challenge} onToken={onToken} onClose={onClose} />);
    await waitFor(() => expect(widget.render).toHaveBeenCalledOnce());
    const options = widget.render.mock.calls[0][1];
    expect(options).toMatchObject({ action: challenge.action, cData: challenge.requestId, 'response-field': false });
    act(() => options.callback('sample-proof'));
    expect(onToken).toHaveBeenCalledExactlyOnceWith('sample-proof');
    view.unmount();
    expect(widget.remove).toHaveBeenCalledExactlyOnceWith('widget-1');
    options.callback('late-proof');
    expect(onToken).toHaveBeenCalledOnce();
});

it('offers a fresh widget when the previous proof expires', async () => {
    const widget = { render: vi.fn().mockReturnValueOnce('widget-1').mockReturnValueOnce('widget-2'), remove: vi.fn() };
    window.turnstile = widget;
    render(<ReservationChallengeModal open challenge={challenge} onToken={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(widget.render).toHaveBeenCalledOnce());
    act(() => widget.render.mock.calls[0][1]['expired-callback']());
    expect(screen.getByRole('alert')).toHaveTextContent('예약 확인을 완료하지 못했어요.');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect(widget.render).toHaveBeenCalledTimes(2));
    expect(widget.remove).toHaveBeenCalledWith('widget-1');
});
