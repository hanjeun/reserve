import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChartCard from './ChartCard';

describe('ChartCard accessibility fallback', () => {
    it('exposes a semantic summary and real data table while hiding the duplicate visual chart', () => {
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
        expect(screen.getByRole('table', { name: '예약 추이 원본 데이터' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: '날짜' })).toBeInTheDocument();
        expect(screen.getByText('2026-09-11')).toBeInTheDocument();
        expect(container.querySelector('[aria-hidden="true"]')).toContainElement(screen.getByTestId('visual-chart'));
        expect(screen.getByRole('region', { name: '예약 추이' })).toHaveStyle({ alignSelf: 'flex-start' });
    });
});
