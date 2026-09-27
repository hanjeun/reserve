import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import useQueryParamsState from './useQueryParamState';

const DEFAULTS = {
    reservationSearch: '',
    reservationPage: '1',
};

function Probe() {
    const [values, setValues] = useQueryParamsState(DEFAULTS);
    const location = useLocation();
    return <>
        <output data-testid="search-value">{values.reservationSearch}</output>
        <output data-testid="page-value">{values.reservationPage}</output>
        <output data-testid="location-search">{location.search}</output>
        <button type="button" onClick={() => setValues({ reservationSearch: '예약자', reservationPage: '1' })}>검색</button>
        <button type="button" onClick={() => setValues({ reservationPage: '3' })}>3페이지</button>
    </>;
}

describe('useQueryParamsState', () => {
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
        expect(params.has('reservationPage')).toBe(false);
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
});
