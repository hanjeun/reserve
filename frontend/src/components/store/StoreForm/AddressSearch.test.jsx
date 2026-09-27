import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddressSearch from './AddressSearch';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../api/axios', () => ({ default: api }));
vi.mock('@ant-design/icons', async importOriginal => ({
    ...(await importOriginal()),
    EnvironmentOutlined: () => <span />,
}));

const address = (road) => ({
    road_address: { address_name: road, zone_no: '12345', building_name: '건물' },
    address: { address_name: `${road} 지번` }, x: '127.1', y: '37.2',
});
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

describe('address search result boundaries', () => {
    beforeEach(() => api.get.mockReset());

    it('does not invent a result state or request for short input', async () => {
        render(<AddressSearch />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '서울' } });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
        expect(api.get).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByText(/검색 결과가 없어요/)).not.toBeInTheDocument();
    });

    it('labels a successful empty response without offering an error retry', async () => {
        api.get.mockResolvedValue({ documents: [] });
        render(<AddressSearch />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '서울 종로' } });
        expect(await screen.findByRole('status')).toHaveTextContent('검색 결과가 없어요');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', screen.getByRole('status').id);
    });

    it('shows a failure and retries the current query without changing address metadata', async () => {
        api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ documents: [address('서울 종로 도로')] });
        const onMeta = vi.fn();
        const onChange = vi.fn();
        render(<AddressSearch onMeta={onMeta} onChange={onChange} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '서울 종로' } });
        expect(await screen.findByRole('alert')).toHaveTextContent('주소 검색에 실패했어요');
        expect(screen.queryByText(/검색 결과가 없어요/)).not.toBeInTheDocument();
        expect(onMeta).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        const result = await screen.findByRole('option');
        expect(api.get).toHaveBeenLastCalledWith('/api/address/search', { params: { query: '서울 종로' } });
        fireEvent.mouseDown(result);
        expect(onChange).toHaveBeenCalledWith('서울 종로 도로');
        expect(onMeta).toHaveBeenCalledWith({ zipCode: '12345', addressDetail: '건물', latitude: 37.2, longitude: 127.1 });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('ignores an old failure immediately after editing, before the next debounce request', async () => {
        const old = deferred();
        api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ documents: [] });
        render(<AddressSearch />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '서울 종로' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
        fireEvent.change(input, { target: { value: '부산 해운대' } });
        await act(async () => old.reject(new Error('old query failed')));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(await screen.findByRole('status')).toHaveTextContent('검색 결과가 없어요');
        expect(api.get).toHaveBeenLastCalledWith('/api/address/search', { params: { query: '부산 해운대' } });
    });

    it('does not replace the latest query results with a late previous response', async () => {
        const old = deferred();
        api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ documents: [address('부산 새 도로')] });
        render(<AddressSearch />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '서울 종로' } });
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
        fireEvent.change(input, { target: { value: '부산 해운대' } });
        expect(await screen.findByRole('option')).toHaveTextContent('부산 새 도로');
        await act(async () => old.resolve({ documents: [address('서울 옛 도로')] }));
        expect(screen.getByRole('option')).toHaveTextContent('부산 새 도로');
        expect(screen.queryByText('서울 옛 도로')).not.toBeInTheDocument();
    });

    it('makes exit-animation results inert as soon as the query changes', async () => {
        api.get.mockResolvedValue({ documents: [address('서울 옛 도로')] });
        const onMeta = vi.fn();
        render(<AddressSearch onMeta={onMeta} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '서울 종로' } });
        const result = await screen.findByRole('option');
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '부산 새 주소' } });
        fireEvent.mouseDown(result);
        expect(onMeta).not.toHaveBeenCalled();
        expect(screen.getByRole('textbox')).toHaveValue('부산 새 주소');
    });

    it('preserves supplied address metadata on focus and clears it only when editing', () => {
        const onMeta = vi.fn();
        render(<AddressSearch value="서울 기존 도로" zipCode="12345" addressDetail="101호" onMeta={onMeta} />);
        const input = screen.getByDisplayValue('서울 기존 도로');
        fireEvent.focus(input);
        expect(onMeta).not.toHaveBeenCalled();
        expect(screen.getByDisplayValue('101호')).toBeInTheDocument();
        fireEvent.change(input, { target: { value: '부산 새 도로' } });
        expect(onMeta).toHaveBeenCalledTimes(1);
        expect(onMeta).toHaveBeenCalledWith({ zipCode: '', addressDetail: '', latitude: null, longitude: null });
        expect(api.get).not.toHaveBeenCalled();
    });

    it('updates and clears postcode details when a parent restores form values', async () => {
        const { rerender } = render(<AddressSearch value="서울 기존 도로" zipCode="12345" addressDetail="101호" />);
        expect(screen.getByText('12345')).toBeInTheDocument();
        expect(screen.getByDisplayValue('101호')).toBeInTheDocument();

        rerender(<AddressSearch value="경기 복원 도로" zipCode="15455" addressDetail="2층" />);
        expect(await screen.findByText('15455')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2층')).toBeInTheDocument();

        rerender(<AddressSearch value="경기 복원 도로" zipCode="" addressDetail="" />);
        await waitFor(() => expect(screen.queryByText('15455')).not.toBeInTheDocument());
        expect(screen.getByPlaceholderText('상세주소 (동, 호수 등)')).toHaveValue('');
    });
});
