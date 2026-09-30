import React from 'react';
import { render } from '@testing-library/react';
import { Tabs } from 'antd';
import { isMobile } from '@rc-component/util';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.restoreAllMocks());

describe('mobile tabs overflow patch', () => {
    it('retains the overflow button after mobile user-agent detection', () => {
        vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
        );
        const items = Array.from({ length: 12 }, (_, index) => ({
            key: String(index),
            label: `관리 탭 ${index + 1}`,
            children: `내용 ${index + 1}`,
        }));
        const { container } = render(<Tabs items={items} />);

        // render flushes the Tabs effect that changes mobile from false to true.
        expect(isMobile()).toBe(true);
        expect(container.querySelector('.ant-tabs-nav-more')).toHaveAttribute('type', 'button');
        expect(container.querySelector('.ant-tabs-nav-more')).toHaveAttribute('aria-haspopup', 'listbox');
    });
});
