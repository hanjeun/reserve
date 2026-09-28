import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import MessengerFooter from './MessengerFooter';
import MessengerSettings from './MessengerSettings';
import MessengerHome from './MessengerHome';

describe('MessengerHome headings', () => {
    it.each([1, 2])('keeps one accessible heading at level %s without a visible cover wordmark', headingLevel => {
        const onChoose = vi.fn();
        const { container } = render(<MessengerHome onChoose={onChoose} headingLevel={headingLevel} />);
        expect(container.querySelector('.reserve-messenger-cover-image')).toHaveAttribute('src', '/og-image.png');
        expect(screen.getByRole('heading', { name: '메시지', level: headingLevel })).toHaveClass('reserve-messenger-sr-only');
        expect(screen.queryByRole('heading', { name: 'RESERVE' })).not.toBeInTheDocument();
        expect(screen.getAllByRole('heading')).toHaveLength(1);
        expect(screen.queryByText('최근 대화')).not.toBeInTheDocument();
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(onChoose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '고객지원에 문의' }));
        expect(onChoose).toHaveBeenCalledExactlyOnceWith({ kind: 'support' });
    });
});

describe('MessengerFooter', () => {
    it.each(['home', 'conversations', 'settings'])('marks only %s as the current native navigation button', view => {
        const { container } = render(<MessengerFooter view={view} onChange={vi.fn()} />);
        const navigation = screen.getByRole('navigation', { name: '메신저 화면' });
        expect(within(navigation).getAllByRole('button')).toHaveLength(3);
        const active = container.querySelector('[aria-current="page"]');
        expect(active).toHaveClass('reserve-messenger-footer-tab', 'is-active');
        expect(active).toHaveAccessibleName({ home: '홈', conversations: '대화', settings: '설정' }[view]);
        expect(active.tagName).toBe('BUTTON');
        expect(active).toHaveAttribute('type', 'button');
        expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
        expect(container.querySelector('.reserve-messenger-footer-badge')).toBeNull();
    });

    it('changes views only when a native button is activated', () => {
        const onChange = vi.fn();
        render(<MessengerFooter view="home" onChange={onChange} />);
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '대화' }));
        fireEvent.click(screen.getByRole('button', { name: '설정' }));
        fireEvent.click(screen.getByRole('button', { name: '홈' }));
        expect(onChange.mock.calls).toEqual([['conversations'], ['settings'], ['home']]);
    });

    it('supports keyboard activation through the native controls', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<MessengerFooter view="home" onChange={onChange} />);
        await user.tab();
        await user.tab();
        expect(screen.getByRole('button', { name: '대화' })).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(onChange).toHaveBeenCalledWith('conversations');
    });

    it('shows an actual unread count only beside conversations', () => {
        render(<MessengerFooter view="home" onChange={vi.fn()} unread={7} />);
        const conversations = screen.getByRole('button', { name: '대화' });
        expect(within(conversations).getByLabelText('읽지 않은 메시지 7개')).toHaveTextContent('7');
        expect(conversations).toHaveAccessibleDescription('읽지 않은 메시지 7개');
        expect(screen.getByRole('button', { name: '홈' })).not.toHaveAttribute('aria-describedby');
        expect(screen.getByRole('button', { name: '설정' })).not.toHaveAttribute('aria-describedby');
    });

    it('caps the visual badge without losing its actual accessible count', () => {
        render(<MessengerFooter view="conversations" onChange={vi.fn()} unread={120} />);
        expect(screen.getByLabelText('읽지 않은 메시지 120개')).toHaveTextContent('99+');
        expect(screen.getByRole('button', { name: '대화' })).toHaveAccessibleDescription('읽지 않은 메시지 120개');
    });

    it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])('does not fabricate an unread badge from %s', unread => {
        const { container } = render(<MessengerFooter view="home" onChange={vi.fn()} unread={unread} />);
        expect(container.querySelector('.reserve-messenger-footer-badge')).toBeNull();
    });
});

