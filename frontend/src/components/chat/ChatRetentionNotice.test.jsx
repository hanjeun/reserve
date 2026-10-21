import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import ChatRetentionNotice from './ChatRetentionNotice';

const fixture = vi.hoisted(() => ({ closePanel: vi.fn() }));
vi.mock('../../store/useMessengerStore', () => ({ default: selector => selector(fixture) }));
beforeEach(() => vi.clearAllMocks());

const show = () => render(<MemoryRouter initialEntries={['/messages']}><Routes>
    <Route path="/messages" element={<ChatRetentionNotice visible />} />
    <Route path="/privacy" element={<h1>개인정보 처리방침</h1>} />
</Routes></MemoryRouter>);

it('closes the messenger panel and opens the policy through the current SPA', async () => {
    show();
    const link = screen.getByRole('link', { name: '보관 정책 보기' });
    expect(link).not.toHaveAttribute('target');
    fireEvent.click(link);
    expect(await screen.findByRole('heading', { name: '개인정보 처리방침' })).toBeInTheDocument();
    expect(fixture.closePanel).toHaveBeenCalledOnce();
});

it('leaves the current panel alone when the user explicitly chooses a modified link click', () => {
    show();
    fireEvent.click(screen.getByRole('link', { name: '보관 정책 보기' }), { ctrlKey: true });
    expect(fixture.closePanel).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '보관 정책 보기' })).toBeInTheDocument();
});
