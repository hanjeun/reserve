import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InfoHint from './InfoHint';
import Tooltip from './Tooltip';
import { TooltipScopeContext } from './tooltipScope';
import StoreListRow from '../store/StoreListRow';
import StoreCard from '../store/StoreCard';
import WaitingStoreSummary from '../waiting/WaitingStoreSummary';

const auth = vi.hoisted(() => ({ loggedIn: true }));
vi.mock('./FavoriteButton', () => ({ default: () => auth.loggedIn ? <button aria-label="즐겨찾기 추가" /> : null }));
vi.mock('./index', async () => {
    const { default: FavoriteButton } = await import('./FavoriteButton');
    const Card = ({ children }) => <article>{children}</article>;
    Card.Cover = ({ alt }) => <img alt={alt} />;
    return { Card, FavoriteButton };
});
vi.mock('../../services/adService', () => ({ default: { recordImpression: vi.fn() } }));

const pointer = (target, type, pointerType = 'mouse') => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    fireEvent(target, event);
};
const settle = async () => { await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 250)); }); };
let client;
const shell = child => <QueryClientProvider client={client}><ConfigProvider theme={{ token: { motion: false } }}>{child}</ConfigProvider></QueryClientProvider>;
const setup = child => render(shell(child));
const hint = <InfoHint label="웨이팅 정보: 현장 접수만 가능, 대기 3팀"><span>현장 접수만 가능</span><span>대기 3팀</span></InfoHint>;
const infoButton = () => screen.getByRole('button', { name: /웨이팅 정보:/ });
const user = () => userEvent.setup();

beforeEach(() => { auth.loggedIn = true; client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); });

