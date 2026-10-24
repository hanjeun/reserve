import React, { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import SessionQueryProvider from '../SessionQueryProvider';
import { ServiceAdmissionRequiredError } from '../../../api/serviceAdmissionGate';

it('same query keys never reuse private cache or local state across account boundaries', async () => {
    const clients = [];
    const Probe = ({ owner }) => {
        const client = useQueryClient();
        if (!clients.includes(client)) clients.push(client);
        const [draft] = useState(owner);
        const { data } = useQuery({ queryKey: ['my-private-records'], queryFn: async () => owner });
        return <div>{data ?? 'loading'}:{draft}</div>;
    };
    const ui = owner => <SessionQueryProvider key={owner}><Probe owner={owner} /></SessionQueryProvider>;
    const view = render(ui('A'));
    await screen.findByText('A:A');
    view.rerender(ui('B'));
    expect(screen.queryByText('A:A')).toBeNull();
    await screen.findByText('B:B');
    // An old mutation callback can still run, but it only owns the old client.
    act(() => clients[0].setQueryData(['my-private-records'], 'late A'));
    await vi.waitFor(() => expect(screen.getByText('B:B')).toBeInTheDocument());
    expect(clients).toHaveLength(2);
});

it('an explicitly cancelled entry read stays cancelled rather than being retried in the background', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValue(new ServiceAdmissionRequiredError('입장 대기를 취소했어요.'));
    const Probe = () => {
        const { error } = useQuery({ queryKey: ['cancelled-entry-read'], queryFn: request });
        return <div role="status">{error?.message || 'loading'}</div>;
    };
    try {
        render(<SessionQueryProvider><Probe /></SessionQueryProvider>);
        await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
        expect(screen.getByRole('status')).toHaveTextContent('입장 대기를 취소했어요.');
        expect(request).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
});
