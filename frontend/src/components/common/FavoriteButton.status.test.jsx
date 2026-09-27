import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const favoriteService = vi.hoisted(() => ({ getStatus: vi.fn(), toggle: vi.fn() }));
vi.mock('../../services/favoriteService', () => ({ default: favoriteService }));
vi.mock('../../store/useAuthStore', () => ({ default: selector => (typeof selector === 'function' ? selector({ isLoggedIn: true }) : { isLoggedIn: true }) }));
vi.mock('../../hooks', () => ({ useMessage: () => ({ message: { success: vi.fn(), error: vi.fn() } }) }));

import FavoriteButton from './FavoriteButton';

const renderButton = (props = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <FavoriteButton storeId={7} {...props} />
        </QueryClientProvider>,
    );
};

describe('FavoriteButton when the favorite status is unknown', () => {
    beforeEach(() => {
        favoriteService.getStatus.mockReset();
        favoriteService.toggle.mockReset();
    });

    it('does not toggle after a failed status lookup and retries the lookup instead', async () => {
        // 서버 찜 API 는 현재 상태를 뒤집는 토글이다. 상태를 모르는 채로 토글하면 이미 찜한 가게를 해제할 수 있다.
        favoriteService.getStatus
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({ isFavorite: true });
        renderButton();

        const unknown = await screen.findByRole('button', { name: /상태를 확인하지 못했어요/ });
        expect(unknown).not.toHaveAttribute('aria-pressed');

        fireEvent.click(unknown);
        expect(favoriteService.toggle).not.toHaveBeenCalled();

        const known = await screen.findByRole('button', { name: '즐겨찾기 삭제' });
        expect(known).toHaveAttribute('aria-pressed', 'true');
        expect(favoriteService.getStatus).toHaveBeenCalledTimes(2);
    });

    it('blocks the toggle while the first lookup is still running', async () => {
        let resolve;
        favoriteService.getStatus.mockReturnValueOnce(new Promise(r => { resolve = r; }));
        renderButton();

        const pending = screen.getByRole('button', { name: '즐겨찾기 상태 확인 중' });
        expect(pending).toBeDisabled();
        fireEvent.click(pending);
        expect(favoriteService.toggle).not.toHaveBeenCalled();

        resolve({ isFavorite: false });
        await waitFor(() => expect(screen.getByRole('button', { name: '즐겨찾기 추가' })).toBeEnabled());
    });

    it('still toggles normally once the status is known from the list', async () => {
        favoriteService.toggle.mockReturnValue(new Promise(() => {}));
        renderButton({ initialStatus: false });
        fireEvent.click(screen.getByRole('button', { name: '즐겨찾기 추가' }));
        expect(favoriteService.getStatus).not.toHaveBeenCalled();
        // onMutate 가 진행 중인 조회를 취소(await)한 다음 틱에 토글을 보낸다.
        await waitFor(() => expect(favoriteService.toggle).toHaveBeenCalledWith(7));
    });

    it('draws the same heart without a button, lookup or toggle in ad previews', () => {
        const { container } = renderButton({ preview: true, appearance: 'plain' });
        expect(screen.queryByRole('button')).toBeNull();
        expect(container.querySelector('.reserve-favorite-button--preview')).toHaveAttribute('aria-hidden', 'true');
        expect(favoriteService.getStatus).not.toHaveBeenCalled();
        expect(favoriteService.toggle).not.toHaveBeenCalled();
    });
});
