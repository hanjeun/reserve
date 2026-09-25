import React, { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import SessionQueryProvider from '../SessionQueryProvider';

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
