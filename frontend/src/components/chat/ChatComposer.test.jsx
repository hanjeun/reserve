import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatComposer from './ChatComposer';

const props = () => ({ value: '안녕하세요', onChange: vi.fn(), onSend: vi.fn(), onFileChange: vi.fn() });
describe('shared chat composer', () => {
    it('sends with Enter but not during IME composition or Shift+Enter', () => {
        const inputProps = props();
        render(<ChatComposer {...inputProps} />);
        const input = screen.getByRole('textbox', { name: '메시지 입력' });
        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
        fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
        expect(inputProps.onSend).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(inputProps.onSend).toHaveBeenCalledOnce();
    });
    it('adds a searched Unicode emoji at the text selection without sending', async () => {
        const inputProps = props();
        render(<ChatComposer {...inputProps} />);
        const input = screen.getByRole('textbox', { name: '메시지 입력' });
        input.setSelectionRange(0, 2);
        fireEvent.click(screen.getByRole('button', { name: '이모지 선택' }));
        fireEvent.change(await screen.findByRole('searchbox', { name: '이모지 검색' }), { target: { value: 'coffee' } });
        fireEvent.click(screen.getByRole('button', { name: '커피 ☕' }));
        expect(inputProps.onChange).toHaveBeenCalledWith('☕하세요');
        expect(inputProps.onSend).not.toHaveBeenCalled();
        await waitFor(() => expect(input).toHaveFocus());
    });
    it('does not exceed the message limit and supports Escape back to the trigger', async () => {
        const inputProps = { ...props(), value: 'a'.repeat(2000) };
        render(<ChatComposer {...inputProps} />);
        screen.getByRole('textbox').setSelectionRange(2000, 2000);
        const trigger = screen.getByRole('button', { name: '이모지 선택' });
        fireEvent.click(trigger);
        const search = await screen.findByRole('searchbox');
        fireEvent.click(screen.getByRole('button', { name: '웃음 😀' }));
        expect(inputProps.onChange).not.toHaveBeenCalled();
        fireEvent.keyDown(search, { key: 'Escape' });
        expect(trigger).toHaveFocus();
    });
    it('keeps the interrupt button usable during sending without allowing another send', () => {
        const inputProps = { ...props(), sending: true, onCancel: vi.fn() };
        render(<ChatComposer {...inputProps} imageEnabled />);
        fireEvent.click(screen.getByRole('button', { name: '전송 요청 중단' }));
        expect(inputProps.onCancel).toHaveBeenCalledOnce();
        expect(screen.getByRole('button', { name: '사진 첨부' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '이모지 선택' })).toBeDisabled();
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
        expect(inputProps.onSend).not.toHaveBeenCalled();
    });
});
