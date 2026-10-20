import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import useViewModeParam from './useViewModeParam';

function Probe({ defaultView }) {
    const [params] = useSearchParams();
    const [view, setView] = useViewModeParam(params, defaultView);
    const location = useLocation();
    const navigate = useNavigate();
    return <>
        <output data-testid="view">{view}</output>
        <output data-testid="search">{location.search}</output>
        <output data-testid="pathname">{location.pathname}</output>
        <output data-testid="hash">{location.hash}</output>
        <output data-testid="state">{JSON.stringify(location.state)}</output>
        <button type="button" onClick={() => setView('cards')}>cards</button>
        <button type="button" onClick={() => setView('list')}>list</button>
        <button type="button" onClick={() => navigate(-1)}>back</button>
    </>;
}

describe('explicit view URL contract', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('displays both page-specific default and alternate views while preserving filters', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/my-reservations?status=CONFIRMED&utm_source=link&keep=yes']}>
            <Probe defaultView="list" />
        </MemoryRouter>);

        await waitFor(() => expect(new URLSearchParams(screen.getByTestId('search').textContent).get('view')).toBe('list'));
        expect(screen.getByTestId('view')).toHaveTextContent('list');
        await user.click(screen.getByRole('button', { name: 'cards' }));
        const params = new URLSearchParams(screen.getByTestId('search').textContent);
        expect(params.get('view')).toBe('cards');
        expect(params.get('status')).toBe('CONFIRMED');
        expect(params.get('utm_source')).toBe('link');
        expect(params.has('keep')).toBe(false);
    });

    it('keeps the waiting tab and page during URL normalization and view changes', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/my-reservations?tab=waiting&waitingPage=3&status=CONFIRMED']}>
            <Probe defaultView="list" />
        </MemoryRouter>);

        await waitFor(() => expect(new URLSearchParams(screen.getByTestId('search').textContent).get('view')).toBe('list'));
        await user.click(screen.getByRole('button', { name: 'cards' }));
        const params = new URLSearchParams(screen.getByTestId('search').textContent);
        expect(params.get('tab')).toBe('waiting');
        expect(params.get('waitingPage')).toBe('3');
        expect(params.get('status')).toBe('CONFIRMED');
        expect(params.get('view')).toBe('cards');
    });

    it.each(['0', '-1', '1.5', '100001', 'invalid'])('removes invalid waiting pages (%s) without leaving waiting', async page => {
        render(<MemoryRouter initialEntries={[`/my-reservations?tab=waiting&waitingPage=${page}`]}>
            <Probe defaultView="list" />
        </MemoryRouter>);

        await waitFor(() => expect(new URLSearchParams(screen.getByTestId('search').textContent).get('waitingPage')).toBe('1'));
        const params = new URLSearchParams(screen.getByTestId('search').textContent);
        expect(params.get('tab')).toBe('waiting');
        expect(params.get('waitingPage')).toBe('1');
    });

    it('normalizes an invalid value to the supplied default instead of a remembered view', async () => {
        sessionStorage.setItem('reserve:view-mode:/stores', 'list');
        render(<MemoryRouter initialEntries={['/stores?view=grid&region=서울특별시+종로구&keep=yes']}>
            <Probe defaultView="cards" />
        </MemoryRouter>);

        await waitFor(() => expect(new URLSearchParams(screen.getByTestId('search').textContent).get('view')).toBe('cards'));
        expect(screen.getByTestId('view')).toHaveTextContent('cards');
        expect(new URLSearchParams(screen.getByTestId('search').textContent).get('region')).toBe('서울특별시 종로구');
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

    it('removes unknown, duplicate and invalid owned-store options without leaving the page', async () => {
        render(<MemoryRouter initialEntries={['/my-stores?kkkkkkkkkkk=&view=cards&view=list&sort=invalid&domain=invalid']}>
            <Probe defaultView="cards" />
        </MemoryRouter>);

        await waitFor(() => expect(Object.fromEntries(new URLSearchParams(screen.getByTestId('search').textContent)))
            .toEqual({ view: 'cards', sort: 'recent', domain: 'all' }));
        expect(screen.getByTestId('view')).toHaveTextContent('cards');
    });

    it('keeps an explicit default ahead of a remembered list without adding a history entry', async () => {
        const user = userEvent.setup();
        sessionStorage.setItem('reserve:view-mode:/my-stores', 'list');
        render(<MemoryRouter initialEntries={['/guide/user', {
            pathname: '/my-stores', search: '?view=cards&sort=recent&domain=SPORTS&utm_source=guide',
            hash: '#stores', state: { origin: 'guide' },
        }]} initialIndex={1}><Probe defaultView="cards" /></MemoryRouter>);
        await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?view=cards&sort=recent&domain=SPORTS&utm_source=guide'));
        expect(screen.getByTestId('view')).toHaveTextContent('cards');
        expect(screen.getByTestId('hash')).toHaveTextContent('#stores');
        expect(screen.getByTestId('state')).toHaveTextContent('{"origin":"guide"}');
        await user.click(screen.getByRole('button', { name: 'back' }));
        expect(screen.getByTestId('pathname')).toHaveTextContent('/guide/user');
    });

    it('keeps the unified favorites kind across view changes and return to cards', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/my-favorites?kind=posts#liked']}><Probe defaultView="cards" /></MemoryRouter>);
        await user.click(screen.getByRole('button', { name: 'list' }));
        expect(screen.getByTestId('search')).toHaveTextContent('?kind=posts&view=list');
        await user.click(screen.getByRole('button', { name: 'cards' }));
        expect(screen.getByTestId('search')).toHaveTextContent(/^\?kind=posts&view=cards$/);
        expect(screen.getByTestId('hash')).toHaveTextContent('#liked');
    });

    it('shows the remembered region alongside every default directory option', async () => {
        sessionStorage.setItem('reserve:discovery-region', '부산');
        render(<MemoryRouter initialEntries={['/stores']}><Probe defaultView="cards" /></MemoryRouter>);
        await waitFor(() => expect(Object.fromEntries(new URLSearchParams(screen.getByTestId('search').textContent)))
            .toEqual({ view: 'cards', sort: 'recommended', domain: 'all', page: '1', region: '부산' }));
    });
});
