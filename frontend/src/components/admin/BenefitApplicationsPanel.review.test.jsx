import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BenefitApplicationsPanel from './BenefitApplicationsPanel';
import { feedMediaUrl } from '../../utils/feed';

const api = vi.hoisted(() => ({ applications: vi.fn(), application: vi.fn(), review: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../../services/storeNewsService', () => ({ default: api }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { success: api.success, error: api.error } }) }));
vi.mock('../../hooks/storeNewsQueries', () => ({
    useStoreNewsConfig: () => ({ data: { benefitApprovalEnabled: true }, isPending: false }),
    storeNewsKeys: { applications: params => ['store-news', 'applications', params], application: id => ['store-news', 'application', id] },
    invalidateStoreNews: () => Promise.resolve(),
}));
vi.mock('../common', () => ({
    Button: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    DataState: ({ title, onRetry }) => <div>{title}{onRetry && <button onClick={onRetry}>다시 조회</button>}</div>,
    FilterMenu: () => null,
    RefreshButton: ({ onReload, 'aria-label': label }) => <button onClick={onReload} aria-label={label}>새로고침</button>,
    FormModal: ({ open, children, footer }) => open && <section role="dialog">{children}{footer}</section>,
    FormTextArea: props => <textarea {...props} />,
}));
vi.mock('../store-news/StoreNewsPresentation', () => ({
    BenefitDetailContent: ({ item }) => <div><output data-testid="review-revision">{item.revision}</output>
        <img key={item.images[0].url} src={feedMediaUrl(item.images[0].url)} alt="검토 사진" /></div>,
}));

const news = revision => ({ id: 7, revision, title: '혜택', storeName: '가게', benefitState: 'PENDING', state: 'PUBLISHED',
    images: [{ id: 70 + revision, url: `/api/admin/promotions/7/images/${70 + revision}` }] });
const photoLoaded = () => {
    const image = screen.getByAltText('검토 사진');
    Object.defineProperties(image, { complete: { value: true, configurable: true }, naturalWidth: { value: 100, configurable: true } });
    fireEvent.load(image);
};
function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<MemoryRouter initialEntries={['/admin?tab=benefit-applications']}><QueryClientProvider client={client}><BenefitApplicationsPanel /></QueryClientProvider></MemoryRouter>);
    return client;
}
beforeEach(() => {
    Object.values(api).forEach(mock => mock.mockReset());
    api.applications.mockResolvedValue({ content: [news(1)], page: { totalElements: 1 } });
    api.application.mockResolvedValue(news(1));
    api.review.mockResolvedValue({ ...news(2), benefitState: 'APPROVED' });
});

describe('benefit review snapshot boundary', () => {
    it('removes a deleted application and its cached preview instead of retaining review actions', async () => {
        const user = userEvent.setup(); const client = setup();
        await user.click(await screen.findByRole('button', { name: '검토', exact: true }));
        await screen.findByTestId('review-revision'); photoLoaded();
        await user.type(screen.getByLabelText('혜택 심사 사유'), '삭제 전 검토 사유');
        api.applications.mockResolvedValue({ content: [], page: { totalElements: 0 } });
        api.application.mockRejectedValue(Object.assign(new Error('missing'), { status: 404 }));
        await act(async () => client.invalidateQueries({ queryKey: ['store-news', 'application', 7] }));
        await screen.findByText('삭제되거나 철회된 소식이에요.');
        expect(screen.queryByTestId('review-revision')).toBeNull();
        expect(screen.queryByAltText('검토 사진')).toBeNull();
        expect(screen.queryByLabelText('혜택 심사 사유')).toBeNull();
        expect(screen.getByRole('button', { name: '승인', exact: true })).toBeDisabled();
        expect(screen.getByRole('button', { name: '반려', exact: true })).toBeDisabled();
        await screen.findByText('해당 상태의 혜택 신청이 없어요.');
        expect(api.review).not.toHaveBeenCalled();
    });
    it('shows a changed snapshot automatically, retains the note and requires acknowledgement and new photos', async () => {
        const user = userEvent.setup(); const client = setup();
        await user.click(await screen.findByRole('button', { name: '검토', exact: true }));
        await screen.findByTestId('review-revision'); photoLoaded();
        await user.type(screen.getByLabelText('혜택 심사 사유'), '처음 검토한 사유');
        await act(async () => client.setQueryData(['store-news', 'application', 7], news(2)));
        await waitFor(() => expect(screen.getByTestId('review-revision')).toHaveTextContent('2'));
        expect(screen.getByLabelText('혜택 심사 사유')).toHaveValue('처음 검토한 사유');
        expect(screen.getByRole('button', { name: '승인', exact: true })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: '변경 내용 확인' }));
        expect(screen.getByRole('button', { name: '승인', exact: true })).toBeDisabled();
        expect(api.review).not.toHaveBeenCalled();
        photoLoaded();
        await user.click(screen.getByRole('button', { name: '승인', exact: true }));
        await waitFor(() => expect(api.review).toHaveBeenCalledWith(7, { revision: 2, approved: true, note: '처음 검토한 사유' }));
    });

    it('refreshes a server conflict and requires confirmation before submitting the new revision', async () => {
        const user = userEvent.setup(); setup();
        await user.click(await screen.findByRole('button', { name: '검토', exact: true }));
        await screen.findByTestId('review-revision'); photoLoaded();
        await user.type(screen.getByLabelText('혜택 심사 사유'), '입력한 사유');
        api.application.mockResolvedValue(news(2));
        api.review.mockRejectedValueOnce(Object.assign(new Error('변경됨'), { status: 409 }));
        await user.click(screen.getByRole('button', { name: '승인', exact: true }));
        await waitFor(() => expect(api.review).toHaveBeenCalledWith(7, { revision: 1, approved: true, note: '입력한 사유' }));
        await waitFor(() => expect(screen.getByTestId('review-revision')).toHaveTextContent('2'));
        expect(screen.getByRole('button', { name: '승인', exact: true })).toBeDisabled();
        expect(screen.getByLabelText('혜택 심사 사유')).toHaveValue('입력한 사유');
        photoLoaded();
        await user.click(screen.getByRole('button', { name: '변경 내용 확인' }));
        await user.click(screen.getByRole('button', { name: '승인', exact: true }));
        await waitFor(() => expect(api.review).toHaveBeenLastCalledWith(7, { revision: 2, approved: true, note: '입력한 사유' }));
    });

    it('recognizes already loaded photos after reloading an unchanged snapshot', async () => {
        const user = userEvent.setup(); setup();
        await user.click(await screen.findByRole('button', { name: '검토', exact: true }));
        await screen.findByTestId('review-revision'); photoLoaded();
        await user.type(screen.getByLabelText('혜택 심사 사유'), '검토');
        await user.click(screen.getByRole('button', { name: '혜택 신청 새로고침' }));
        await waitFor(() => expect(api.application).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.getByRole('button', { name: '승인', exact: true })).toBeEnabled());
        expect(screen.getByLabelText('혜택 심사 사유')).toHaveValue('검토');
    });
});
