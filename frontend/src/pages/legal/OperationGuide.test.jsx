import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OperationGuide from './OperationGuide';

describe('OperationGuide', () => {
    it('keeps the public operating route focused on actual self-service paths and policy links', () => {
        render(<MemoryRouter><OperationGuide /></MemoryRouter>);

        expect(screen.getByRole('heading', { level: 2, name: '운영 안내' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /가게 탐색하기/ })).toHaveAttribute('href', '/stores');
        expect(screen.getByRole('link', { name: /내 예약 확인하기/ })).toHaveAttribute('href', '/my-reservations');
        expect(screen.getByRole('link', { name: /광고 관리 열기/ })).toHaveAttribute('href', '/business?tab=ads');
        expect(screen.getByRole('link', { name: /콘텐츠 출처·권리 안내/ })).toHaveAttribute('href', '/content-sources');
    });
});
