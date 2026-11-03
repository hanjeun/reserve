import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import Privacy from './Privacy';

const state = vi.hoisted(() => ({ policies: [] }));
vi.mock('@tanstack/react-query', () => ({ useQuery: ({ queryKey: key }) => {
    const index = key[1] === 'chatRetentionPolicy' ? 0 : key[1] === 'waitingRetentionPolicy' ? 1
        : key[0] === 'store-news' ? 3 : key[2] === 'config' ? 4 : 2;
    return state.policies[index];
} }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../components/common', async () => ({
    DataState: (await import('../../components/common/DataState')).default,
    PageContainer: ({ children }) => <main>{children}</main>,
}));

beforeEach(() => {
    state.policies = Array.from({ length: 5 }, () => ({ data: { enabled: true }, isError: false, isFetching: false,
        refetch: vi.fn().mockResolvedValue({}) }));
});
const show = () => render(<MemoryRouter><Privacy /></MemoryRouter>);

it('uses the verified dispute committee, prosecution and police contact destinations', () => {
    show();
    expect(screen.getByRole('link', { name: 'kopico.go.kr' })).toHaveAttribute('href', 'https://kopico.go.kr/main/main.do');
    expect(screen.getByText('공소청')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1301' })).toHaveAttribute('href', 'tel:1301');
    expect(screen.getByRole('link', { name: 'ecrm.police.go.kr' })).toHaveAttribute('href', 'https://ecrm.police.go.kr/');
    expect(screen.queryByText('대검찰청 사이버범죄수사단')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'koprc.go.kr' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('reports simultaneous policy failures once, retains available policy text and retries the failed reads', async () => {
    state.policies[0].data = { noticePublishedAt: '2026-10-01T00:00:00Z', effectiveAt: '2026-10-08T00:00:00Z' };
    for (const index of [0, 2, 3, 4]) Object.assign(state.policies[index], { isError: true, error: { status: 503 } });
    show();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('최신 개인정보 안내를 확인하지 못했어요.');
    expect(screen.getByRole('alert')).toHaveTextContent('서버에서 요청을 처리하지 못했어요.');
    expect(screen.getByText(/보존기간 변경 고지:/)).toBeInTheDocument();
    expect(screen.getByText('피드·가게 소식의 공개 정보와 보관')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' })));
    for (const [index, policy] of state.policies.entries()) expect(policy.refetch).toHaveBeenCalledTimes(index === 1 ? 0 : 1);
});
