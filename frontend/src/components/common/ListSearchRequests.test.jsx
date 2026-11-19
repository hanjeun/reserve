import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import useQueryParamsState from '../../hooks/useQueryParamState';
import ListSearchField from './ListSearchField';

it('확정 검색·페이지 초기화를 한 요청으로 처리하고 새로고침은 적용된 조건을 유지해요', async () => {
    const read = vi.fn(async params => params);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 180_000, gcTime: Infinity } } });
    function List() {
        const [params, patch] = useQueryParamsState({ search: '', page: '1' }, { privateKeys: ['search'] });
        const location = useLocation();
        const result = useQuery({ queryKey: ['list-search-test', params], queryFn: () => read(params) });
        return <><ListSearchField value={params.search} onSubmit={search => patch({ search, page: '1' })} />
            <button onClick={() => result.refetch()}>새로고침</button><output>{location.search}</output></>;
    }
    const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/?page=3']}><List /></MemoryRouter></QueryClientProvider>);
    try {
        await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: '카페' } });
        expect(read).toHaveBeenCalledTimes(1);
        fireEvent.submit(input.closest('form'));
        await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
        expect(read).toHaveBeenLastCalledWith({ search: '카페', page: '1' });
        expect(screen.getByRole('status')).toHaveTextContent('?page=1');
        fireEvent.change(input, { target: { value: '미확정' } });
        fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
        await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
        expect(read).toHaveBeenLastCalledWith({ search: '카페', page: '1' });
        expect(input).toHaveValue('미확정');
        fireEvent.change(input, { target: { value: '공방' } }); fireEvent.submit(input.closest('form'));
        await waitFor(() => expect(read).toHaveBeenCalledTimes(4));
        fireEvent.change(input, { target: { value: '카페' } }); fireEvent.submit(input.closest('form'));
        expect(input).toHaveValue('카페');
        expect(read).toHaveBeenCalledTimes(4);
    } finally { view.unmount(); client.clear(); }
});