describe('MessengerSettings', () => {
    const renderSettings = props => render(<MemoryRouter><MessengerSettings {...props} /></MemoryRouter>);

    it('shows only provided identity and links to the existing account page', () => {
        const { container } = renderSettings({ user: { name: '김회원', email: 'member@example.com' } });
        expect(screen.getByRole('heading', { name: '설정', level: 2 })).toBeInTheDocument();
        expect(screen.getByText('김회원')).toBeInTheDocument();
        expect(screen.getByText('member@example.com')).toBeInTheDocument();
        const avatar = container.querySelector('.reserve-messenger-settings-avatar');
        expect(avatar.querySelector('.anticon-user')).not.toBeNull();
        expect(avatar).not.toHaveTextContent('김');
        expect(screen.getByRole('link', { name: '내 정보 관리' })).toHaveAttribute('href', '/my-page');
        expect(screen.getByRole('region', { name: '대화 환경' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: '내 말풍선 색' })).toBeInTheDocument();
        expect(container.querySelector('.reserve-messenger-settings-note')).toBeNull();
    });

    it('uses a neutral fallback icon without invented identity or unsupported toggles', () => {
        const { container } = renderSettings({ user: null, notificationControl: null });
        expect(container.querySelector('.anticon-user')).toBeInTheDocument();
        expect(container.querySelector('.reserve-messenger-settings-email')).toBeNull();
        expect(screen.queryByText('PC 세션 알림은 PC 브라우저에서 설정할 수 있어요.')).not.toBeInTheDocument();
        expect(screen.getByRole('region', { name: '대화 환경' })).toBeInTheDocument();
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('places the supplied notification control in the environment section without triggering it', () => {
        const onEnable = vi.fn();
        renderSettings({ notificationControl: <button onClick={onEnable}>PC 알림 켜기</button> });
        const environment = screen.getByRole('region', { name: '대화 환경' });
        expect(within(environment).getByRole('button', { name: 'PC 알림 켜기' })).toBeInTheDocument();
        expect(screen.queryByText('PC 세션 알림은 PC 브라우저에서 설정할 수 있어요.')).not.toBeInTheDocument();
        expect(onEnable).not.toHaveBeenCalled();
        fireEvent.click(within(environment).getByRole('button', { name: 'PC 알림 켜기' }));
        expect(onEnable).toHaveBeenCalledOnce();
    });

    it('respects the page heading level for supplied controls without displaying redundant explanations', () => {
        renderSettings({ headingLevel: 1, notificationControl: <button type="button">PC 알림 켜기</button> });
        expect(screen.getByRole('heading', { name: '설정', level: 1 })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '대화 환경', level: 2 })).toBeInTheDocument();
        expect(within(screen.getByRole('region', { name: '대화 환경' })).getByRole('button', { name: 'PC 알림 켜기' })).toBeInTheDocument();
        expect(screen.queryByText(/대화 초안은 이번 세션/)).not.toBeInTheDocument();
        expect(screen.queryByText(/PC 세션 알림은 PC 브라우저/)).not.toBeInTheDocument();
    });

    it.each([undefined, null, false, '', 0])('keeps real color preferences without rendering an absent notification control: %s', notificationControl => {
        const { container } = renderSettings({ notificationControl });
        expect(screen.getByRole('region', { name: '대화 환경' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: '내 말풍선 색' })).toBeInTheDocument();
        expect(container.querySelector('.reserve-messenger-settings-environment')).not.toHaveTextContent(/^0$/);
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it.each(['/icons/R_logo.png', 'https://cdn.reserve.it.kr/users/1/profiles/photo.png', 'https://lh3.googleusercontent.com/design-example'])('displays the provided current-user photo at a safe address: %s', profileImage => {
        const { container } = renderSettings({ user: { id: 1, name: '김회원', profileImage } });
        const avatar = container.querySelector('.reserve-messenger-settings-avatar');
        const image = avatar.querySelector('img');
        expect(image).toHaveAttribute('src', profileImage);
        expect(image).toHaveAttribute('alt', '');
        expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
        expect(image).toHaveAttribute('draggable', 'false');
        expect(avatar).toHaveAttribute('aria-hidden', 'true');
        expect(avatar).not.toHaveTextContent('김');
    });

    it('supports the header profile URL priority with a guarded uploaded-photo fallback', () => {
        const account = { id: 1, name: '김회원', profileImage: '/icons/R_logo.png', profileImageUrl: 'https://example.test/social-photo.png' };
        const { container, rerender } = renderSettings({ user: account });
        expect(container.querySelector('.reserve-messenger-settings-avatar img')).toHaveAttribute('src', account.profileImageUrl);
        rerender(<MemoryRouter><MessengerSettings user={{ ...account, profileImageUrl: 'javascript:alert(1)' }} /></MemoryRouter>);
        expect(container.querySelector('.reserve-messenger-settings-avatar img')).toHaveAttribute('src', account.profileImage);
    });

    it.each(['', '  ', 'javascript:alert(1)', 'data:image/png;base64,example', 'blob:https://example.test/example', 'file:///photo.png', 'ftp://example.test/photo.png', 'https://user:password@example.test/photo.png', 'http://tracker.example/photo.png'])('uses the default profile icon without requesting an unsafe photo: %s', profileImage => {
        const { container } = renderSettings({ user: { name: '김회원', profileImage } });
        const avatar = container.querySelector('.reserve-messenger-settings-avatar');
        expect(avatar.querySelector('img')).toBeNull();
        expect(avatar.querySelector('.anticon-user')).not.toBeNull();
        expect(avatar).not.toHaveTextContent('김');
        expect(container.querySelector('.reserve-messenger-avatar')).toBeNull();
    });

    it('falls back to the default profile icon rather than the operator brand after an image error', () => {
        const { container } = renderSettings({ user: { id: 1, name: '김회원', profileImage: '/icons/R_logo.png' } });
        const avatar = container.querySelector('.reserve-messenger-settings-avatar');
        fireEvent.error(avatar.querySelector('img'));
        expect(avatar.querySelector('img')).toBeNull();
        expect(avatar.querySelector('.anticon-user')).not.toBeNull();
        expect(avatar).not.toHaveTextContent('김');
    });

    it('falls back to the neutral user icon after an image error when no name is supplied', () => {
        const { container } = renderSettings({ user: { id: 1, profileImage: '/icons/R_logo.png' } });
        const avatar = container.querySelector('.reserve-messenger-settings-avatar');
        fireEvent.error(avatar.querySelector('img'));
        expect(avatar.querySelector('img')).toBeNull();
        expect(avatar.querySelector('.anticon-user')).not.toBeNull();
    });

    it('resets a failed image immediately when the photo changes and ignores a detached old-photo error', () => {
        const user = { id: 1, name: '김회원', profileImage: '/icons/R_logo.png' };
        const { container, rerender } = renderSettings({ user });
        const oldImage = container.querySelector('.reserve-messenger-settings-avatar img');
        fireEvent.error(oldImage);
        rerender(<MemoryRouter><MessengerSettings user={{ ...user, profileImage: '/icons/RESERVE_logo.png' }} /></MemoryRouter>);
        const currentImage = container.querySelector('.reserve-messenger-settings-avatar img');
        expect(currentImage).not.toBe(oldImage);
        expect(currentImage).toHaveAttribute('src', '/icons/RESERVE_logo.png');
        fireEvent.error(oldImage);
        expect(container.querySelector('.reserve-messenger-settings-avatar img')).toBe(currentImage);
    });

    it('removes the previous account photo immediately when the current user changes or logs out', () => {
        const { container, rerender } = renderSettings({ user: { id: 1, name: '김회원', email: 'first@example.test', profileImage: '/icons/R_logo.png' } });
        rerender(<MemoryRouter><MessengerSettings user={{ id: 2, name: '이회원', email: 'second@example.test' }} /></MemoryRouter>);
        const avatar = container.querySelector('.reserve-messenger-settings-avatar');
        expect(avatar.querySelector('img')).toBeNull();
        expect(avatar.querySelector('.anticon-user')).not.toBeNull();
        expect(avatar).not.toHaveTextContent('이');
        expect(screen.queryByText('first@example.test')).not.toBeInTheDocument();
        rerender(<MemoryRouter><MessengerSettings user={null} /></MemoryRouter>);
        expect(avatar.querySelector('img')).toBeNull();
        expect(avatar.querySelector('.anticon-user')).not.toBeNull();
        expect(screen.queryByText('second@example.test')).not.toBeInTheDocument();
    });

    it('resets photo failure across account identities even when both accounts provide the same photo URL', () => {
        const profileImage = '/icons/R_logo.png';
        const { container, rerender } = renderSettings({ user: { id: 1, name: '김회원', profileImage } });
        fireEvent.error(container.querySelector('.reserve-messenger-settings-avatar img'));
        rerender(<MemoryRouter><MessengerSettings user={{ id: 2, name: '이회원', profileImage }} /></MemoryRouter>);
        expect(container.querySelector('.reserve-messenger-settings-avatar img')).toHaveAttribute('src', profileImage);
    });
});
