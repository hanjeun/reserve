import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AppFooter from './Footer';

const LocationProbe = () => {
    const { pathname } = useLocation();
    return <output aria-label="현재 경로">{pathname}</output>;
};

describe('AppFooter', () => {
    it('keeps the content-source notice alongside the other legal links', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/']}><AppFooter /><LocationProbe /></MemoryRouter>);

        await user.click(screen.getByRole('button', { name: '콘텐츠 출처·권리' }));

        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/content-sources');
    });

    it('links the service operating guide from the service column', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/']}><AppFooter /><LocationProbe /></MemoryRouter>);

        await user.click(screen.getByRole('button', { name: '운영 안내' }));

        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/operation-guide');
    });
});
