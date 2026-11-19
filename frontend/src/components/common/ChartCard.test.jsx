import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChartCard from './ChartCard';

describe('ChartCard accessibility fallback', () => {
    it('opens a real data table and keeps the closing surface inert until its motion ends', async () => {
        const { container } = render(
            <ChartCard
                title="예약 추이"
                summary="기간 합계 3건입니다."
                tableColumns={[
                    { key: 'date', label: '날짜' },
                    { key: 'value', label: '예약' },
                ]}
                tableRows={[{ date: '2026-09-11', value: 3 }]}
            >
                <svg data-testid="visual-chart" />
            </ChartCard>,
        );

        expect(screen.getByRole('heading', { level: 3, name: '예약 추이' })).toBeInTheDocument();
        expect(screen.getByText('기간 합계 3건입니다.')).toBeInTheDocument();
        const toggle = screen.getByRole('button', { name: '데이터 표 보기' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('table', { name: '예약 추이 원본 데이터' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: '날짜' })).toBeInTheDocument();
        expect(screen.getByText('2026-09-11')).toBeInTheDocument();
        expect(container.querySelector('[aria-hidden="true"]')).toContainElement(screen.getByTestId('visual-chart'));
        expect(screen.getByRole('region', { name: '예약 추이' })).toHaveStyle({ alignSelf: 'flex-start' });
        fireEvent.click(toggle);
        const panel = document.getElementById(toggle.getAttribute('aria-controls'));
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(panel).toHaveAttribute('inert');
        expect(panel).toContainElement(panel.querySelector('table'));
        await waitFor(() => expect(panel).toHaveAttribute('hidden'));
        expect(panel.querySelector('table')).toBeNull();
    });
});
