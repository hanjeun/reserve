import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ChatIntroEditor from './ChatIntroEditor';

const renderEditor = (props = {}) => render(
    <ChatIntroEditor
        intro={{ notice: null, items: [] }}
        onSave={vi.fn().mockResolvedValue(undefined)}
        kind="store"
        identity={{ name: '카페 리저브' }}
        {...props}
    />,
);
const preview = () => screen.getByRole('region', { name: '미리보기' });

describe('chat intro editor', () => {
    it('starts from saved items, and the preview is the real customer intro', () => {
        renderEditor({ intro: { notice: '반가워요', items: [{ question: '주차', answer: '2대 가능' }] } });
        expect(screen.getByLabelText('질문 1')).toHaveValue('주차');
        expect(screen.getByLabelText('답변 1')).toHaveValue('2대 가능');
        // 공지사항이 확성기 줄의 기본 문구("안녕하세요. 카페 리저브에서 안내해드려요.")를 대신한다.
        expect(within(preview()).getByText('반가워요')).toBeInTheDocument();
        expect(within(preview()).queryByText('안녕하세요. 카페 리저브에서 안내해드려요.')).toBeNull();
        expect(within(preview()).getByText('카페 리저브')).toBeInTheDocument();
        fireEvent.click(within(preview()).getByRole('button', { name: '주차' }));
        expect(within(preview()).getByText('2대 가능')).toBeInTheDocument();
        expect(within(preview()).getByText('가게 문의')).toBeInTheDocument();
        expect(within(preview()).getByPlaceholderText('메시지를 입력하세요')).toBeInTheDocument();
        fireEvent.click(within(preview()).getByRole('button', { name: '처음부터' }));
        expect(within(preview()).getByRole('button', { name: '주차' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '저장하기' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled();
    });

    it('previews exactly what customers see when nothing is set up for a store', () => {
        renderEditor();
        // 가게도 설정 전부터 기본 안내가 보인다(손님 화면과 같다).
        expect(within(preview()).getByText('안녕하세요. 카페 리저브에서 안내해드려요.')).toBeInTheDocument();
        expect(within(preview()).getByLabelText('문의 시작 안내')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('공지사항'), { target: { value: '어서 오세요' } });
        expect(within(preview()).getByText('어서 오세요')).toBeInTheDocument();
        expect(within(preview()).getByText(/사장님이 확인 후 답변드릴게요/)).toBeInTheDocument();
    });

    it('reverts unsaved edits to the saved content', () => {
        renderEditor({ intro: { notice: '반가워요', items: [{ question: '주차', answer: '2대 가능' }] } });
        fireEvent.change(screen.getByLabelText('공지사항'), { target: { value: '바뀐 인사말' } });
        fireEvent.click(screen.getByRole('button', { name: '질문 1 삭제' }));
        expect(screen.getByText('저장하지 않은 변경이 있어요')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
        expect(screen.getByLabelText('공지사항')).toHaveValue('반가워요');
        expect(screen.getByLabelText('질문 1')).toHaveValue('주차');
        expect(screen.getByRole('button', { name: '저장하기' })).toBeDisabled();
    });

    it('offers a settings/preview switch whose panes stay in the document', () => {
        const { container } = renderEditor();
        const editor = container.querySelector('.reserve-chat-intro-editor');
        fireEvent.click(screen.getByRole('radio', { name: '미리보기' }));
        expect(editor).toHaveClass('is-preview-pane');
        fireEvent.click(screen.getByRole('radio', { name: '설정' }));
        expect(editor).not.toHaveClass('is-preview-pane');
    });

    it('reflects typing in the preview only once both question and answer exist', () => {
        renderEditor();
        fireEvent.click(screen.getByRole('button', { name: '질문 추가' }));
        fireEvent.change(screen.getByLabelText('질문 1'), { target: { value: '영업시간' } });
        expect(within(preview()).queryByRole('button', { name: '영업시간' })).toBeNull();
        fireEvent.change(screen.getByLabelText('답변 1'), { target: { value: '10시~22시' } });
        expect(within(preview()).getByRole('button', { name: '영업시간' })).toBeInTheDocument();
    });

    it('shows inline errors for blank and duplicate items and does not save', () => {
        const onSave = vi.fn();
        renderEditor({ onSave });
        fireEvent.click(screen.getByRole('button', { name: '질문 추가' }));
        fireEvent.click(screen.getByRole('button', { name: '질문 추가' }));
        fireEvent.change(screen.getByLabelText('질문 1'), { target: { value: '주차' } });
        fireEvent.change(screen.getByLabelText('답변 1'), { target: { value: '가능' } });
        fireEvent.change(screen.getByLabelText('질문 2'), { target: { value: ' 주차 ' } });
        fireEvent.click(screen.getByRole('button', { name: '저장하기' }));
        expect(screen.getByText('같은 질문이 이미 있어요.')).toBeInTheDocument();
        expect(screen.getByText('답변을 입력해주세요.')).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('답변 2'), { target: { value: '불가' } });
        expect(screen.queryByText('답변을 입력해주세요.')).toBeNull();
    });

    it('allows at most five questions and removes items', () => {
        renderEditor();
        const add = screen.getByRole('button', { name: '질문 추가' });
        for (let i = 0; i < 5; i += 1) fireEvent.click(add);
        expect(screen.getByText('5 / 5')).toBeInTheDocument();
        expect(add).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: '질문 3 삭제' }));
        expect(screen.getByText('4 / 5')).toBeInTheDocument();
        expect(add).toBeEnabled();
    });

    it('saves trimmed content and becomes clean with the server response', async () => {
        const onSave = vi.fn().mockResolvedValue({ configured: true, notice: '9월 30일은 휴무', items: [{ question: '주차 되나요?', answer: '네' }] });
        renderEditor({ onSave });
        fireEvent.change(screen.getByLabelText('공지사항'), { target: { value: '  9월 30일은   휴무  ' } });
        fireEvent.click(screen.getByRole('button', { name: '질문 추가' }));
        fireEvent.change(screen.getByLabelText('질문 1'), { target: { value: ' 주차   되나요? ' } });
        fireEvent.change(screen.getByLabelText('답변 1'), { target: { value: ' 네 ' } });
        fireEvent.click(screen.getByRole('button', { name: '저장하기' }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith({
            notice: '9월 30일은 휴무', greeting: null, displayName: null, avatarUrl: null, items: [{ question: '주차 되나요?', answer: '네' }],
        }));
        await waitFor(() => expect(screen.getByRole('button', { name: '저장하기' })).toBeDisabled());
        expect(screen.getByLabelText('질문 1')).toHaveValue('주차 되나요?');
    });

    it('keeps the typed content when saving fails', async () => {
        const onSave = vi.fn().mockRejectedValue(new Error('offline'));
        renderEditor({ onSave });
        fireEvent.change(screen.getByLabelText('공지사항'), { target: { value: '반가워요' } });
        fireEvent.click(screen.getByRole('button', { name: '저장하기' }));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(screen.getByLabelText('공지사항')).toHaveValue('반가워요');
        expect(screen.getByRole('button', { name: '저장하기' })).toBeEnabled();
    });

    it('keeps store identity read-only and never sends a store display name or photo', async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        renderEditor({ onSave, intro: { notice: '', greeting: '안녕하세요', items: [] } });
        expect(screen.queryByLabelText('표시 이름')).toBeNull();
        expect(screen.getByText(/사칭하지 못하게/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('인사말'), { target: { value: '반가워요' } });
        fireEvent.click(screen.getByRole('button', { name: '저장하기' }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ greeting: '반가워요', displayName: null, avatarUrl: null })));
    });

    it('lets the support admin rename, upload a photo and reset the greeting, with inline photo errors', async () => {
        const onUploadAvatar = vi.fn().mockResolvedValue('https://cdn.example/support/chat/new.png');
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(<ChatIntroEditor kind="support" identity={{ previewUserName: '회원' }} onSave={onSave} onUploadAvatar={onUploadAvatar}
            intro={{ notice: null, greeting: '바뀐 인사', displayName: 'RESERVE 고객지원', avatarUrl: null, items: [] }} />);
        fireEvent.change(screen.getByLabelText('표시 이름'), { target: { value: '리저브 도우미' } });
        expect(within(preview()).getByText('리저브 도우미')).toBeInTheDocument();
        const file = screen.getByLabelText('고객지원 사진 파일');
        fireEvent.change(file, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
        expect(screen.getByRole('alert')).toHaveTextContent('사진 파일만');
        fireEvent.change(file, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
        await waitFor(() => expect(onUploadAvatar).toHaveBeenCalled());
        expect(await screen.findByRole('button', { name: '기본 사진으로' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '기본 문구로' }));
        expect(screen.getByLabelText('인사말').value).toContain('관리자가 확인 후 답변드릴게요');
        fireEvent.click(screen.getByRole('button', { name: '저장하기' }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            displayName: '리저브 도우미', avatarUrl: 'https://cdn.example/support/chat/new.png',
        })));
    });
});
