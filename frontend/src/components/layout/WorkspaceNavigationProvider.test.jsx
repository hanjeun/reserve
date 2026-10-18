import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceNavigationProvider from './WorkspaceNavigationProvider';
import useWorkspaceDraftGuard from '../../hooks/useWorkspaceDraftGuard';
import useWorkspaceNavigate from '../../hooks/useWorkspaceNavigate';

const messages = vi.hoisted(() => ({ confirm: vi.fn(), info: vi.fn() }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ confirm: messages.confirm, message: { info: messages.info } }) }));

function Draft({ busy = false, allowUnload = false }) {
    const [text, setText] = useState('');
    useWorkspaceDraftGuard({ dirty: Boolean(text), busy, allowUnload, onDiscard: () => setText('') });
    const navigate = useWorkspaceNavigate();
    const location = useLocation();
    return <><input aria-label="작업 초안" value={text} onChange={event => setText(event.target.value)} />
        <button onClick={() => navigate('/business?tab=analytics&statisticsRange=90d#work')}>통계로</button>
        <button onClick={() => navigate(-1)}>뒤로</button>
        <Link to="/admin?tab=feed-reports&reportMode=comments#review" state={{ source: 'saved-work' }}>신고로</Link>
        <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>
        <output data-testid="state">{location.state?.source}</output></>;
}
function setup(busy = false, allowUnload = false) {
    return render(<BrowserRouter><WorkspaceNavigationProvider><Draft busy={busy} allowUnload={allowUnload} /></WorkspaceNavigationProvider></BrowserRouter>);
}
const lastConfirmation = () => messages.confirm.mock.calls.at(-1)[0];

beforeEach(() => {
    window.history.replaceState({ idx: 0, key: 'workspace-start', usr: null }, '', '/business?tab=chat-intro');
    messages.confirm.mockReset().mockImplementation(() => ({ destroy: vi.fn() }));
    messages.info.mockReset();
});

describe('workspace user navigation and draft boundary', () => {
    it('keeps the draft and URL on cancel, then clears it and preserves query/hash on approval', async () => {
        const user = userEvent.setup(); setup();
        await user.type(screen.getByLabelText('작업 초안'), '작성 중');
        await user.click(screen.getByRole('button', { name: '통계로' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/business?tab=chat-intro');
        await act(async () => lastConfirmation().onCancel());
        expect(screen.getByLabelText('작업 초안')).toHaveValue('작성 중');
        await user.click(screen.getByRole('button', { name: '통계로' }));
        await act(async () => lastConfirmation().onOk());
        expect(screen.getByTestId('location')).toHaveTextContent('/business?tab=analytics&statisticsRange=90d#work');
        expect(screen.getByLabelText('작업 초안')).toHaveValue('');
    });

    it('replays a guarded Link with its original state and does not ask twice', async () => {
        const user = userEvent.setup(); setup();
        await user.type(screen.getByLabelText('작업 초안'), '메모');
        await user.click(screen.getByRole('link', { name: '신고로' }));
        expect(messages.confirm).toHaveBeenCalledTimes(1);
        await act(async () => lastConfirmation().onOk());
        expect(screen.getByTestId('location')).toHaveTextContent('/admin?tab=feed-reports&reportMode=comments#review');
        expect(screen.getByTestId('state')).toHaveTextContent('saved-work');
        expect(messages.confirm).toHaveBeenCalledTimes(1);
    });

    it('blocks menu-like navigation and reload while a save is pending', async () => {
        const user = userEvent.setup(); setup(true);
        await user.click(screen.getByRole('button', { name: '통계로' }));
        expect(messages.confirm).not.toHaveBeenCalled();
        expect(messages.info).toHaveBeenCalledTimes(1);
        expect(window.location.search).toBe('?tab=chat-intro');
        const unload = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(true);
    });

    it('keeps the BrowserRouter screen mounted through Back cancellation and replays after approval', async () => {
        const user = userEvent.setup(); setup();
        await user.click(screen.getByRole('button', { name: '통계로' }));
        await user.type(screen.getByLabelText('작업 초안'), '뒤로 가기 전 초안');
        await user.click(screen.getByRole('button', { name: '뒤로' }));
        await waitFor(() => expect(messages.confirm).toHaveBeenCalledTimes(1));
        expect(window.location.search).toBe('?tab=analytics&statisticsRange=90d');
        await act(async () => lastConfirmation().onCancel());
        expect(screen.getByLabelText('작업 초안')).toHaveValue('뒤로 가기 전 초안');
        await user.click(screen.getByRole('button', { name: '뒤로' }));
        await waitFor(() => expect(messages.confirm).toHaveBeenCalledTimes(2));
        await act(async () => lastConfirmation().onOk());
        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/business?tab=chat-intro'));
        expect(screen.getByLabelText('작업 초안')).toHaveValue('');
    });

    it('allows a payment SDK document redirect while still blocking user menu navigation', async () => {
        const user = userEvent.setup(); setup(true, true);
        const unload = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(false);
        await user.click(screen.getByRole('button', { name: '통계로' }));
        expect(window.location.search).toBe('?tab=chat-intro');
        expect(messages.info).toHaveBeenCalledTimes(1);
    });

    it('cancels a pending confirmation when the authenticated provider is unmounted', async () => {
        const view = setup();
        fireEvent.change(screen.getByLabelText('작업 초안'), { target: { value: '이전 계정 초안' } });
        fireEvent.click(screen.getByRole('button', { name: '통계로' }));
        const confirmation = lastConfirmation();
        view.unmount();
        await act(async () => confirmation.onOk());
        expect(window.location.search).toBe('?tab=chat-intro');
    });
});
