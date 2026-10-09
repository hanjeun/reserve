import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UserGuide from './UserGuide';
import BusinessGuide from './BusinessGuide';
import CommonGuide from './CommonGuide';

const renderGuide = path => render(<MemoryRouter initialEntries={[path]}>
    <Routes>
        <Route path="/guide/user" element={<UserGuide />} />
        <Route path="/guide/business" element={<BusinessGuide />} />
        <Route path="/guide/common" element={<CommonGuide />} />
    </Routes>
</MemoryRouter>);

describe('public user, business and common guides', () => {
    it('navigates between separate guides and marks the current guide', async () => {
        const user = userEvent.setup();
        renderGuide('/guide/user');
        expect(screen.getByRole('heading', { level: 1, name: '사용자 이용안내' })).toBeInTheDocument();
        const navigation = screen.getByRole('navigation', { name: '이용안내' });
        expect(within(navigation).getAllByRole('link')).toHaveLength(3);
        expect(within(navigation).getByRole('link', { name: '사용자 이용안내' })).toHaveAttribute('aria-current', 'page');
        await user.click(within(navigation).getByRole('link', { name: '사업자 이용안내' }));
        expect(screen.getByRole('heading', { level: 1, name: '사업자 이용안내' })).toBeInTheDocument();
        await user.click(screen.getByRole('link', { name: '공통 이용안내', exact: true }));
        expect(screen.getByRole('heading', { level: 1, name: '공통 이용안내' })).toBeInTheDocument();
        expect(document.title).toBe('공통 이용안내 | RESERVE');
    });

    it('explains login, explicit waiting submission and QR rescanning after signup', () => {
        renderGuide('/guide/user');
        expect(screen.getByText(/앱에서 접수하려면 로그인해주세요/)).toBeInTheDocument();
        expect(screen.getByText(/회원가입 후 홈 등 다른 화면으로 이동했다면.*현장 접수 QR을 다시 스캔/)).toBeInTheDocument();
        expect(screen.getByText(/QR을 스캔하거나 회원가입하는 것만으로 접수되지 않아요/)).toBeInTheDocument();
        expect(screen.getByText(/개인정보 제공에 동의한 뒤 접수하기/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '내 웨이팅 확인하기' })).toHaveAttribute('href', '/my-reservations?tab=waiting');
        expect(screen.getByRole('link', { name: '로그인하기' })).toHaveAttribute('href', '/login');
        expect(screen.getByRole('link', { name: '회원가입하기' })).toHaveAttribute('href', '/signup');
    });

    it('connects actual business tools and keeps existing waits active during an intake pause', () => {
        renderGuide('/guide/business');
        expect(screen.getByText(/기존 대기는 유지되어 호출·입장 처리가 가능/)).toBeInTheDocument();
        expect(screen.getByText(/직원이 직접 대기 접수를 등록/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '가게 등록하기' })).toHaveAttribute('href', '/store/register');
        expect(screen.getByRole('link', { name: '웨이팅 명단 열기' })).toHaveAttribute('href', '/business?tab=waiting');
        expect(screen.getByRole('link', { name: 'QR 체크인 열기' })).toHaveAttribute('href', '/business?tab=qr-checkin');
        expect(screen.getByRole('link', { name: '광고 관리 열기' })).toHaveAttribute('href', '/business?tab=ads');
        expect(screen.getByRole('link', { name: '채팅 관리 열기' })).toHaveAttribute('href', '/business?tab=chat-intro');
        expect(screen.queryByText(/원\/일|최종 수정|2026년/)).toBeNull();
    });

    it('explains local search privacy, footer help and links to the current policies', () => {
        renderGuide('/guide/common');
        expect(screen.getByText(/같은 브라우저 탭의 이동·새로고침 동안 유지/)).toBeInTheDocument();
        expect(screen.getByText(/로그인·로그아웃이나 계정 전환 시 최근 검색은 삭제/)).toBeInTheDocument();
        expect(screen.getByText(/페이지 아래의 문의하기/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '비밀번호 찾기' })).toHaveAttribute('href', '/forgot-password');
        expect(screen.getByRole('link', { name: '서비스 이용약관' })).toHaveAttribute('href', '/terms');
        expect(screen.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute('href', '/privacy');
        expect(screen.getByRole('link', { name: '콘텐츠 출처·권리 안내' })).toHaveAttribute('href', '/content-sources');
    });
});
