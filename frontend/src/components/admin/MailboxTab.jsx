import React, { useContext, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { Typography, Divider, Checkbox } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import Pagination from '../common/Pagination';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SendOutlined, InboxOutlined, ArrowLeftOutlined, DeleteOutlined, MailOutlined, ClockCircleOutlined, FileTextOutlined } from '../common/icons';
import { Button, DataState, FormTextArea, FormInput, FormField, FilterToolbar, SegmentedControl } from '../common';
import MailDraftModal from '../common/MailDraftModal';
import MailPhotoStrip from '../common/MailPhotoStrip';
import AnimatedContent from '../common/AnimatedContent';
import CopyableText from '../common/CopyableText';
import DetailInfoRows from '../common/DetailInfoRows';
import IconTool from '../common/IconTool';
import { Bone } from '../common/Skeletons';
import { useMessage, useWindowWidth, useQueryParamsState, useFormErrors } from '../../hooks';
import useMailDrafts from '../../hooks/useMailDrafts';
import { adminKeys } from '../../hooks/queryKeys';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import api from '../../api/axios';
import { versionedApiUrl } from '../../api/apiVersion';
import { previewMailDraft, sendMailDraft } from '../../services/mailService';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';
import { WorkspaceActivityContext } from '../layout/workspaceActivity';
import useComposeMail from './useComposeMail';

const { Text, Title, Paragraph } = Typography;

// 목록 패널이 좌측 360px 고정 높이라 20건이면 스크롤 한 번으로 닿는다. 더 늘리면 페이지 의미가 없어진다.
const PAGE_SIZE = 20;
const QUERY_DEFAULTS = { search: '', page: '1', mailFolder: 'received' };
const FOLDERS = [{ value: 'received', label: '받은 문의' }, { value: 'sent', label: '보낸 메일' }];

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr.replace(' ', 'T'));
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHrs < 24) return `${diffHrs}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}`;
};

const formatFullDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T'));
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. `
         + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// data?.mails 가 매 렌더 새 배열이면 자식들이 불필요하게 다시 그려진다 — 상수 빈 배열로 막는다.
const EMPTY_MAILS = [];

const mailErrorStatus = error => Number(error?.status ?? error?.response?.status);
const MAIL_LIMIT_MESSAGE = '메일 발송 요청이 너무 많아요. 잠시 후 다시 시도해주세요.';

const useMailData = (received, page, search) => {
    const active = useContext(WorkspaceActivityContext);
    const key = received ? adminKeys.receivedInquiries() : adminKeys.sentMails();
    const endpoint = received ? API_ENDPOINTS.INQUIRY.ADMIN_ALL : API_ENDPOINTS.MAIL.SENT;
    const { data, isLoading: loading, isFetching, isPlaceholderData, error, refetch } = useQuery({
        queryKey: [...key, page, search],
        enabled: active,
        queryFn: async ({ signal }) => {
            const result = await api.get(endpoint, {
                signal,
                params: {
                    page: page - 1,          // 서버 0-based, 화면 1-based
                    size: PAGE_SIZE,
                    ...(search.trim() ? { search: search.trim() } : {}),
                },
            });
            return {
                mails: result?.content ?? [],
                // Spring Boot 3.5부터 페이지 메타가 page:{} 하위로 이동했다 — 신버전 우선, 구버전 폴백.
                totalElements: result?.page?.totalElements ?? result?.totalElements ?? 0,
            };
        },
        placeholderData: (previous, query) => query?.queryKey[1] === key[1] ? previous : undefined,
    });

    return {
        mails: data?.mails ?? EMPTY_MAILS,
        totalElements: data?.totalElements ?? 0,
        loading, isFetching, isPlaceholderData, error, refetch,
    };
};

const useTrashMail = ({ message, onTrashed }) => {
    const queryClient = useQueryClient();
    const { confirm } = useMessage();

    const mutation = useMutation({
        mutationFn: ({ id, received }) => api.delete(received
            ? API_ENDPOINTS.INQUIRY.ADMIN_DELETE(id) : API_ENDPOINTS.MAIL.TRASH_SENT(id)),
        onSuccess: (_data, target) => {
            const queryKey = target.received ? adminKeys.receivedInquiries() : adminKeys.sentMails();
            queryClient.removeQueries({ queryKey: adminKeys.mailPhotos(target.received, target.id), exact: true });
            queryClient.setQueriesData({ queryKey }, data => data?.mails.some(mail => mail.id === target.id) ? {
                ...data, mails: data.mails.filter(mail => mail.id !== target.id), totalElements: Math.max(0, data.totalElements - 1),
            } : data);
            message.success('휴지통으로 옮겼어요.');
            onTrashed(target);
            void queryClient.invalidateQueries({ queryKey });
            void queryClient.invalidateQueries({ queryKey: adminKeys.trash() });
        },
        onError: () => message.error('휴지통으로 옮기지 못했어요.'),
    });

    const askAndTrash = (mail, received) => confirm({
        title: '휴지통으로 이동',
        content: `"${(received ? mail.title : mail.subject) || '(제목 없음)'}" 항목은 휴지통 탭에서 30일 안에 복구할 수 있어요.`,
        okText: '휴지통으로',
        okButtonProps: { danger: true },
        onOk: () => mutation.mutateAsync({ id: mail.id, received }),
    });

    return { askAndTrash, trashing: mutation.isPending };
};

const useInquiryReply = (message) => {
    const client = useQueryClient();
    const [target, setTarget] = useState(null);
    const [answer, setAnswer] = useState('');
    const { errors, validate, clearError, resetErrors } = useFormErrors();
    const close = () => { setTarget(null); setAnswer(''); resetErrors(); };
    const queryKey = adminKeys.receivedInquiries();
    const mutation = useMutation({
        mutationFn: ({ id, answer, photos }) => sendMailDraft(API_ENDPOINTS.INQUIRY.ADMIN_REPLY(id), { answer }, photos),
        onSuccess: (inquiry) => {
            client.setQueriesData({ queryKey }, data => data && ({ ...data,
                mails: data.mails.map(item => item.id === inquiry.id ? inquiry : item),
            }));
            void client.invalidateQueries({ queryKey });
            void client.invalidateQueries({ queryKey: adminKeys.sentMails() });
            message.success('문의 답변 메일을 보냈어요.');
            close();
        },
        onError: (error) => {
            const status = mailErrorStatus(error);
            if (status === 409) {
                void client.invalidateQueries({ queryKey });
                message.warning('이미 답변이 등록된 문의예요.');
                close();
                return;
            }
            message.error(status === 429 ? MAIL_LIMIT_MESSAGE : '답변 메일 발송을 확인하지 못했어요.');
        },
    });
    const validateAnswer = () => validate(fields => {
        if (!answer.trim()) fields.answer = '답변을 입력해주세요.';
    });
    const submit = photos => {
        if (target && !mutation.isPending) mutation.mutate({ id: target.id, answer: answer.trim(), photos });
    };
    return { target, setTarget, answer, setAnswer, close, validateAnswer, submit, sending: mutation.isPending, errors, clearError };
};

const SearchBar = ({ folder, onFolderChange, value, onSubmit, onReload, loading, initialLoading = false, onCompose }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, minHeight: 40 }}>
                <SegmentedControl options={FOLDERS} value={folder} onChange={onFolderChange} block={false} aria-label="메일함 분류" />
                {initialLoading ? <Bone width={104} height={40} borderRadius={20} /> : <Button variant="primary" size="sm" onClick={onCompose}
                    style={{ height: 40, borderRadius: 20, paddingLeft: 20, paddingRight: 20, flexShrink: 0, gap: 6 }}>
                    <SendOutlined aria-hidden="true" /> 새 메일
                </Button>}
            </div>
            <FilterToolbar search={{ value, onSubmit, placeholder: folder === 'received' ? '보낸 사람, 제목 검색' : '받는 사람, 제목 검색' }}
                onReload={onReload} loading={loading} initialLoading={initialLoading} style={{ marginBottom: 0 }} />
        </div>
    );
};

/*
 * 골격을 실제 메일 행의 받는 사람·제목·본문 미리보기 배치와 맞춘다.
 */
// 행 패딩은 MailItem의 본문 버튼과 맞춘다.
//   다르면 로딩이 끝나는 순간 글자가 옆으로 튄다.
const MailListSkeleton = ({ framed = true }) => (
    <div style={framed ? styles.singlePanel : undefined}>
        {['sk-0', 'sk-1', 'sk-2', 'sk-3'].map((key) => (
            <div key={key} style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border.light}` }}>
                {/* 1줄: 받는 사람 + 보낸 시각 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Bone width="45%" height={13} />
                    <Bone width={44} height={11} />
                </div>
                {/* 2줄: 제목 */}
                <Bone width="65%" height={13} style={{ marginTop: 6 }} />
                {/* 3줄: 본문 미리보기 */}
                <Bone width="80%" height={11} style={{ marginTop: 6 }} />
            </div>
        ))}
    </div>
);

