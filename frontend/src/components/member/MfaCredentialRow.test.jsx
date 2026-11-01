import { fireEvent, render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { beforeEach, expect, it, vi } from 'vitest';
import MfaCredentialRow from './MfaCredentialRow';

const credential = { id: 'synthetic-key', kind: 'PASSKEY', name: 'PC · Chrome' };
const remove = vi.fn();
const view = props => <AntApp><MfaCredentialRow credential={credential} onRemove={remove} {...props} /></AntApp>;
beforeEach(() => vi.clearAllMocks());

it('자동 표시 이름과 기존 저장 이름을 보존하고 수동 이름 입력은 표시하지 않아요', () => {
    const page = render(view());
    expect(screen.getByText('PC · Chrome')).toBeInTheDocument();
    const tool = screen.getByRole('button', { name: 'PC · Chrome 해제' });
    expect(tool).toHaveClass('reserve-icon-tool');
    expect(tool.textContent).toBe('');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    page.rerender(view({ credential: { ...credential, name: '기존에 저장한 이름' } }));
    expect(screen.getByText('기존에 저장한 이름')).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
});

it('해제는 선택한 수단의 식별자로 한 번 요청해요', () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'PC · Chrome 해제' }));
    expect(remove).toHaveBeenCalledExactlyOnceWith('synthetic-key');
});

it('요청 중에는 다른 인증 수단을 해제하지 않아요', () => {
    render(view({ busy: true }));
    const tool = screen.getByRole('button', { name: 'PC · Chrome 해제' });
    expect(tool).toBeDisabled();
    fireEvent.click(tool);
    expect(remove).not.toHaveBeenCalled();
});

it('관리자의 마지막 인증 수단은 해제 동작을 실행하지 않아요', () => {
    render(view({ lastRequired: true }));
    const tool = screen.getByRole('button', { name: 'PC · Chrome 해제' });
    expect(tool).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(tool);
    expect(remove).not.toHaveBeenCalled();
});
