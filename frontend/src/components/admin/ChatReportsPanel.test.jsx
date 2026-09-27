import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatReportsPanel from './ChatReportsPanel';
import { chatService } from '../../services';

vi.mock('../../services', () => ({
    chatService: {
        listReports: vi.fn(),
        getReportContext: vi.fn(),
        reviewReport: vi.fn(),
    },
}));

const renderPanel = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(
        <QueryClientProvider client={client}>
            <AntApp><ChatReportsPanel /></AntApp>
        </QueryClientProvider>,
    );
};

describe('ChatReportsPanel', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders a successful empty response as an empty report list without an error heading', async () => {
        chatService.listReports.mockResolvedValue(null);
        renderPanel();

        expect(await screen.findByText('해당 상태의 채팅 신고가 없습니다.')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: '가게 대화 신고' })).not.toBeInTheDocument();
    });

    it('distinguishes a missing server route from an empty report list', async () => {
        chatService.listReports.mockRejectedValue(Object.assign(new Error('정보를 찾을 수 없습니다.'), { status: 404 }));
        renderPanel();

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('비어 있는 상태가 아닙니다');
        expect(alert).toHaveTextContent('채팅 신고 기능을 찾지 못했습니다');
        expect(screen.queryByText('해당 상태의 채팅 신고가 없습니다.')).not.toBeInTheDocument();
    });

    it('uses one status roller on the left and keeps the count and refresh control in the toolbar', async () => {
        const user = userEvent.setup();
        chatService.listReports.mockResolvedValue({ content: [], page: { number: 0, totalPages: 0, totalElements: 0 } });
        const { container } = renderPanel();

        const statusFilter = await screen.findByRole('button', { name: '신고 상태' });
        expect(statusFilter).toHaveTextContent('전체 상태');
        expect(container.querySelector('.reserve-explore-filters')).toContainElement(statusFilter);
        expect(container.querySelector('.reserve-filter-toolbar-refresh')).toContainElement(
            screen.getByRole('button', { name: '새로고침' }),
        );

        await user.click(statusFilter);
        await user.click(await screen.findByText('접수'));
        await waitFor(() => expect(chatService.listReports).toHaveBeenLastCalledWith(0, 'OPEN'));
    });

    it('requires and sends an explicit resolution note', async () => {
        const user = userEvent.setup();
        chatService.listReports.mockResolvedValue({
            content: [{
                id: 5,
                roomId: 21,
                storeId: 31,
                storeName: '가게31',
                reporterRole: 'MEMBER',
                reason: 'SPAM',
                messageId: null,
                details: '반복 광고',
                status: 'OPEN',
                createdAt: '2026-09-12T22:00:00',
            }],
            page: { number: 0, totalPages: 1, totalElements: 1 },
        });
        chatService.reviewReport.mockResolvedValue({ id: 5, status: 'RESOLVED' });
        renderPanel();

        expect(await screen.findByText('가게31')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '처리' }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByPlaceholderText('확인 내용과 조치 또는 기각 사유를 적어주세요'), '스팸 확인 후 경고');
        await user.click(within(dialog).getByRole('button', { name: '처리 저장' }));

        await waitFor(() => expect(chatService.reviewReport).toHaveBeenCalledWith(5, {
            status: 'RESOLVED',
            resolutionNote: '스팸 확인 후 경고',
        }));
    });

    it('loads report conversation context only when an admin asks to view it', async () => {
        const user = userEvent.setup();
        chatService.listReports.mockResolvedValue({
            content: [{
                id: 9, storeName: '가게31', reporterRole: 'OWNER', reason: 'FRAUD',
                messageId: 90, details: '외부 결제 유도', status: 'OPEN', createdAt: '2026-09-12T22:00:00',
            }],
            page: { number: 0, totalPages: 1, totalElements: 1 },
        });
        chatService.getReportContext.mockResolvedValue({
            reportedMessage: { id: 90, senderRole: 'MEMBER', content: '외부 계좌로 보내세요' },
            recentMessages: [{ id: 90, senderRole: 'MEMBER', content: '외부 계좌로 보내세요' }],
        });
        renderPanel();

        await screen.findByText('가게31');
        expect(chatService.getReportContext).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '내용 보기' }));

        await waitFor(() => expect(chatService.getReportContext).toHaveBeenCalledWith(9));
        expect(await screen.findAllByText('외부 계좌로 보내세요')).toHaveLength(2);
    });
});
