import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteStoreModal } from './MyStores';

const service = vi.hoisted(() => ({ getClosureReadiness: vi.fn() }));
vi.mock('../../services/storeService', () => ({ default: service }));
vi.mock('../../components/common', () => ({
    PageContainer: () => null, Button: () => null, Card: () => null, DataState: () => null,
    StoreCardSkeleton: () => null, ModalLoading: () => <div role="status">확인 중</div>,
}));
vi.mock('antd', () => ({
    Modal: ({ open, children, okButtonProps }) => <section role="dialog" data-open={String(open)}>{children}
        <button type="button" disabled={okButtonProps.disabled}>영업 종료</button></section>,
    Typography: { Title: () => null, Text: ({ children }) => <span>{children}</span> },
    Flex: ({ children }) => <div>{children}</div>,
}));

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { resolve, promise };
};
const modal = (open, storeId) => <DeleteStoreModal open={open} storeId={storeId} storeName="가게" />;

describe('store closure readiness scope', () => {
    beforeEach(() => service.getClosureReadiness.mockReset());

    it('cannot close before an explicit current readiness result exists', async () => {
        const request = deferred();
        service.getClosureReadiness.mockReturnValueOnce(request.promise);
        render(modal(true, 12));
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '영업 종료' })).toBeDisabled();
        await act(async () => { request.resolve({ canClose: true }); });
        expect(screen.getByRole('button', { name: '영업 종료' })).toBeEnabled();
    });

    it('rechecks on reopen without remounting the modal or reusing the prior permission', async () => {
        service.getClosureReadiness.mockResolvedValueOnce({ canClose: true });
        const rendered = render(modal(true, 12));
        await screen.findByText('미결 운영 항목이 없습니다');
        const dialog = screen.getByRole('dialog');
        rendered.rerender(modal(false, null));
        const next = deferred();
        service.getClosureReadiness.mockReturnValueOnce(next.promise);
        rendered.rerender(modal(true, 12));
        expect(screen.getByRole('dialog')).toBe(dialog);
        expect(screen.getByRole('button', { name: '영업 종료' })).toBeDisabled();
        await act(async () => { next.resolve({ unresolvedReservations: 0 }); });
        expect(screen.getByText('영업 종료 준비 상태를 확인하지 못했습니다')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '영업 종료' })).toBeDisabled();
    });

    it('ignores the old store result when a different store is now being checked', async () => {
        const old = deferred();
        const next = deferred();
        service.getClosureReadiness.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
        const rendered = render(modal(true, 12));
        rendered.rerender(modal(true, 13));
        await act(async () => { old.resolve({ canClose: true }); });
        expect(screen.getByRole('button', { name: '영업 종료' })).toBeDisabled();
        await act(async () => { next.resolve({ canClose: false, unresolvedReservations: 1 }); });
        expect(screen.getByText('먼저 처리해야 할 항목이 1건 있습니다')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '영업 종료' })).toBeDisabled();
    });
});