/* 발송한 메일은 상세에서 휴지통으로 옮기며, 초안 삭제는 로컬 저장소에만 적용한다. */
const MailItem = ({ mail, received, isSelected, onClick, onDeleteDraft }) => (
    <div className={`reserve-maillist-item${isSelected ? ' is-selected' : ''}`} style={styles.mailItem}>
        <button type="button" aria-current={isSelected ? 'true' : undefined} onClick={event => onClick(mail, event.currentTarget)}
            className="reserve-maillist-main" style={styles.mailItemMain}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {received ? mail.memberEmail || mail.memberName : mail.toEmail}
                </Text>
                {onDeleteDraft && <Text style={styles.mailMeta}>임시 저장됨</Text>}
                <Text style={styles.mailMeta}>
                    {formatDate(onDeleteDraft ? new Date(mail.savedAt).toISOString() : (received ? mail.createdAt : mail.sentAt))}
                </Text>
            </div>
            <Text style={{ display: 'block', fontSize: fontSize.sm, marginTop: 2, fontWeight: fontWeight.medium, color: colors.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(received ? mail.title : mail.subject) || '(제목 없음)'}
            </Text>
            <Text style={{ display: 'block', fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {received ? `${mail.statusDisplayName || ''} · ${mail.content || ''}` : mail.bodyPreview || ''}
            </Text>
        </button>
        {onDeleteDraft && <div style={styles.draftAction}>
            <IconTool label={`${mail.subject || '제목 없는 메일'} 초안 삭제`} icon={<DeleteOutlined aria-hidden="true" />}
                onClick={() => onDeleteDraft(mail.id)} />
        </div>}
    </div>
);

const MailPhotos = ({ id, received }) => {
    const active = useContext(WorkspaceActivityContext);
    const endpoint = received ? API_ENDPOINTS.INQUIRY.ADMIN_PHOTOS(id) : API_ENDPOINTS.MAIL.SENT_PHOTOS(id);
    const { data, error, refetch, isFetching } = useQuery({
        queryKey: adminKeys.mailPhotos(received, id), enabled: active,
        queryFn: ({ signal }) => api.get(endpoint, { signal }),
    });
    if (error) return <DataState compact state="error" subject="첨부 사진" error={error} onRetry={refetch} retrying={isFetching} />;
    const base = (import.meta.env.VITE_API_BASE_URL || '') + versionedApiUrl(endpoint);
    const ids = Array.isArray(data) ? data.filter(photoId => Number.isSafeInteger(photoId) && photoId > 0) : [];
    return <MailPhotoStrip photos={ids.map(photoId => ({
        uid: String(photoId), url: base + '/' + photoId,
    }))} />;
};

const MailDetailContent = ({ mail, received, onReply, onTrash, trashing }) => (
    <>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
            <Title level={4} style={{ flex: '1 1 14rem', minWidth: 0, overflowWrap: 'anywhere', color: colors.text.primary, margin: 0 }}>
                {(received ? mail.title : mail.subject) || '(제목 없음)'}
            </Title>
            <div style={{ display: 'flex', gap: 8 }}>
                {received && mail.status === 'PENDING' && mail.memberEmail && (
                    <Button variant="ghost-sm-primary" size="md" onClick={() => onReply(mail)}>
                        <SendOutlined aria-hidden="true" /> 답변하기
                    </Button>
                )}
                <Button variant="ghost-sm" size="md" onClick={() => onTrash(mail, received)} disabled={trashing}>
                    <DeleteOutlined aria-hidden="true" /> 휴지통
                </Button>
            </div>
        </div>
        {received && <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Text style={styles.mailMeta}>{mail.statusDisplayName}</Text>
            <Text style={styles.mailMeta}>{mail.inboundEmail ? '지원 이메일' : mail.categoryDisplayName}</Text>
        </div>}
        <DetailInfoRows rows={[
            ...(received ? [{ Icon: FileTextOutlined, label: '문의 번호', value: <CopyableText value={mail.id} label="문의 번호" /> }] : []),
            { Icon: MailOutlined, label: received ? '보낸 사람' : '받는 사람',
                value: received ? mail.memberEmail || mail.memberName : mail.toEmail },
            { Icon: ClockCircleOutlined, label: received ? '받은 시간' : '보낸 시간',
                value: formatFullDate(received ? mail.createdAt : mail.sentAt) },
        ]} />
        <Divider style={{ margin: '0 0 16px' }} />
        <Paragraph style={styles.body}>
            {(received ? mail.content : mail.body) || '(본문 없음)'}
        </Paragraph>
        <MailPhotos id={mail.id} received={received} />
        {received && mail.answer && <>
            <Divider style={{ margin: '16px 0' }} />
            <Text strong>답변</Text>
            <Paragraph style={styles.body}>
                {mail.answer}
            </Paragraph>
        </>}
    </>
);

/**
 * 목록 하단 페이지네이션. 한 페이지에 다 들어가면 아예 렌더하지 않는다 —
 * 버튼이 하나뿐인 페이지네이션은 정보를 주지 않고 목록 높이만 잡아먹는다.
 * 페이지 크기 선택·빠른이동은 끈다 — 좌측 360px 패널에 들어가지 않고, 쓸 일도 없다.
 */
const MailPagination = ({ page, total, onChange, simple = false }) => {
    if (total <= PAGE_SIZE) return null;
    return (
        <div style={styles.paginationBar}>
            <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={total}
                onChange={onChange}
                simple={simple}
                size="small"
                showSizeChanger={false}
                showQuickJumper={false}
            />
        </div>
    );
};

const MailboxTab = () => {
    const { message, confirm } = useMessage();
    const active = useContext(WorkspaceActivityContext);
    const location = useLocation();
    const navigate = useNavigate();
    const isMobile = useWindowWidth() < 768;
    const [{ search, page: pageStr, mailFolder }, setQuery] = useQueryParamsState(QUERY_DEFAULTS, { privateKeys: ['search'] });
    const page = Number(pageStr) || 1;
    const folder = mailFolder === 'sent' ? 'sent' : 'received';
    const received = folder === 'received';
    const subject = received ? '받은 문의' : '보낸 메일';
    const [selection, setSelection] = useState(null);
    const mailbox = useRef(null);
    const opener = useRef(null);
    const backButton = useRef(null);

    const mail = useMailData(received, page, search);
    const includeDrafts = !received && page === 1;
    const { ownerId, queryKey: draftKey, query: draftQuery } = useMailDrafts(active && includeDrafts);
    const send = useComposeMail({ message, ownerId, draftKey,
        onSendError: error => message.error(mailErrorStatus(error) === 429 ? MAIL_LIMIT_MESSAGE : '메일 발송에 실패했어요.') });
    const resumeId = location.state?.mailDraftResume;
    const resume = useEffectEvent(id => {
        const state = { ...location.state };
        delete state.mailDraftResume;
        navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state });
        void send.openDraft(id);
    });
    useEffect(() => {
        if (active && !received && ownerId != null && typeof resumeId === 'string') resume(resumeId);
    }, [active, received, ownerId, resumeId]);
    const reply = useInquiryReply(message);
    const selectedMail = !mail.isPlaceholderData && selection?.folder === folder ? mail.mails.find(item => item.id === selection.id) : null;
    const backToList = () => {
        setSelection(null);
        requestAnimationFrame(() => {
            const target = opener.current?.isConnected ? opener.current
                : mailbox.current?.querySelector('.reserve-maillist-main') || mailbox.current?.querySelector('button');
            target?.focus({ preventScroll: true });
        });
    };
    const trash = useTrashMail({ message, onTrashed: target => {
        if (target.received !== received) return;
        if (selectedMail?.id === target.id) backToList();
        if (page > 1 && mail.mails.length === 1) setQuery({ page: String(page - 1) });
    } });
    const selectMail = (item, button) => {
        opener.current = button;
        setSelection({ folder, id: item.id });
    };
    const handleFolderChange = next => {
        if (next === folder) return;
        setQuery({ mailFolder: next, page: '1', search: '' });
        setSelection(null);
    };
    const handleSearchChange = search => { setQuery({ search, page: '1' }); setSelection(null); };
    const handlePageChange = p => { setQuery({ page: String(p) }); setSelection(null); };
    const showSavedDraft = () => {
        send.resetCompose();
        setQuery({ mailFolder: 'sent', page: '1', search: '' });
        setSelection(null);
    };
    const deleteDraft = id => confirm({ title: '임시저장한 메일을 삭제할까요?',
        content: '이 브라우저에 저장된 메일 초안과 첨부 사진이 삭제돼요.', okText: '삭제', cancelText: '취소',
        onOk: async () => {
            try { await send.removeDraft(id); message.success('메일 초안을 삭제했어요.'); }
            catch { message.error('메일 초안을 삭제하지 못했어요. 다시 시도해주세요.'); }
        } });
    const reload = () => {
        void mail.refetch();
        if (includeDrafts && ownerId != null) void draftQuery.refetch();
    };

    const term = search.trim().toLowerCase();
    const drafts = includeDrafts ? (draftQuery.data ?? EMPTY_MAILS).filter(item =>
        !term || item.subject.toLowerCase().includes(term) || item.toEmail.toLowerCase().includes(term)) : EMPTY_MAILS;
    const isEmpty = mail.totalElements === 0 && !term && !drafts.length;
    const mailPageLoading = mail.loading || mail.isPlaceholderData;
    const showLoading = !drafts.length && (mailPageLoading
        || includeDrafts && ownerId != null && draftQuery.isPending);
    const showError = !showLoading && !drafts.length && isBlockingListReadError(mail.error, mail.mails);
    const showEmpty = !showLoading && !showError && isEmpty;
    const showInitialSkeleton = showLoading && !mail.totalElements;
    const showPanels = !showInitialSkeleton && !showError && !showEmpty;
    const showMobDetail = showPanels && isMobile && !!selectedMail;
    const showMobList = showPanels && isMobile;
    const showDesktop = showPanels && !isMobile;
    useLayoutEffect(() => {
        if (showMobDetail) backButton.current?.querySelector('button')?.focus({ preventScroll: true });
    }, [showMobDetail]);
    const listItems = !drafts.length && !mail.mails.length ? <DataState state="empty" kind="mail" title="검색 결과가 없어요." />
        : <>
            {drafts.map(item => <MailItem key={`draft:${item.id}`} mail={item} onDeleteDraft={deleteDraft}
                onClick={() => void send.openDraft(item.id)} />)}
            {mailPageLoading ? <MailListSkeleton framed={false} /> : mail.mails.map(item => <MailItem key={item.id} mail={item} received={received}
                isSelected={item.id === selectedMail?.id} onClick={selectMail} />)}
        </>;
    const detail = selectedMail && (
        <AnimatedContent motionKey={`${folder}:${selectedMail.id}`} animateOnMount>
            <MailDetailContent mail={selectedMail} received={received}
                onReply={reply.setTarget} onTrash={trash.askAndTrash} trashing={trash.trashing} />
        </AnimatedContent>
    );
    const listBody = style => <AnimatedContent style={style} motionKey={`${folder}:${page}:${search}`}
        ready={!showLoading && !mailPageLoading} keepResultsHeight={isMobile && mail.totalElements > PAGE_SIZE}
        aria-busy={showLoading || mailPageLoading}>
        {showLoading ? <MailListSkeleton framed={false} /> : listItems}
    </AnimatedContent>;

    return (
        <div ref={mailbox}>
            <SearchBar folder={folder} onFolderChange={handleFolderChange} value={search} onSubmit={handleSearchChange}
                onReload={reload} loading={mail.loading || mail.isFetching || includeDrafts && draftQuery.isFetching}
                initialLoading={showInitialSkeleton} onCompose={send.startCompose} />

            {mail.error && !showError && <DataState compact state="error" subject={`${subject} 갱신`}
                error={mail.error} onRetry={mail.refetch} retrying={mail.isFetching} />}
            {includeDrafts && draftQuery.error && <DataState compact state="error" subject="메일 초안"
                error={draftQuery.error} onRetry={draftQuery.refetch} retrying={draftQuery.isFetching} />}
            {showInitialSkeleton && <MailListSkeleton />}

            {showError && (
                <DataState state="error" kind="mail" subject={subject} error={mail.error}
                    onRetry={mail.refetch} retrying={mail.isFetching} />
            )}

            {showEmpty && (
                <div style={styles.emptyPanel}>
                    <DataState state="empty" kind="mail" title={received ? '받은 문의가 없어요.' : '보낸 메일이 없어요.'}
                        description={received ? undefined : '"새 메일" 버튼으로 메일을 보낼 수 있어요.'} />
                </div>
            )}

            {showMobDetail && (
                <div style={styles.mobileDetail}>
                    <div ref={backButton} style={styles.backBtn}><IconTool kind="navigation" label="목록으로" icon={<ArrowLeftOutlined aria-hidden="true" />}
                        onClick={backToList} /></div>
                    {detail}
                </div>
            )}

            {showMobList && (
                <div hidden={!!selectedMail}>
                    {listBody(styles.singlePanel)}
                    {/* 모바일은 폭이 좁아 simple 모드("1 / 5") — 번호 버튼을 다 깔면 줄바꿈이 난다. */}
                    <MailPagination page={page} total={mail.totalElements} onChange={handlePageChange} simple />
                </div>
            )}

            {showDesktop && (
                <div style={styles.splitPane}>
                    <div style={styles.listPanel}>
                        {listBody(styles.scrollableList)}
                        {/* 목록 패널 바닥에 고정 — flex:1 인 스크롤 영역 밖에 두어야 항상 보인다. */}
                        <MailPagination page={page} total={mail.totalElements} onChange={handlePageChange} />
                    </div>
                    <div style={styles.detailPanel}>
                        {!selectedMail ? (
                            <div style={styles.emptyDetail}>
                                <InboxOutlined style={{ fontSize: 48, color: colors.border.default, marginBottom: 12 }} />
                                <Text style={{ fontSize: fontSize.base, color: colors.text.tertiary }}>{received ? '문의를 선택하면 내용이 표시돼요.' : '메일을 선택하면 내용이 표시돼요.'}</Text>
                            </div>
                        ) : (
                            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column' }}>
                                {detail}
                            </div>
                        )}
                    </div>
                </div>
            )}
            <MailDraftModal title="문의 답변" open={Boolean(reply.target)} onClose={reply.close}
                navigationDirty={Boolean(reply.answer)} sendText="답변 보내기" validate={reply.validateAnswer}
                onSend={reply.submit} sending={reply.sending}
                loadPreview={signal => previewMailDraft(API_ENDPOINTS.MAIL.PREVIEW, {
                    toEmail: reply.target?.memberEmail, subject: reply.target?.replySubject || reply.target?.title,
                    body: reply.answer.trim(), marketing: false,
                }, signal)}
                previewFields={[
                    { label: '받는 사람', value: reply.target?.memberEmail },
                    { label: '제목', value: reply.target?.replySubject || reply.target?.title },
                ]}>
                <FormField label="받는 사람"><Text>{reply.target?.memberEmail}</Text></FormField>
                <FormField label="답변" error={reply.errors.answer}>
                    <FormTextArea aria-label="답변" rows={8} value={reply.answer} maxLength={2000} showCount
                        onChange={event => { reply.setAnswer(event.target.value); reply.clearError('answer'); }} />
                </FormField>
            </MailDraftModal>

            <MailDraftModal title="새 메일 작성" open={send.composing} onClose={send.resetCompose}
                navigationDirty={send.changed} initialPhotos={send.initialPhotos}
                onSaveDraft={ownerId == null ? undefined : send.saveDraft} onDraftSaved={showSavedDraft}
                validate={send.validateCompose} onSend={send.handleComposeSend} sending={send.composeSending}
                loadPreview={signal => previewMailDraft(API_ENDPOINTS.MAIL.PREVIEW, send.composeForm, signal)}
                previewFields={[
                    { label: '받는 사람', value: send.composeForm.toEmail.trim() },
                    { label: '제목', value: send.composeForm.subject },
                ]}>
                <FormField label="받는 사람" error={send.errors.toEmail}>
                    <FormInput aria-label="받는 사람" placeholder="example@email.com" value={send.composeForm.toEmail}
                        onChange={(e) => { send.setComposeForm(f => ({ ...f, toEmail: e.target.value })); send.clearError('toEmail'); }} />
                </FormField>
                <FormField label="제목" error={send.errors.subject}>
                    <FormInput aria-label="제목" placeholder="메일 제목" value={send.composeForm.subject}
                        onChange={(e) => { send.setComposeForm(f => ({ ...f, subject: e.target.value })); send.clearError('subject'); }} maxLength={500} showCount />
                </FormField>
                <FormField label="광고성 정보">
                    <Checkbox
                        checked={send.composeForm.marketing}
                        onChange={(e) => send.setComposeForm(f => ({ ...f, marketing: e.target.checked }))}
                    >
                        <Text style={{ fontSize: fontSize.sm }}>
                            광고·홍보 메일이에요
                            <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block' }}>
                                입력한 주소의 회원이 광고 메일 수신에 동의한 경우에만 발송돼요.
                            </Text>
                        </Text>
                    </Checkbox>
                </FormField>
                <FormField label="내용" error={send.errors.body}>
                    <FormTextArea aria-label="내용" rows={8} placeholder="메일 내용을 입력하세요..." value={send.composeForm.body}
                        onChange={(e) => { send.setComposeForm(f => ({ ...f, body: e.target.value })); send.clearError('body'); }}
                        maxLength={5000} showCount />
                </FormField>
            </MailDraftModal>
        </div>
    );
};

const styles = {
    scrollableList: { flex: 1, overflowY: 'auto' },
    mailMeta: { fontSize: fontSize.xs, fontWeight: fontWeight.regular, color: colors.text.tertiary, flexShrink: 0 },
    draftAction: { alignSelf: 'center', marginRight: 4 },
    singlePanel:  { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    emptyPanel:   { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, background: colors.background.paper },
    splitPane:    { display: 'flex', height: 'clamp(400px, calc(100svh - 280px), 680px)', border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    listPanel:    { width: 'clamp(240px, 38%, 360px)', flexShrink: 0, borderRight: `1px solid ${colors.border.light}`, display: 'flex', flexDirection: 'column' },
    detailPanel:  { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: colors.background.paper },
    emptyDetail:  { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 },
    mobileDetail: { padding: '16px 0' },
    body:         { fontSize: fontSize.sm, color: colors.text.primary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.8, margin: 0 },
    // 행 껍데기. 배경·hover·선택 표시는 index.css 의 .reserve-maillist-item 이 갖는다 —
    // 인라인 style 로는 :hover 를 쓸 수 없어서 여기에 두면 눌리는 느낌이 안 난다.
    mailItem:     { display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${colors.border.light}` },
    // 목록의 읽기 영역은 좌우 16px으로 맞춘다. 삭제 버튼을 빼면 오른쪽만 4px인 여백은 필요 없다.
    mailItemMain: { flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px' },
    // 뒤로 도구는 공통 IconTool을 사용하고 상세 본문 앞의 왼쪽에 둔다.
    backBtn:      { display: 'flex', justifyContent: 'flex-start', marginBottom: 12 },
    // 데스크톱은 목록 패널 안쪽 바닥(위 경계선 있음), 모바일은 카드 바로 아래에 떨어져 놓인다.
    paginationBar: { display: 'flex', justifyContent: 'center', padding: '10px 8px', borderTop: `1px solid ${colors.border.light}` },
};

export default MailboxTab;
