import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import OperationGuide from './OperationGuide';
import CommonGuide from './CommonGuide';

function RouteProbe() {
    const location = useLocation();
    const navigate = useNavigate();
    return <>
        <output aria-label="현재 경로">{location.pathname + location.search + location.hash}</output>
        <button type="button" onClick={() => navigate(-1)}>이전 페이지</button>
    </>;
}

describe('OperationGuide legacy alias', () => {
    it('replaces the legacy URL with the public common guide while preserving query and fragment', async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={['/stores', '/operation-guide?source=legacy#policy']} initialIndex={1}>
            <Routes>
                <Route path="/stores" element={<p>이전 가게 목록</p>} />
                <Route path="/operation-guide" element={<OperationGuide />} />
                <Route path="/guide/common" element={<CommonGuide />} />
            </Routes>
            <RouteProbe />
        </MemoryRouter>);
        expect(screen.getByRole('heading', { level: 1, name: '공통 이용안내' })).toBeInTheDocument();
        expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/guide/common?source=legacy#policy');
        await user.click(screen.getByRole('button', { name: '이전 페이지' }));
        expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/stores');
        expect(screen.getByText('이전 가게 목록')).toBeInTheDocument();
    });
});
