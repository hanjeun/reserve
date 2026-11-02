import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import DraftTransfer from './DraftTransfer';
import useAuthStore from '../../store/useAuthStore';
import { listStoreDrafts } from '../../utils/storeDraftStorage';
import { parseStoreDraftArchive, restoreStoreDraftArchive } from '../../utils/storeDraftArchive';

const notice = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: notice }) }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../utils/storeDraftStorage', () => ({ listStoreDrafts: vi.fn() }));
vi.mock('../../utils/storeDraftArchive', () => ({ exportStoreDraftArchive: vi.fn(), parseStoreDraftArchive: vi.fn(), restoreStoreDraftArchive: vi.fn() }));

beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ user: { id: 7 }, isLoggedIn: true });
    listStoreDrafts.mockResolvedValue([]);
});
const show = () => render(<MemoryRouter><DraftTransfer /></MemoryRouter>);

it('reports a failed import as a message without restoring partial data', async () => {
    parseStoreDraftArchive.mockRejectedValue(new Error('초안 파일을 확인해주세요.'));
    show(); await screen.findByText('이 주소에 저장한 가게 초안이 없어요.');
    fireEvent.change(screen.getByLabelText('임시저장 파일 가져오기'), { target: { files: [new File(['{}'], 'draft.json', { type: 'application/json' })] } });
    await waitFor(() => expect(notice.error).toHaveBeenCalledExactlyOnceWith('초안 파일을 확인해주세요.'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(restoreStoreDraftArchive).not.toHaveBeenCalled();
});

it('keeps an initial read failure visible so that the empty state is not mistaken for loaded data', async () => {
    listStoreDrafts.mockRejectedValueOnce(new Error('초안 목록을 읽지 못했어요.')).mockResolvedValueOnce([]);
    show(); expect(await screen.findByText('가게 초안을 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByText('이 주소에 저장한 가게 초안이 없어요.')).toBeNull();
    expect(notice.error).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByText('이 주소에 저장한 가게 초안이 없어요.')).toBeInTheDocument();
});
