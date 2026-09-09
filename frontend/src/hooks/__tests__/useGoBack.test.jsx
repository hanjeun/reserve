import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import useGoBack from '../useGoBack';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => navigateSpy };
});

const BackProbe = ({ fallback }) => {
    const goBack = useGoBack(fallback);
    return <button type="button" onClick={goBack}>뒤로가기</button>;
};

const renderProbe = (fallback = '/stores') => render(
    <MemoryRouter>
        <BackProbe fallback={fallback} />
    </MemoryRouter>,
);

describe('useGoBack', () => {
    beforeEach(() => {
        navigateSpy.mockClear();
    });

    it('되감을 히스토리가 있으면 한 칸 뒤로 간다', async () => {
        // 앱 안에서 이동해 온 상태 — react-router 가 idx 를 올려둔다.
        window.history.replaceState({ idx: 2 }, '');
        const { getByRole } = renderProbe();

        await userEvent.click(getByRole('button', { name: '뒤로가기' }));

        expect(navigateSpy).toHaveBeenCalledWith(-1);
    });

    it('첫 진입(idx 0)이면 되감지 않고 fallback 으로 보낸다', async () => {
        // 검색 결과·공유 링크·새 탭으로 상세에 바로 들어온 사용자.
        // 예전에는 navigate(-1) 이 아무 일도 하지 않아 버튼이 죽어 보였다(2026-09-06 운영 재현).
        window.history.replaceState({ idx: 0 }, '');
        const { getByRole } = renderProbe('/stores');

        await userEvent.click(getByRole('button', { name: '뒤로가기' }));

        expect(navigateSpy).toHaveBeenCalledWith('/stores', { replace: true });
        expect(navigateSpy).not.toHaveBeenCalledWith(-1);
    });

    it('idx 를 알 수 없으면 되감지 않는다 — 사이트 밖으로 튕겨나가는 쪽이 더 나쁘다', async () => {
        window.history.replaceState({}, '');
        const { getByRole } = renderProbe('/stores');

        await userEvent.click(getByRole('button', { name: '뒤로가기' }));

        expect(navigateSpy).toHaveBeenCalledWith('/stores', { replace: true });
    });
});
