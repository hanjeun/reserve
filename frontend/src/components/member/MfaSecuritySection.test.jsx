import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import MfaSecuritySection from './MfaSecuritySection';
import useAuthStore from '../../store/useAuthStore';

const fixture = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../api/axios', () => ({ default: { get: fixture.get, post: fixture.post } }));
vi.mock('./MfaFlow', () => ({ default: function ManagedFlow({ ref, initialView, onCancel }) {
    useImperativeHandle(ref, () => ({ cancel: onCancel }));
    return <span>{initialView.verified ? '인증 수단 관리' : '기존 인증 수단 확인'}</span>;
} }));
const methods = { passwordEnabled: true, socialProofFresh: false, socialProvider: 'NAVER' };
const connected = { available: true, enabled: true, required: false, credentials: [{ id: 'fixture-key', kind: 'PASSKEY' }] };
const show = (loginMethods = methods, entry = '/') => render(<AntApp><MemoryRouter initialEntries={[entry]}><div style={{ display: 'grid' }}><MfaSecuritySection loginMethods={loginMethods} /></div></MemoryRouter></AntApp>);

describe('계정별 인증 관리', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        useAuthStore.setState({ user: { id: 7, role: 'BUSINESS' }, sessionRevision: 1, isLoggedIn: true });
        fixture.get.mockResolvedValue(connected);
        fixture.post.mockResolvedValue({ purpose: 'MANAGE', verified: true });
    });
    it('소셜 확인 복귀는 같은 계정의 관리 폼을 한 번만 열어요', async () => {
        const resumeRequest = { key: 'fixture-return', memberId: 7, revision: 1 };
        const props = { loginMethods: { ...methods, socialProofFresh: true }, resumeRequest };
        const page = render(<AntApp><MemoryRouter><MfaSecuritySection {...props} /></MemoryRouter></AntApp>);
        expect(await screen.findByText('인증 수단 관리')).toBeVisible();
        expect(fixture.post).toHaveBeenCalledTimes(1);
        page.rerender(<AntApp><MemoryRouter><MfaSecuritySection {...props} /></MemoryRouter></AntApp>);
        expect(fixture.post).toHaveBeenCalledTimes(1);
    });
    it('이전 계정이나 세대의 복귀 요청은 자동 인증 요청으로 이어지지 않아요', async () => {
        render(<AntApp><MemoryRouter><MfaSecuritySection loginMethods={{ ...methods, socialProofFresh: true }}
            resumeRequest={{ key: 'old', memberId: 8, revision: 0 }} /></MemoryRouter></AntApp>);
        await screen.findByRole('button', { name: '패스키·인증 앱 관리' });
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it('마이페이지에서는 큰 제목과 폼 대신 같은 아이콘 행을 표시해요', async () => {
        show();
        const icon = await screen.findByRole('button', { name: '패스키·인증 앱 관리' });
        expect(icon).toBeEnabled();
        expect(screen.getByText('패스키 연결됨 · 선택 사용')).toBeInTheDocument();
        expect(screen.queryByRole('heading')).toBeNull();
        expect(screen.queryByLabelText('현재 비밀번호')).toBeNull();
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it.each(['USER', 'BUSINESS'])('%s는 등록한 패스키 없이 현재 비밀번호로 관리해요', async role => {
        useAuthStore.setState({ user: { id: 7, role } });
        show();
        fireEvent.click(await screen.findByRole('button', { name: '패스키·인증 앱 관리' }));
        expect(fixture.post).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'fixture-password' } });
        const form = screen.getByRole('form', { name: '패스키·인증 앱 관리' });
        fireEvent.click(within(form).getByRole('button', { name: '패스키·인증 앱 관리' }));
        expect(await screen.findByText('인증 수단 관리')).toBeInTheDocument();
        expect(fixture.post).toHaveBeenCalledWith('/api/member/mfa/manage', { password: 'fixture-password' }, { skipAuthRefresh: true, signal: expect.any(AbortSignal) });
    });
    it('관리자는 등록한 인증 수단의 추가 확인을 유지해요', async () => {
        fixture.get.mockResolvedValue({ ...connected, required: true });
        fixture.post.mockResolvedValue({ purpose: 'MANAGE', verified: false });
        show();
        fireEvent.click(await screen.findByRole('button', { name: '패스키·인증 앱 관리' }));
        expect(await screen.findByText('기존 인증 수단 확인')).toBeInTheDocument();
        expect(screen.queryByLabelText('현재 비밀번호')).toBeNull();
        expect(fixture.post).toHaveBeenCalledWith('/api/member/mfa/manage', { password: undefined }, { skipAuthRefresh: true, signal: expect.any(AbortSignal) });
    });
    it('최근 확인한 연결 소셜 계정으로 바로 관리해요', async () => {
        show({ ...methods, passwordEnabled: false, socialProofFresh: true });
        fireEvent.click(await screen.findByRole('button', { name: '패스키·인증 앱 관리' }));
        expect(await screen.findByText('인증 수단 관리')).toBeInTheDocument();
        expect(screen.queryByLabelText('현재 비밀번호')).toBeNull();
        expect(fixture.post).toHaveBeenCalledTimes(1);
    });
    it('등록 환경을 행 아래에 표시하고 관리창을 열어도 추가 변경 요청을 보내지 않아요', async () => {
        fixture.get.mockResolvedValue({ ...connected, credentials: [{ id: 'fixture-key', kind: 'PASSKEY', name: '모바일 · Chrome' },
            { id: 'fixture-pc', kind: 'PASSKEY', name: 'PC · Chrome' }] });
        show({ ...methods, socialProofFresh: true });
        fireEvent.click(await screen.findByRole('button', { name: '패스키·인증 앱 관리' }));
        await screen.findByText('인증 수단 관리');
        expect(screen.getByText('모바일 · Chrome · PC · Chrome 연결됨 · 선택 사용')).toBeInTheDocument();
        expect(fixture.post).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: '패스키·인증 앱 관리' })).toHaveAttribute('aria-expanded', 'true');
    });
    it('연필을 같은 순간 두 번 눌러도 관리 요청은 한 번만 보내고 화면이 사라지면 중단해요', async () => {
        let resolve;
        fixture.post.mockReturnValue(new Promise(done => { resolve = done; }));
        const page = show({ ...methods, socialProofFresh: true });
        const pencil = await screen.findByRole('button', { name: '패스키·인증 앱 관리' });
        act(() => { pencil.click(); pencil.click(); });
        expect(fixture.post).toHaveBeenCalledTimes(1);
        const signal = fixture.post.mock.calls[0][2].signal;
        expect(signal.aborted).toBe(false);
        page.unmount();
        expect(signal.aborted).toBe(true);
        await act(async () => resolve({ purpose: 'MANAGE', verified: true }));
    });
    it('소셜 확인이 오래됐으면 위의 본인 확인을 안내하고 변경하지 않아요', async () => {
        show({ ...methods, passwordEnabled: false });
        fireEvent.click(await screen.findByRole('button', { name: '패스키·인증 앱 관리' }));
        expect(screen.getByText('연결된 소셜 계정으로 본인 확인을 먼저 진행해주세요.', { selector: '.ant-typography' })).toBeVisible();
        const submit = within(screen.getByRole('form', { name: '패스키·인증 앱 관리' })).getByRole('button', { name: '패스키·인증 앱 관리' });
        expect(submit).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(submit);
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it('이전 계정의 늦은 실패와 관리 화면을 새 계정에 표시하지 않아요', async () => {
        let fail;
        fixture.get.mockResolvedValueOnce(connected).mockResolvedValueOnce({ ...connected, enabled: false, credentials: [] });
        fixture.post.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
        show({ ...methods, socialProofFresh: true });
        fireEvent.click(await screen.findByRole('button', { name: '패스키·인증 앱 관리' }));
        await waitFor(() => expect(fixture.post).toHaveBeenCalledTimes(1));
        act(() => useAuthStore.setState({ sessionRevision: 2 }));
        await screen.findByRole('button', { name: '패스키·인증 앱 등록' });
        await act(async () => fail(new Error('이전 계정의 실패')));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.queryByText('인증 수단 관리')).toBeNull();
    });
    it('등록 아이콘의 보안 설정 주소는 작은 입력 폼을 바로 열어요', async () => {
        fixture.get.mockResolvedValue({ ...connected, enabled: false, credentials: [] });
        show(methods, '/my-page?tab=name#account-security');
        expect(await screen.findByLabelText('현재 비밀번호')).toBeInTheDocument();
        expect(screen.queryByRole('heading')).toBeNull();
    });
    it('닫힐 때 입력 폼을 모션 종료까지 유지하고 비활성으로 만들어요', async () => {
        show();
        fireEvent.click(await screen.findByRole('button', { name: '패스키·인증 앱 관리' }));
        const form = screen.getByRole('form', { name: '패스키·인증 앱 관리' });
        const panel = form.closest('.reserve-login-security-panel');
        expect(screen.queryByRole('button', { name: '닫기' })).toBeNull();
        fireEvent.click(screen.getAllByRole('button', { name: '패스키·인증 앱 관리' })[0]);
        expect(panel).toHaveAttribute('inert');
        expect(form).toBeInTheDocument();
        await waitFor(() => expect(form).not.toBeInTheDocument());
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it('등록 +의 같은 SVG를 회전하고 재클릭하면 포커스를 되돌려 닫아요', async () => {
        fixture.get.mockResolvedValue({ ...connected, enabled: false, credentials: [] });
        show();
        const plus = await screen.findByRole('button', { name: '패스키·인증 앱 등록' });
        const glyph = plus.querySelector('.reserve-login-setup-icon');
        const svg = glyph.querySelector('svg');
        expect(plus).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(plus);
        const input = screen.getByLabelText('현재 비밀번호');
        const form = input.closest('form');
        const panel = form.closest('.reserve-login-security-panel');
        expect(plus.querySelector('svg')).toBe(svg);
        expect(glyph).toHaveClass('is-open');
        expect(panel.id).toBe(plus.getAttribute('aria-controls'));
        expect(panel.previousElementSibling).toBe(plus.closest('div'));
        fireEvent.change(input, { target: { value: 'fixture-password' } });
        input.focus();
        fireEvent.click(plus);
        expect(plus).toHaveFocus();
        expect(plus.querySelector('svg')).toBe(svg);
        expect(glyph).not.toHaveClass('is-open');
        expect(plus).toHaveAttribute('aria-expanded', 'false');
        expect(panel).toHaveAttribute('inert');
        expect(panel).not.toHaveAttribute('aria-hidden');
        await waitFor(() => expect(form).not.toBeInTheDocument());
        fireEvent.click(plus);
        expect(screen.getByLabelText('현재 비밀번호')).toHaveValue('');
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it('닫힘 도중 다시 누르면 폼과 입력을 유지해 복원해요', async () => {
        show();
        const pencil = await screen.findByRole('button', { name: '패스키·인증 앱 관리' });
        fireEvent.click(pencil);
        const input = screen.getByLabelText('현재 비밀번호');
        fireEvent.change(input, { target: { value: 'fixture-password' } });
        fireEvent.click(pencil);
        fireEvent.click(pencil);
        expect(screen.getByLabelText('현재 비밀번호')).toBe(input);
        expect(input).toHaveValue('fixture-password');
        expect(input.closest('.reserve-login-security-panel')).not.toHaveAttribute('inert');
        expect(pencil).toHaveAttribute('aria-expanded', 'true');
        expect(fixture.post).not.toHaveBeenCalled();
    });
    it('인증 관리 중에도 같은 연필로 닫고 다시 열면 새 관리 요청을 사용해요', async () => {
        show({ ...methods, socialProofFresh: true });
        const pencil = await screen.findByRole('button', { name: '패스키·인증 앱 관리' });
        fireEvent.click(pencil);
        const body = await screen.findByText('인증 수단 관리');
        fireEvent.click(pencil);
        expect(body.closest('.reserve-login-security-panel')).toHaveAttribute('inert');
        await waitFor(() => expect(body).not.toBeInTheDocument());
        fireEvent.click(pencil);
        await screen.findByText('인증 수단 관리');
        expect(fixture.post).toHaveBeenCalledTimes(2);
    });
});
