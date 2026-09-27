import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import BannerMotionPicker from './BannerMotionPicker';

const Harness = () => {
    const [value, setValue] = useState('SOFT_RISE');
    return <BannerMotionPicker value={value} onChange={setValue} />;
};

describe('BannerMotionPicker', () => {
    it('animates only the selected motion sample', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        const soft = screen.getByRole('radio', { name: /부드럽게 올라오기/ });
        const tilt = screen.getByRole('radio', { name: /3D로 세워지기/ });
        expect(soft.querySelector('.reserve-ad-motion-demo')).toHaveClass('reserve-ad-motion-demo--soft-rise');
        expect(tilt.querySelector('.reserve-ad-motion-demo')).not.toHaveClass('reserve-ad-motion-demo--tilt-up-3d');

        await user.click(tilt);

        expect(soft.querySelector('.reserve-ad-motion-demo')).not.toHaveClass('reserve-ad-motion-demo--soft-rise');
        expect(tilt.querySelector('.reserve-ad-motion-demo')).toHaveClass('reserve-ad-motion-demo--tilt-up-3d');
    });
});
