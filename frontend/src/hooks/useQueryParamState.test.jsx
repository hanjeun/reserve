import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import useQueryParamsState from './useQueryParamState';
import { WorkspaceActivityContext } from '../components/layout/workspaceActivity';

const DEFAULTS = {
    reservationSearch: '',
    reservationPage: '1',
};

function Probe() {
    const [values, setValues] = useQueryParamsState(DEFAULTS);
    const location = useLocation();
    const navigate = useNavigate();
    return <>
        <output data-testid="search-value">{values.reservationSearch}</output>
        <output data-testid="page-value">{values.reservationPage}</output>
        <output data-testid="location-search">{location.search}</output>
        <output data-testid="location-path">{location.pathname}{location.hash}</output>
        <output data-testid="location-state">{JSON.stringify(location.state)}</output>
        <button type="button" onClick={() => setValues({ reservationSearch: '예약자', reservationPage: '1' })}>검색</button>
        <button type="button" onClick={() => setValues({ reservationPage: '3' })}>3페이지</button>
        <button type="button" onClick={() => navigate(-1)}>뒤로</button>
    </>;
}

describe('useQueryParamsState', () => {
    it('shows active list defaults and preserves the tab, hash and original history entry', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/guide/user', {
            pathname: '/business', search: '?tab=reservations&reservationPage=1&reservationSearch=&view=cards',
            hash: '#today', state: { origin: 'guide' },
        }]} initialIndex={1}><Probe /></MemoryRouter>);
        await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent(/^\?tab=reservations&reservationPage=1&view=cards$/));
        expect(screen.getByTestId('location-path')).toHaveTextContent('/business#today');
        expect(screen.getByTestId('location-state')).toHaveTextContent('{"origin":"guide"}');
        await user.click(screen.getByRole('button', { name: '뒤로' }));
        expect(screen.getByTestId('location-path')).toHaveTextContent(/^\/guide\/user$/);
    });

    it('does not normalize a hidden workspace panel against the active panel URL', () => {
        render(<MemoryRouter initialEntries={['/admin?tab=members&reservationPage=1']}>
            <WorkspaceActivityContext.Provider value={false}><Probe /></WorkspaceActivityContext.Provider>
        </MemoryRouter>);
        expect(screen.getByTestId('location-search')).toHaveTextContent('?tab=members&reservationPage=1');
    });
    it('keeps hidden admin values without letting its page clamp overwrite another work function', async () => {
        function FrozenProbe() {
            const [values, patch] = useQueryParamsState(DEFAULTS);
            const [earlierSetter] = useState(() => patch);
            return <><output data-testid="frozen-page">{values.reservationPage}</output>
                <button onClick={() => earlierSetter({ reservationPage: '9' })}>늦은 페이지 보정</button></>;
        }
        function WorkspaceProbe() {
            const location = useLocation();
            const navigate = useNavigate();
            return <><WorkspaceActivityContext.Provider value={location.search.includes('tab=reservations')}><FrozenProbe /></WorkspaceActivityContext.Provider>
                <button onClick={() => navigate('/admin?tab=members&page=4')}>회원 관리</button>
                <output data-testid="current-query">{location.search}</output></>;
        }
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/admin?tab=reservations&reservationPage=3']}><WorkspaceProbe /></MemoryRouter>);
        await user.click(screen.getByRole('button', { name: '회원 관리' }));
        await user.click(screen.getByRole('button', { name: '늦은 페이지 보정' }));
        expect(screen.getByTestId('frozen-page')).toHaveTextContent('3');
        expect(screen.getByTestId('current-query')).toHaveTextContent('?tab=members&page=4');
    });
    it('keeps an unrelated tab and view while a listing filter resets its page', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/business?tab=reservations&view=cards&reservationPage=2']}>
            <Probe />
        </MemoryRouter>);

        await user.click(screen.getByRole('button', { name: '검색' }));
        const params = new URLSearchParams(screen.getByTestId('location-search').textContent);
        expect(params.get('tab')).toBe('reservations');
        expect(params.get('view')).toBe('cards');
        expect(params.get('reservationSearch')).toBe('예약자');
        expect(params.get('reservationPage')).toBe('1');
    });

    it('restores an explicit page without dropping the active business tab', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/business?tab=ads&advertisementSearch=예약']}>
            <Probe />
        </MemoryRouter>);

        await user.click(screen.getByRole('button', { name: '3페이지' }));
        const params = new URLSearchParams(screen.getByTestId('location-search').textContent);
        expect(params.get('tab')).toBe('ads');
        expect(params.get('advertisementSearch')).toBe('예약');
        expect(params.get('reservationPage')).toBe('3');
    });

    it('shows every selected default and alternate choice, including empty whole-group selections', async () => {
        const user = userEvent.setup();
        function SelectionProbe() {
            const [values, patch] = useQueryParamsState({ status: 'ALL', view: 'list', type: '', statisticsStore: '', search: '' });
            const location = useLocation();
            return <><output data-testid="selection-query">{location.search}</output>
                <output data-testid="selection-hash">{location.hash}</output>
                <button onClick={() => patch({ status: values.status === 'ALL' ? 'OPEN' : 'ALL' })}>상태 전환</button></>;
        }
        render(<MemoryRouter initialEntries={['/admin?tab=reservations#rows']}><SelectionProbe /></MemoryRouter>);
        const query = () => Object.fromEntries(new URLSearchParams(screen.getByTestId('selection-query').textContent));
        await waitFor(() => expect(query()).toEqual({ tab: 'reservations', status: 'all', view: 'list', type: 'all', statisticsStore: '' }));
        await user.click(screen.getByRole('button', { name: '상태 전환' }));
        expect(query().status).toBe('OPEN');
        await user.click(screen.getByRole('button', { name: '상태 전환' }));
        expect(query().status).toBe('all');
        expect(screen.getByTestId('selection-hash')).toHaveTextContent('#rows');
    });

    it('adds defaults only for the current nested list', async () => {
        function NestedProbe() {
            useQueryParamsState({ mode: 'reports', reportStatus: 'ALL', commentStatus: 'ALL', page: '1' }, ['mode', 'reportStatus', 'page']);
            const location = useLocation();
            return <output data-testid="nested-query">{location.search}</output>;
        }
        render(<MemoryRouter initialEntries={['/admin?tab=feed-reports']}><NestedProbe /></MemoryRouter>);
        await waitFor(() => expect(screen.getByTestId('nested-query')).toHaveTextContent('?tab=feed-reports&mode=reports&reportStatus=all&page=1'));
        expect(new URLSearchParams(screen.getByTestId('nested-query').textContent).has('commentStatus')).toBe(false);
    });
});
