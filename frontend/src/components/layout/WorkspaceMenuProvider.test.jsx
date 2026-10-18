import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Header from './Header';
import WorkspaceLayout from './WorkspaceLayout';
import WorkspaceMenuProvider from './WorkspaceMenuProvider';
import { FlagOutlined, InboxOutlined } from '../common/icons';

const viewport = vi.hoisted(() => ({ width: 1200 }));
vi.mock('../../hooks/useWindowWidth', () => ({ useWindowWidth: () => viewport.width }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => true }));
vi.mock('../../store/useAuthStore', () => ({ default: Object.assign(
    selector => selector ? selector({ isLoggedIn: true }) : { isLoggedIn: true },
    { getState: () => ({ isLoggedIn: true }), subscribe: () => () => {} },
) }));
vi.mock('./HeaderAccountMenu', () => ({ default: () => <button>내 계정 메뉴 열기</button> }));

const groups = [{ key: 'reviews', label: '신고 관리', items: [
    { key: 'feed', label: '피드 신고', icon: FlagOutlined },
    { key: 'comments', label: '댓글 신고', icon: InboxOutlined },
] }];

function Workspace({ block = false }) {
    const [activeKey, setActiveKey] = useState('feed');
    const [text, setText] = useState('');
    return <><Header /><WorkspaceLayout title="관리자 패널"
        groups={groups} activeKey={activeKey} hrefFor={key => `?tab=${key}`} onSelect={key => {
            if (block) return false;
            setActiveKey(key); return true;
        }}><input aria-label="검토 메모" value={text} onChange={event => setText(event.target.value)} /></WorkspaceLayout></>;
}
const setup = block => render(<MemoryRouter initialEntries={['/admin']}>
    <WorkspaceMenuProvider><Workspace block={block} /></WorkspaceMenuProvider>
</MemoryRouter>);

beforeEach(() => { viewport.width = 1200; vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });

describe('workspace header menu and work preservation', () => {
    it('collapses only desktop navigation and retains the current input through reopening', async () => {
        setup();
        fireEvent.change(screen.getByRole('textbox', { name: '검토 메모' }), { target: { value: '작성 중인 메모' } });
        const toggle = screen.getByRole('button', { name: '관리자 패널 메뉴 접기' });
        const sidebar = document.getElementById(toggle.getAttribute('aria-controls'));
        fireEvent.click(toggle);
        expect(sidebar).toHaveAttribute('inert');
        expect(sidebar).toHaveAttribute('aria-hidden', 'true');
        expect(screen.queryByRole('navigation', { name: '관리자 패널 메뉴' })).toBeNull();
        expect(screen.getByRole('textbox', { name: '검토 메모' })).toHaveValue('작성 중인 메모');
        fireEvent.click(screen.getByRole('button', { name: '관리자 패널 메뉴 펼치기' }));
        expect(sidebar).not.toHaveAttribute('inert');
        expect(screen.getByRole('navigation', { name: '관리자 패널 메뉴' })).toBeVisible();
        expect(screen.getByRole('textbox', { name: '검토 메모' })).toHaveValue('작성 중인 메모');
        await screen.findByRole('button', { name: '내 계정 메뉴 열기' });
    });

    it('keeps the mobile drawer and work open when guarded selection is rejected', async () => {
        viewport.width = 390; setup(true);
        fireEvent.change(screen.getByRole('textbox', { name: '검토 메모' }), { target: { value: '유지할 메모' } });
        fireEvent.click(screen.getByRole('button', { name: '관리자 패널 메뉴 열기' }));
        fireEvent.click(await screen.findByRole('link', { name: '댓글 신고' }));
        await waitFor(() => expect(screen.getByRole('button', { name: '관리자 패널 메뉴 닫기' })).toHaveAttribute('aria-expanded', 'true'));
        expect(screen.getByRole('heading', { name: '피드 신고' })).toBeVisible();
        expect(screen.getByRole('textbox', { name: '검토 메모' })).toHaveValue('유지할 메모');
    });

    it('closes the drawer after accepted selection and focuses the selected work heading', async () => {
        viewport.width = 390; setup(false);
        fireEvent.click(screen.getByRole('button', { name: '관리자 패널 메뉴 열기' }));
        fireEvent.click(await screen.findByRole('link', { name: '댓글 신고' }));
        await waitFor(() => expect(screen.queryByRole('navigation', { name: '관리자 패널 메뉴' })).toBeNull());
        await waitFor(() => expect(screen.getByRole('heading', { name: '댓글 신고' })).toHaveFocus());
        expect(screen.getByRole('button', { name: '관리자 패널 메뉴 열기' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('returns focus to the header menu when Escape closes the mobile drawer', async () => {
        viewport.width = 390; setup(false);
        fireEvent.click(screen.getByRole('button', { name: '관리자 패널 메뉴 열기' }));
        fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape', keyCode: 27 });
        await waitFor(() => expect(screen.queryByRole('navigation', { name: '관리자 패널 메뉴' })).toBeNull());
        await waitFor(() => expect(screen.getByRole('button', { name: '관리자 패널 메뉴 열기' })).toHaveFocus());
        expect(screen.getByRole('button', { name: '관리자 패널 메뉴 열기' })).toHaveAttribute('data-input-modality', 'keyboard');
    });

    it('preserves pointer focus origin when the drawer close button returns focus', async () => {
        viewport.width = 390; setup(false);
        const menu = screen.getByRole('button', { name: '관리자 패널 메뉴 열기' });
        fireEvent.pointerDown(menu, { pointerType: 'touch' });
        fireEvent.click(menu);
        const close = await screen.findByRole('button', { name: '메뉴 닫기' });
        fireEvent.pointerDown(close, { pointerType: 'touch' });
        fireEvent.click(close);
        await waitFor(() => expect(screen.queryByRole('navigation', { name: '관리자 패널 메뉴' })).toBeNull());
        await waitFor(() => expect(screen.getByRole('button', { name: '관리자 패널 메뉴 열기' })).toHaveFocus());
        expect(screen.getByRole('button', { name: '관리자 패널 메뉴 열기' })).toHaveAttribute('data-input-modality', 'pointer');
    });
});
