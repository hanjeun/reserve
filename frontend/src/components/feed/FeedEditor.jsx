import { lazy, Suspense, useState } from 'react';
import PropTypes from 'prop-types';
import EditorDialog from '../common/EditorDialog';
import DataState from '../common/DataState';
import FeedEditorLoading, { FeedProfileLoading } from './FeedEditorLoading';
import { useQuery } from '@tanstack/react-query';
import { feedKeys, useFeedProfile } from '../../hooks/feedQueries';
import feedService from '../../services/feedService';
import { httpStatusOf, isMissingRequestError } from '../../utils/listErrorMessage';
import useAuthStore from '../../store/useAuthStore';

const FeedComposer = lazy(() => import('./FeedComposer'));
const FeedProfileForm = lazy(() => import('./FeedProfileForm'));

export default function FeedEditor({ open, post, config, onClose, onSaved }) {
    const business = useAuthStore(state => state.user?.role === 'BUSINESS');
    // 닫힌 AntD 본문은 memo로 갱신을 멈춘다. 본문의 open=false 효과에 초기화를 맡기지 않는다.
    const [selection, setSelection] = useState({ open, id: post?.id, post: null, session: 0 });
    const selecting = selection.open !== open || open && selection.id !== post?.id;
    const current = selecting ? { open, id: open ? post?.id : selection.id,
        post: open ? null : selection.post, session: selection.session + (open ? 1 : 0) } : selection;
    if (selecting) setSelection(current);
    const detail = useQuery({ queryKey: feedKeys.detail(current.id),
        queryFn: ({ signal }) => feedService.detail(current.id, signal),
        enabled: open && config.enabled && Boolean(current.id), staleTime: 0, retry: false });
    const ready = Boolean(current.post);
    if (!selecting && open && current.id && !ready && detail.isSuccess && !detail.isFetching && detail.data?.id === current.id) {
        setSelection({ ...current, post: detail.data });
    }
    const profile = useFeedProfile(open && config.enabled);
    const profileStage = profile.isSuccess && !profile.data;
    const loading = profileStage ? <FeedProfileLoading /> : <FeedEditorLoading business={business} />;
    const profileUnavailable = [401, 403].includes(httpStatusOf(profile.error));
    const detailUnavailable = [401, 403].includes(httpStatusOf(detail.error)) || isMissingRequestError(detail.error);
    const failed = profile.isError && (profile.data === undefined || profileUnavailable) ? profile
        : current.id && detail.isError && (!ready || detailUnavailable) ? detail : null;
    const body = failed
        ? <DataState state="error" title="작성 정보를 불러오지 못했어요." error={failed.error} onRetry={failed.refetch} retrying={failed.isFetching} />
        : profile.isPending || open && current.id && !ready ? loading
            : !profile.data ? <FeedProfileForm key={`profile:${current.session}`} open={open} onClose={onClose} onSaved={() => {}} />
                : <FeedComposer key={current.session} open={open} post={current.post} profile={profile.data} config={config} onClose={onClose} onSaved={onSaved} />;
    return <EditorDialog open={open} title={profileStage ? '처음 글쓰기 · 공개 닉네임' : current.id ? '게시물 수정' : '피드 글쓰기'} width={profileStage ? 520 : 680} onClose={onClose}>
        <Suspense fallback={loading}>{body}</Suspense>
    </EditorDialog>;
}
FeedEditor.propTypes = { open: PropTypes.bool.isRequired, post: PropTypes.object, config: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired, onSaved: PropTypes.func.isRequired };
