import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AppFooter from './Footer';

vi.mock('../common/InquiryModal', () => ({ default: ({ open, onClose }) => open
    ? <div role="dialog" aria-label="문의하기"><button onClick={onClose}>닫기</button></div> : null }));

const LocationProbe = () => {
    const { pathname } = useLocation();
    return <output aria-label="현재 경로">{pathname}</output>;
};

describe('AppFooter', () => {
    it('opens and closes the inquiry modal without navigating away', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/']}><AppFooter /><LocationProbe /></MemoryRouter>);
        await user.click(screen.getByRole('button', { name: '문의하기' }));
        expect(await screen.findByRole('dialog', { name: '문의하기' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '닫기' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/');
    });

    it('keeps the content-source notice alongside the other legal links', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/']}><AppFooter /><LocationProbe /></MemoryRouter>);

        await user.click(screen.getByRole('button', { name: '콘텐츠 출처·권리' }));

        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/content-sources');
    });

    it.each([
        ['사용자 이용안내', '/guide/user'],
        ['사업자 이용안내', '/guide/business'],
        ['공통 이용안내', '/guide/common'],
    ])('links %s from the guide column', async (name, destination) => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/']}><AppFooter /><LocationProbe /></MemoryRouter>);

        expect(screen.getByText('이용안내')).toBeInTheDocument();
        expect(screen.queryByText('서비스', { exact: true })).toBeNull();
        await user.click(screen.getByRole('button', { name }));

        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent(destination);
    });
});
