import { lazy, Suspense, useState } from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { DataState } from '../common';
import EditorDialog from '../common/EditorDialog';
import EditorLoading from '../feed/EditorLoading';
import { useStoreNewsConfig, storeNewsKeys } from '../../hooks/storeNewsQueries';
import storeNewsService from '../../services/storeNewsService';
import useAuthStore from '../../store/useAuthStore';
import { isReadAccessDenied } from '../../hooks/liveUpdateQueries';

const StoreNewsComposer = lazy(() => import('./StoreNewsComposer'));

export default function StoreNewsEditor({ open, newsId, initialStoreId, onClose, onSaved }) {
    const user = useAuthStore(state => state.user);
    // 닫힘 애니메이션에는 이전 항목을 유지하고, 새로 열 때만 편집 스냅샷을 준비한다.
    const [selection, setSelection] = useState({ open, id: newsId, news: null, session: 0 });
    const selecting = selection.open !== open || open && selection.id !== newsId;
    const current = selecting ? { open, id: open ? newsId : selection.id, news: open ? null : selection.news,
        session: selection.session + (open ? 1 : 0) } : selection;
    if (selecting) setSelection(current);
    const id = current.id;
    const business = user?.role === 'BUSINESS';
    const config = useStoreNewsConfig(open && business);
    const enabled = business && config.data?.enabled === true;
    const stores = useQuery({ queryKey: storeNewsKeys.stores(), queryFn: ({ signal }) => storeNewsService.stores(signal), enabled: open && enabled });
    const detail = useQuery({ queryKey: storeNewsKeys.detail(id), queryFn: ({ signal }) => storeNewsService.detail(id, signal),
        enabled: open && enabled && Boolean(id), staleTime: 0, retry: false });
    const ready = Boolean(current.news);
    if (!selecting && open && id && !ready && detail.isSuccess && !detail.isFetching && detail.data?.id === id) {
        setSelection({ ...current, news: detail.data });
    }
    const owned = Array.isArray(stores.data) ? stores.data : stores.data?.content || [];
    let body;
    if (!business) body = <DataState state="empty" title="가게 소식은 사업자 계정에서 작성할 수 있어요." />;
    else if (config.isError && !config.data) body = <DataState state="error" title="가게 소식 상태를 불러오지 못했어요." error={config.error} onRetry={config.refetch} retrying={config.isFetching} />;
    else if (config.isSuccess && !enabled) body = <DataState state="empty" kind="news" title="가게 소식 작성을 준비하고 있어요." />;
    else if (stores.isError && !stores.data || id && detail.isError && (!ready || isReadAccessDenied(detail.error))) {
        const failed = stores.isError && !stores.data ? stores : detail;
        body = <DataState state="error" title="작성 정보를 불러오지 못했어요." error={failed.error} onRetry={failed.refetch} retrying={failed.isFetching} />;
    } else if (config.isPending || stores.isPending || open && id && !ready) body = <EditorLoading news />;
    else if (!owned.length) body = <DataState state="empty" kind="store" title="소식을 게시할 운영 중인 내 가게가 없어요." />;
    else body = <StoreNewsComposer key={current.session} open={open} news={id ? current.news : undefined} initialStoreId={initialStoreId}
        stores={owned} config={config.data} onClose={onClose} onSaved={onSaved} />;
    return <EditorDialog open={open} title="가게 소식 작성" width={680} onClose={onClose} rootClassName="reserve-feed-modal reserve-store-news-modal">
        <Suspense fallback={<EditorLoading news />}>{body}</Suspense>
    </EditorDialog>;
}
StoreNewsEditor.propTypes = { open: PropTypes.bool.isRequired, newsId: PropTypes.number, initialStoreId: PropTypes.number,
    onClose: PropTypes.func.isRequired, onSaved: PropTypes.func.isRequired };
