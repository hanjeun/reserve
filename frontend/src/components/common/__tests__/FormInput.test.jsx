import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FormInput from '../FormInput';

vi.mock('antd', async () => {
    const ReactModule = await import('react');
    const MockInput = ReactModule.forwardRef(function MockInput(props, ref) {
        const inputProps = { ...props };
        for (const prop of ['variant', 'suffix', 'prefix', 'showCount']) delete inputProps[prop];
        return ReactModule.createElement('input', { ...inputProps, ref });
    });
    MockInput.Password = MockInput;
    return { Input: MockInput, InputNumber: MockInput };
});

describe('FormInput.WithButton', () => {
    it('routes the input and action through the shared design-system classes', async () => {
        const user = userEvent.setup();
        const onButtonClick = vi.fn();

        render(
            <FormInput.WithButton
                placeholder="이메일"
                buttonText="인증번호 발송"
                onButtonClick={onButtonClick}
            />,
        );

        expect(screen.getByPlaceholderText('이메일')).toHaveClass('reserve-form-field');
        const button = screen.getByRole('button', { name: '인증번호 발송' });
        expect(button).toHaveClass('reserve-form-field-button');
        await user.click(button);
        expect(onButtonClick).toHaveBeenCalledOnce();
    });

    it('announces and disables the action while loading', () => {
        render(
            <FormInput.WithButton
                placeholder="이메일"
                buttonText="인증번호 발송"
                buttonLoading
            />,
        );

        const button = screen.getByRole('button', { name: '인증번호 발송 처리 중' });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
    });
});
