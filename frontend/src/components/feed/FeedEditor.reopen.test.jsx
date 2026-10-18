import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp, ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import FeedEditor from './FeedEditor';

const api = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock('../../services/feedService', () => ({ default: api }));
vi.mock('../../hooks/feedQueries', () => ({ feedKeys: { detail: id => ['feed', 'detail', id] },
    useFeedProfile: () => ({ data: { publicId: 'fixture', nickname: '점검 계정' }, isPending: false }) }));
vi.mock('./FeedComposer', () => ({ default: ({ post }) => <output data-testid="draft">{post?.content}|{post?.revision}</output> }));

function Harness() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>초안 열기</button>
        <FeedEditor open={open} post={{ id: 8, state: 'DRAFT', revision: 0 }} config={{ enabled: true }}
            onClose={() => setOpen(false)} onSaved={() => setOpen(false)} /></>;
}

it('can reopen the same draft repeatedly and loads the latest saved content each time', async () => {
    const user = userEvent.setup();
    api.detail.mockResolvedValue({ id: 8, state: 'DRAFT', revision: 0, content: '첫 초안' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><MemoryRouter><ConfigProvider locale={koKR} theme={{ token: { motion: false } }}><AntApp><Harness /></AntApp></ConfigProvider></MemoryRouter></QueryClientProvider>);
    for (let revision = 0; revision < 3; revision++) {
        api.detail.mockResolvedValue({ id: 8, state: 'DRAFT', revision, content: `저장한 초안 ${revision}` });
        await user.click(screen.getByRole('button', { name: '초안 열기' }));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(within(dialog).getByTestId('draft')).toHaveTextContent(`저장한 초안 ${revision}|${revision}`));
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        await user.click(within(dialog).getByRole('button', { name: '닫기', exact: true }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
    expect(api.detail).toHaveBeenCalledTimes(3); client.clear();
});
