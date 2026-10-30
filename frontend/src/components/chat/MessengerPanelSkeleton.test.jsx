import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MessengerPanelSkeleton from './MessengerPanelSkeleton';

describe('메신저 최초 로딩', () => {
    it('홈의 최초 골격에 대화 목록을 먼저 표시하지 않아요', () => {
        const { container } = render(<MessengerPanelSkeleton view="home" />);
        expect(screen.getByLabelText('메신저를 불러오는 중')).toBeInTheDocument();
        expect(screen.queryByLabelText('대화 목록을 불러오는 중')).toBeNull();
        expect(container.querySelector('.reserve-messenger-home')).toBeInTheDocument();
        expect(screen.getAllByRole('button')).toHaveLength(3);
        for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    });
    it('가게 문의를 바로 열 때 목록 대신 대화 골격을 표시해요', () => {
        render(<MessengerPanelSkeleton view="conversations" thread />);
        expect(screen.getByLabelText('대화를 불러오는 중')).toBeInTheDocument();
        expect(screen.queryByLabelText('대화 목록을 불러오는 중')).toBeNull();
        expect(screen.queryByRole('navigation', { name: '메신저 화면' })).toBeNull();
    });
    it('설정 골격에 대화 목록을 표시하지 않아요', () => {
        const { container } = render(<MessengerPanelSkeleton view="settings" />);
        expect(container.querySelector('.reserve-messenger-settings-profile')).toBeInTheDocument();
        expect(screen.queryByLabelText('대화 목록을 불러오는 중')).toBeNull();
    });
    it('대화 목록의 최초 골격은 패널 배치를 유지해요', () => {
        const { container } = render(<MessengerPanelSkeleton view="conversations" />);
        expect(screen.getByLabelText('대화 목록을 불러오는 중')).toBeInTheDocument();
        expect(container.querySelector('.reserve-messenger--panel')).toBeInTheDocument();
    });
});
