import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PageContainer from './PageContainer';

describe('PageContainer width contract', () => {
    it('counts horizontal gutters inside the viewport width without relying on an AntD ancestor', () => {
        const { container } = render(<PageContainer size="sm" paddingX="16px">모바일 폼</PageContainer>);
        const page = container.firstChild;
        expect(page.style.boxSizing).toBe('border-box');
        expect(page.style.width).toBe('100%');
        expect(page.style.maxWidth).toBe('420px');
        expect(page.style.padding).toBe('40px 16px 80px');
    });

    it('preserves desktop sizing, custom styles and accessibility attributes', () => {
        const { container } = render(<PageContainer size="lg" className="example-page" aria-label="작업 화면" style={{ paddingTop: 48 }}>내용</PageContainer>);
        const page = container.firstChild;
        expect(page).toHaveClass('reserve-page-container', 'example-page');
        expect(page).toHaveAttribute('aria-label', '작업 화면');
        expect(page.style.maxWidth).toBe('1000px');
        expect(page.style.paddingTop).toBe('48px');
        expect(page.style.boxSizing).toBe('border-box');
    });
});
