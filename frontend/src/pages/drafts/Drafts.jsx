import { useState } from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import Button from '../../components/common/Button';
import TextLink from '../../components/common/TextLink';
import { PageDescription } from '../../components/common/PageTypography';
import WorkspaceLayout from '../../components/layout/WorkspaceLayout';
import WorkspacePanels from '../../components/layout/WorkspacePanels';
import FeedEditor from '../../components/feed/FeedEditor';
import StoreNewsEditor from '../../components/store-news/StoreNewsEditor';
import { hasAdminAccess, hasOwnerAccess } from '../../constants/roles';
import { feedKeys, useFeedConfig } from '../../hooks/feedQueries';
import { isReadAccessDenied } from '../../hooks/liveUpdateQueries';
import { storeNewsKeys, useStoreNewsConfig } from '../../hooks/storeNewsQueries';
import useWorkspaceNavigate from '../../hooks/useWorkspaceNavigate';
import useMailDrafts from '../../hooks/useMailDrafts';
import feedService from '../../services/feedService';
import storeNewsService from '../../services/storeNewsService';
import useAuthStore from '../../store/useAuthStore';
import { FEED_PAGE_SIZE, feedPage, feedTotal } from '../../utils/feed';
import { LOCAL_DRAFT_TTL_MS } from '../../utils/localDraftDatabase';
import StoreDrafts from '../store/StoreDrafts';
import DraftList from './DraftList';
import { DRAFTS_TITLE, draftPath, draftWorkspace } from './draftWorkspace';

const remoteSources = {
    posts: { queryKey: feedKeys.mine, read: feedService.myPosts, filter: { drafts: true }, kind: 'feed', label: '피드 초안',
        emptyTitle: '임시저장한 글이 없어요.', disabledTitle: '피드 작성을 준비하고 있어요.', to: '/feed', actionLabel: '피드 열기' },
    news: { queryKey: storeNewsKeys.mine, read: storeNewsService.mine, filter: { state: 'DRAFT' }, kind: 'news', label: '가게 소식 초안',
        emptyTitle: '임시저장한 가게 소식이 없어요.', disabledTitle: '가게 소식 작성을 준비하고 있어요.',
        to: '/business?tab=news', actionLabel: '가게 소식 관리' },
};

const postDraftName = post => {
    const text = post.content?.trim().replace(/\s+/g, ' ');
    if (!text) return post.images?.length ? '사진 게시글' : '내용 없는 게시글';
    return text.length > 64 ? `${text.slice(0, 64)}…` : text;
};

function RemoteDrafts({ source, config, overview, page, onPageChange }) {
    const definition = remoteSources[source];
    const params = { page: page - 1, size: FEED_PAGE_SIZE, ...definition.filter };
    const enabled = config.data?.enabled === true && !isReadAccessDenied(config.error);
    const query = useQuery({ queryKey: definition.queryKey(params),
        queryFn: ({ signal }) => definition.read(params, signal), enabled, staleTime: 30_000,
        placeholderData: (previous, from) => isReadAccessDenied(from?.state.error) ? undefined : previous });
    const [editor, setEditor] = useState(null);
    const closeEditor = () => setEditor(current => current && ({ ...current, open: false }));
    const posts = source === 'posts';
    const rows = enabled && !query.isPlaceholderData ? (query.data?.content ?? []).filter(item => item.state === 'DRAFT').map(item => {
        const name = posts ? postDraftName(item) : item.title?.trim() || '제목 없는 가게 소식';
        return {
            key: item.id, name, detail: posts ? undefined : item.storeName, savedAt: item.updatedAt || item.createdAt,
            action: <Button variant="ghost-sm" size="sm" aria-label={`${name} 이어서 작성`}
                onClick={() => setEditor({ id: item.id, open: true })}>이어서 작성</Button>,
        };
    }) : [];
    return <>
        <DraftList rows={rows} query={enabled ? query : config} total={enabled ? feedTotal(query.data) : 0} page={page}
            onPageChange={onPageChange} overview={overview} kind={definition.kind} label={definition.label}
            emptyTitle={enabled ? definition.emptyTitle : definition.disabledTitle}
            emptyAction={enabled ? <TextLink to={definition.to}>{definition.actionLabel}</TextLink> : undefined} />
        {enabled && editor && (posts
            ? <FeedEditor open={editor.open} post={{ id: editor.id }} config={config.data} onClose={closeEditor} onSaved={closeEditor} />
            : <StoreNewsEditor open={editor.open} newsId={editor.id} onClose={closeEditor} onSaved={closeEditor} />)}
    </>;
}

