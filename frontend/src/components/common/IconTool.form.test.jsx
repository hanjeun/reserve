import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import IconTool from './IconTool';
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { info: vi.fn() } }) }));

it('keeps tools from submitting and supports explicit validated form submission', () => {
    const submit = vi.fn(event => event.preventDefault());
    render(<form onSubmit={submit}><input aria-label="합성 코드" required />
        <IconTool label="도구" icon={<span aria-hidden="true">+</span>} />
        <IconTool label="확인" icon={<span aria-hidden="true">✓</span>} htmlType="submit" /></form>);
    fireEvent.click(screen.getByRole('button', { name: '도구' }));
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('합성 코드'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(submit).toHaveBeenCalledTimes(1);
});

it.each([{ loading: true }, { disabled: true }, { unavailableReason: '기존 인증을 먼저 확인해주세요.' }])('does not submit while unavailable ($loading, $disabled)', state => {
    const submit = vi.fn(event => event.preventDefault());
    render(<form onSubmit={submit}><IconTool label="확인" icon={<span aria-hidden="true">✓</span>} htmlType="submit" {...state} /></form>);
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(submit).not.toHaveBeenCalled();
});
