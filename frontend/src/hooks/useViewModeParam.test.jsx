import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import useViewModeParam from './useViewModeParam';

function Probe({ defaultView }) {
    const [params, setParams] = useSearchParams();
    const [view, setView] = useViewModeParam(params, setParams, defaultView);
    const location = useLocation();
    return <>
        <output data-testid="view">{view}</output>
        <output data-testid="search">{location.search}</output>
        <button type="button" onClick={() => setView('cards')}>cards</button>
        <button type="button" onClick={() => setView('list')}>list</button>
    </>;
}

describe('explicit view URL contract', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('writes a page-specific default and preserves unrelated parameters on changes', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/my-reservations?keep=yes']}>
            <Probe defaultView="list" />
        </MemoryRouter>);

        await waitFor(() => expect(new URLSearchParams(screen.getByTestId('search').textContent).get('view')).toBe('list'));
        expect(screen.getByTestId('view')).toHaveTextContent('list');
        await user.click(screen.getByRole('button', { name: 'cards' }));
        const params = new URLSearchParams(screen.getByTestId('search').textContent);
        expect(params.get('view')).toBe('cards');
        expect(params.get('keep')).toBe('yes');
    });

    it('normalizes an invalid value to the supplied default instead of a remembered view', async () => {
        sessionStorage.setItem('reserve:view-mode:/stores', 'list');
        render(<MemoryRouter initialEntries={['/stores?view=grid&keep=yes']}>
            <Probe defaultView="cards" />
        </MemoryRouter>);

        await waitFor(() => expect(new URLSearchParams(screen.getByTestId('search').textContent).get('view')).toBe('cards'));
        expect(screen.getByTestId('view')).toHaveTextContent('cards');
    });

    it('restores the last view for the same page when a return link has no view parameter', async () => {
        sessionStorage.setItem('reserve:view-mode:/stores', 'list');
        render(<MemoryRouter initialEntries={['/stores?keep=yes']}>
            <Probe defaultView="cards" />
        </MemoryRouter>);

        await waitFor(() => expect(new URLSearchParams(screen.getByTestId('search').textContent).get('view')).toBe('list'));
        expect(screen.getByTestId('view')).toHaveTextContent('list');
    });

    it('uses an explicit URL view ahead of the remembered view', () => {
        sessionStorage.setItem('reserve:view-mode:/stores', 'list');
        render(<MemoryRouter initialEntries={['/stores?view=cards']}>
            <Probe defaultView="list" />
        </MemoryRouter>);

        expect(screen.getByTestId('view')).toHaveTextContent('cards');
    });
});
