import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import useListQueryNormalization from './useListQueryNormalization';

function Probe() {
    const [params] = useSearchParams();
    useListQueryNormalization(params);
    const location = useLocation();
    const navigate = useNavigate();
    return <>
        <output data-testid="url">{location.pathname}{location.search}{location.hash}</output>
        <output data-testid="state">{JSON.stringify(location.state)}</output>
        <button onClick={() => navigate(-1)}>뒤로</button>
    </>;
}

describe('public list query normalization', () => {
    it('keeps default selections while removing unsupported options without adding history', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/guide/user', {
            pathname: '/feed', search: '?view=all&page=1&utm_source=guide&unknown=yes', hash: '#latest', state: { origin: 'guide' },
        }]} initialIndex={1}><Probe /></MemoryRouter>);
        await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/feed?view=all&page=1&utm_source=guide&region=#latest'));
        expect(screen.getByTestId('state')).toHaveTextContent('{"origin":"guide"}');
        await user.click(screen.getByRole('button', { name: '뒤로' }));
        expect(screen.getByTestId('url')).toHaveTextContent(/^\/guide\/user$/);
    });

    it.each(['/feed?view=drafts&page=2', '/benefits?newsType=BENEFIT&period=ALL&page=2'])('keeps meaningful state in %s', url => {
        render(<MemoryRouter initialEntries={[url]}><Probe /></MemoryRouter>);
        expect(screen.getByTestId('url')).toHaveTextContent(url);
    });
});