const panelProps = { overview: PropTypes.bool.isRequired, page: PropTypes.number.isRequired, onPageChange: PropTypes.func.isRequired };
RemoteDrafts.propTypes = { ...panelProps, source: PropTypes.oneOf(['posts', 'news']).isRequired, config: PropTypes.object.isRequired };

function FeedDrafts(props) {
    const config = useFeedConfig();
    return <RemoteDrafts {...props} source="posts" config={config} />;
}

function NewsDrafts(props) {
    const config = useStoreNewsConfig(true);
    return <RemoteDrafts {...props} source="news" config={config} />;
}

function MailDrafts({ overview, page, onPageChange }) {
    const { query } = useMailDrafts();
    const drafts = query.data ?? [];
    const offset = (page - 1) * FEED_PAGE_SIZE;
    const mailboxUrl = '/admin?tab=mailbox&mailFolder=sent';
    const rows = drafts.slice(offset, offset + FEED_PAGE_SIZE).map(({ id, subject, toEmail, savedAt }) => {
        const name = subject.trim() || '제목 없는 메일';
        return { key: id, name, detail: toEmail, savedAt: new Date(savedAt).toISOString(),
            action: <TextLink to={mailboxUrl} state={{ mailDraftResume: id }} aria-label={`${name} 이어서 작성`}>이어서 작성</TextLink> };
    });
    return <>
        {!overview && <PageDescription>메일 초안과 첨부 사진은 이 브라우저에 {LOCAL_DRAFT_TTL_MS / 86_400_000}일 동안 보관해요.</PageDescription>}
        <DraftList rows={rows} query={query} total={drafts.length} page={page} onPageChange={onPageChange} overview={overview}
            kind="mail" label="메일 초안" emptyTitle="임시저장한 메일이 없어요."
            emptyAction={<TextLink to={mailboxUrl}>메일함 열기</TextLink>} />
    </>;
}
MailDrafts.propTypes = panelProps;

const panels = { posts: FeedDrafts, stores: StoreDrafts, news: NewsDrafts, mail: MailDrafts };

export default function Drafts() {
    const [params] = useSearchParams();
    const role = useAuthStore(state => state.user?.role);
    const { groups, items, activeKey } = draftWorkspace(params.get('tab'), hasOwnerAccess(role), hasAdminAccess(role));
    const page = feedPage(params.get('page'));
    const navigate = useWorkspaceNavigate();
    const onPageChange = (value, options) => navigate(draftPath(activeKey, value), options);
    const draftItems = items.filter(item => item.key !== 'all');
    const overview = <div className="reserve-draft-overview">
        {draftItems.map(({ key, label }) => {
            const Panel = panels[key];
            return <section className="reserve-draft-section" key={key} aria-labelledby={`drafts-${key}`}>
                <header className="reserve-draft-section-heading">
                    <h2 id={`drafts-${key}`}>{label}</h2>
                    <TextLink to={draftPath(key)} aria-label={`${label} 모두 보기`}>모두 보기</TextLink>
                </header>
                <Panel overview page={1} onPageChange={onPageChange} />
            </section>;
        })}
    </div>;
    const content = [{ key: 'all', label: DRAFTS_TITLE, children: overview }, ...draftItems.map(({ key, label }) => {
        const Panel = panels[key];
        return { key, label, children: <Panel overview={false} page={page} onPageChange={onPageChange} /> };
    })];
    return <WorkspaceLayout title={DRAFTS_TITLE} groups={groups} activeKey={activeKey}
        hrefFor={draftPath} onSelect={key => navigate(draftPath(key))}>
        <WorkspacePanels activeKey={activeKey} items={content} />
    </WorkspaceLayout>;
}