describe('state information hints', () => {
    it('keeps the first focus-and-click open, pins on leave, and toggles on the next click', async () => {
        setup(hint);
        const button = infoButton();
        await user().click(button); await settle();
        expect(button).toHaveAttribute('aria-expanded', 'true');
        const popup = screen.getByRole('tooltip');
        expect(button).toHaveAttribute('aria-describedby', popup.id);
        expect(button).not.toHaveAttribute('aria-haspopup');
        expect(popup).toHaveTextContent('현장 접수만 가능');
        pointer(button, 'pointerout'); await settle();
        expect(button).toHaveAttribute('aria-expanded', 'true');
        await user().click(button); await settle();
        expect(button).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('tooltip')).toBeNull();
        expect(button).toHaveFocus();
    });

    it('supports keyboard focus, native Enter and Space activation, and Escape dismissal', async () => {
        setup(hint);
        const keyboard = user();
        await keyboard.tab(); await settle();
        expect(infoButton()).toHaveFocus();
        expect(screen.getByRole('tooltip')).toHaveTextContent('대기 3팀');
        await keyboard.keyboard('{Enter}');
        pointer(infoButton(), 'pointerout'); await settle();
        expect(infoButton()).toHaveAttribute('aria-expanded', 'true');
        await keyboard.keyboard(' '); await settle();
        expect(infoButton()).toHaveAttribute('aria-expanded', 'false');
        await keyboard.keyboard('{Enter}'); await settle();
        await keyboard.keyboard('{Escape}'); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
        expect(infoButton()).toHaveFocus();
    });

    it('opens on touch and lets an outside input take focus without clearing its value', async () => {
        setup(<>{hint}<input aria-label="가게 검색" defaultValue="작성 중 검색" /></>);
        const button = infoButton();
        pointer(button, 'pointerdown', 'touch'); fireEvent.focus(button);
        pointer(button, 'pointerup', 'touch'); fireEvent.click(button); await settle();
        expect(button).toHaveAttribute('aria-expanded', 'true');
        pointer(button, 'pointerout', 'touch'); await settle();
        expect(screen.getByRole('tooltip')).toHaveTextContent('대기 3팀');
        const input = screen.getByRole('textbox', { name: '가게 검색' });
        pointer(input, 'pointerdown', 'touch'); act(() => input.focus()); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
        expect(input).toHaveFocus(); expect(input).toHaveValue('작성 중 검색');
    });

    it('keeps popup scrolling readable and dismisses on an outside scroll, including a delayed hover', async () => {
        setup(hint);
        pointer(infoButton(), 'pointerover'); await settle();
        const popup = screen.getByRole('tooltip');
        fireEvent.scroll(popup); await settle();
        expect(screen.getByRole('tooltip')).toBeVisible();
        fireEvent.scroll(window); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
        pointer(infoButton(), 'pointerout'); pointer(infoButton(), 'pointerover');
        fireEvent.scroll(window); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('cancels delayed hover on Escape and resets a pinned popup on route scope changes', async () => {
        const { rerender } = setup(<TooltipScopeContext.Provider value="first">{hint}</TooltipScopeContext.Provider>);
        pointer(infoButton(), 'pointerover');
        fireEvent.keyDown(infoButton(), { key: 'Escape' }); await settle();
        expect(screen.queryByRole('tooltip')).toBeNull();
        fireEvent.click(infoButton()); await settle();
        expect(screen.getByRole('tooltip')).toBeVisible();
        rerender(shell(<TooltipScopeContext.Provider value="second">{hint}</TooltipScopeContext.Provider>));
        await settle();
        expect(infoButton()).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('leaves action tooltips suppressed on touch while forwarding their original action', async () => {
        const click = vi.fn();
        setup(<>{hint}<Tooltip title="원래 동작 설명"><button onClick={click}>다른 동작</button></Tooltip></>);
        pointer(infoButton(), 'pointerdown', 'touch'); fireEvent.click(infoButton()); await settle();
        const action = screen.getByRole('button', { name: '다른 동작' });
        pointer(action, 'pointerdown', 'touch'); fireEvent.focus(action); fireEvent.click(action); await settle();
        expect(click).toHaveBeenCalledOnce();
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('distinguishes zero teams from an unknown count and updates the open information', async () => {
        const { rerender } = setup(<WaitingStoreSummary store={{ waitingIntakeMode: 'ONSITE', waitingTeams: 0 }} />);
        fireEvent.click(infoButton()); await settle();
        expect(screen.getByRole('tooltip')).toHaveTextContent('대기 0팀');
        rerender(shell(<WaitingStoreSummary store={{ waitingIntakeMode: 'ONSITE', waitingPaused: true }} />));
        expect(infoButton()).toHaveAccessibleName('웨이팅 정보: 접수 중지, 대기 팀 수 확인 중');
        expect(screen.getByRole('tooltip')).toHaveTextContent('접수 중지대기 팀 수 확인 중');
        expect(screen.getByRole('tooltip')).not.toHaveTextContent('대기 0팀');
    });
});

function LocationProbe() {
    const location = useLocation();
    return <output aria-label="현재 경로">{location.pathname}</output>;
}

describe('store information tool slots', () => {
    it.each([['row', StoreListRow], ['card', StoreCard]])('keeps the %s information button outside its destination link', async (_kind, Component) => {
        const click = vi.fn();
        const { rerender } = setup(<MemoryRouter initialEntries={['/waiting']}>
            <div onClick={click}><Component store={{ id: 12, name: '웨이팅 가게' }} extraTools={hint} /></div><LocationProbe />
        </MemoryRouter>);
        const button = infoButton();
        expect(button.closest('a')).toBeNull();
        expect(screen.getByRole('button', { name: '즐겨찾기 추가' }).parentElement).toContainElement(button);
        await user().click(button); await settle();
        expect(click).not.toHaveBeenCalled();
        expect(screen.getByRole('status', { name: '현재 경로' })).toHaveTextContent('/waiting');
        expect(screen.getByRole('link', { name: '웨이팅 가게 상세 보기' })).toHaveAttribute('href', '/store/12');
        auth.loggedIn = false;
        rerender(shell(<MemoryRouter initialEntries={['/waiting']}>
            <div onClick={click}><Component store={{ id: 12, name: '웨이팅 가게' }} extraTools={hint} /></div><LocationProbe />
        </MemoryRouter>));
        expect(screen.queryByRole('button', { name: '즐겨찾기 추가' })).toBeNull();
        expect(infoButton()).toBeInTheDocument();
    });
});
