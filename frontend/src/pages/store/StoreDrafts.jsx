import { useQuery } from '@tanstack/react-query';
import PropTypes from 'prop-types';
import { PageDescription } from '../../components/common/PageTypography';
import TextLink from '../../components/common/TextLink';
import useAuthStore from '../../store/useAuthStore';
import { listStoreDrafts, STORE_DRAFT_TTL_DAYS } from '../../utils/storeDraftStorage';
import { FEED_PAGE_SIZE } from '../../utils/feed';
import DraftList from '../drafts/DraftList';

export default function StoreDrafts({ overview, page, onPageChange }) {
    const userId = useAuthStore(state => state.user?.id);
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const query = useQuery({
        queryKey: ['store-drafts', userId, sessionRevision],
        queryFn: () => listStoreDrafts(userId),
        enabled: userId != null,
        gcTime: 0,
        retry: false,
    });
    const drafts = query.data ?? [];
    const start = (page - 1) * FEED_PAGE_SIZE;
    const rows = drafts.slice(start, start + FEED_PAGE_SIZE).map(draft => {
        const name = draft.name || '이름 없는 가게';
        return {
            key: draft.key, name, detail: draft.storeId ? '수정 초안' : '등록 초안', savedAt: new Date(draft.savedAt).toISOString(),
            action: <TextLink to={draft.storeId ? `/store/${draft.storeId}/edit` : '/store/register'}
                state={{ storeDraftResume: { key: draft.key, savedAt: draft.savedAt } }}
                aria-label={`${name} 이어서 작성`}>이어서 작성</TextLink>,
        };
    });
    return <>
        {!overview && <PageDescription>가게 초안과 선택한 사진은 이 브라우저에 {STORE_DRAFT_TTL_DAYS}일 동안 보관해요.</PageDescription>}
        <DraftList rows={rows} query={query} total={drafts.length} page={page} onPageChange={onPageChange} overview={overview}
            kind="store" label="가게 초안" emptyTitle="임시저장한 가게가 없어요."
            emptyAction={<TextLink to="/store/register">새 가게 등록</TextLink>} />
    </>;
}

StoreDrafts.propTypes = { overview: PropTypes.bool.isRequired, page: PropTypes.number.isRequired, onPageChange: PropTypes.func.isRequired };
