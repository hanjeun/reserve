import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form, Input } from 'antd';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import useReportReviewDraft from './useReportReviewDraft';

function Harness({ read, readTarget }) {
    const [form] = Form.useForm();
    const report = useQuery({ queryKey: ['review'], queryFn: read, retry: false });
    const target = useQuery({ queryKey: ['target'], queryFn: readTarget || (() => null), enabled: Boolean(readTarget), retry: false });
    const draft = useReportReviewDraft({ selected: 1, report, form, target: readTarget ? target : undefined });
    return <><Form form={form}><Form.Item name="note"><Input aria-label="처리 이유" /></Form.Item></Form>
        <output data-testid="revision">{String(draft.revision)}</output>
        <output data-testid="conflict">{String(draft.conflict)}</output>
        <output data-testid="dirty">{String(draft.dirty)}</output>
        <output data-testid="target-revision">{String(draft.targetRevision)}</output>
        <output data-testid="target-conflict">{String(draft.targetConflict)}</output>
        <button disabled={!draft.ready || draft.conflict} type="button">저장</button>
        <button type="button" onClick={draft.reload}>최신 내용</button>
        <button type="button" onClick={() => draft.acceptTarget(1, 6)}>내 공개 변경 확인</button></>;
}

function setup(read, readTarget) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><Harness read={read} readTarget={readTarget} /></QueryClientProvider>);
    return client;
}

describe('report review drafts', () => {
    it('keeps the edited reason and old revision when another admin changes the report, until explicit reload succeeds', async () => {
        const user = userEvent.setup();
        let current = { id: 1, status: 'OPEN', hold: false, note: '', revision: 0 };
        const client = setup(() => Promise.resolve(current));
        await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
        await user.type(screen.getByLabelText('처리 이유'), '내 검토 사유');
        current = { ...current, status: 'RESOLVED', hold: true, note: '다른 관리자 사유', revision: 1 };
        await act(async () => { await client.invalidateQueries({ queryKey: ['review'] }); });
        await waitFor(() => expect(screen.getByTestId('conflict')).toHaveTextContent('true'));
        expect(screen.getByTestId('revision')).toHaveTextContent('0');
        expect(screen.getByLabelText('처리 이유')).toHaveValue('내 검토 사유');
        expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: '최신 내용' }));
        await waitFor(() => expect(screen.getByTestId('revision')).toHaveTextContent('1'));
        expect(screen.getByLabelText('처리 이유')).toHaveValue('다른 관리자 사유');
        expect(screen.getByTestId('dirty')).toHaveTextContent('false');
        expect(screen.getByRole('button', { name: '저장' })).toBeEnabled(); client.clear();
    });

    it('preserves input and the confirmed revision when reload fails', async () => {
        const user = userEvent.setup();
        const read = vi.fn().mockResolvedValueOnce({ id: 1, status: 'OPEN', hold: false, note: '', revision: 2 });
        const client = setup(read);
        await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
        await user.type(screen.getByLabelText('처리 이유'), '유지할 사유');
        read.mockRejectedValue(new Error('네트워크 실패'));
        await user.click(screen.getByRole('button', { name: '최신 내용' }));
        await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
        expect(screen.getByLabelText('처리 이유')).toHaveValue('유지할 사유');
        expect(screen.getByTestId('revision')).toHaveTextContent('2'); client.clear();
    });

    it('does not rebase an old visibility reason on an automatically refreshed post version', async () => {
        const user = userEvent.setup();
        let current = { id: 1, status: 'OPEN', revision: 0, postRevision: 5 };
        const client = setup(() => Promise.resolve(current));
        await waitFor(() => expect(screen.getByTestId('target-revision')).toHaveTextContent('5'));
        await user.type(screen.getByLabelText('처리 이유'), '검토 중인 입력');
        current = { ...current, postRevision: 6 };
        await act(async () => { await client.invalidateQueries({ queryKey: ['review'] }); });
        expect(screen.getByTestId('target-revision')).toHaveTextContent('5');
        await waitFor(() => expect(screen.getByTestId('target-conflict')).toHaveTextContent('true'));
        expect(screen.getByLabelText('처리 이유')).toHaveValue('검토 중인 입력');
        await user.click(screen.getByRole('button', { name: '최신 내용' }));
        await waitFor(() => expect(screen.getByTestId('target-revision')).toHaveTextContent('6'));
        await waitFor(() => expect(screen.getByTestId('target-conflict')).toHaveTextContent('false')); client.clear();
    });

    it('pins the current comment version separately from its report and explicitly reloads both', async () => {
        const user = userEvent.setup();
        let comment = { revision: 5 };
        const client = setup(() => Promise.resolve({ id: 1, status: 'OPEN', revision: 0 }), () => Promise.resolve(comment));
        await waitFor(() => expect(screen.getByTestId('target-revision')).toHaveTextContent('5'));
        comment = { revision: 6 };
        await act(async () => { await client.invalidateQueries({ queryKey: ['target'] }); });
        expect(screen.getByTestId('target-revision')).toHaveTextContent('5');
        await waitFor(() => expect(screen.getByTestId('target-conflict')).toHaveTextContent('true'));
        await user.click(screen.getByRole('button', { name: '최신 내용' }));
        await waitFor(() => expect(screen.getByTestId('target-revision')).toHaveTextContent('6'));
        expect(screen.getByTestId('revision')).toHaveTextContent('0');
        await waitFor(() => expect(screen.getByTestId('target-conflict')).toHaveTextContent('false')); client.clear();
    });

    it('accepts its own successful visibility mutation without overwriting an unsaved report note', async () => {
        const user = userEvent.setup();
        const client = setup(() => Promise.resolve({ id: 1, status: 'OPEN', revision: 0, postRevision: 5 }));
        await waitFor(() => expect(screen.getByTestId('target-revision')).toHaveTextContent('5'));
        await user.type(screen.getByLabelText('처리 이유'), '아직 저장하지 않은 처리 이유');
        await user.click(screen.getByRole('button', { name: '내 공개 변경 확인' }));
        await act(async () => { client.setQueryData(['review'], { id: 1, status: 'OPEN', revision: 0, postRevision: 6 }); });
        expect(screen.getByTestId('target-revision')).toHaveTextContent('6');
        await waitFor(() => expect(screen.getByTestId('target-conflict')).toHaveTextContent('false'));
        expect(screen.getByLabelText('처리 이유')).toHaveValue('아직 저장하지 않은 처리 이유');
        expect(screen.getByTestId('dirty')).toHaveTextContent('true'); client.clear();
    });
});
