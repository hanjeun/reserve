/*
 * 발송 메일만 서버 검색·페이지로 조회하며 수신 문의는 Inquiry에서 처리한다.
 */
import React, { useState } from 'react';
import { Typography, Input, Divider, Checkbox } from 'antd';
import Pagination from '../common/Pagination';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { SearchOutlined, SendOutlined, InboxOutlined, ArrowLeftOutlined, DeleteOutlined } from '../common/icons';
import { Button, DataState, FormTextArea, FormInput, FormModal, FormField, RefreshButton } from '../common';
import IconTool from '../common/IconTool';
import { Bone } from '../common/Skeletons';
import FilterToolbarSkeleton from '../common/FilterToolbarSkeleton';
import useDebounce from '../../hooks/useDebounce';
import { useMessage, useWindowWidth, useQueryParamsState, useFormErrors } from '../../hooks';
import { adminKeys } from '../../hooks/queryKeys';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { EMAIL_REGEX } from '../../utils/validation';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';

const { Text, Title, Paragraph } = Typography;

// 목록 패널이 좌측 360px 고정 높이라 20건이면 스크롤 한 번으로 닿는다. 더 늘리면 페이지 의미가 없어진다.
const PAGE_SIZE = 20;
const QUERY_DEFAULTS = { search: '', page: '1' };

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
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
    const d = new Date(dateStr);
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. `
         + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// data?.mails 가 매 렌더 새 배열이면 자식들이 불필요하게 다시 그려진다 — 상수 빈 배열로 막는다.
const EMPTY_MAILS = [];

const useSentMailData = (message, page, search) => {
    const [selectedSent, setSelectedSent] = useState(null);

    const { data, isLoading: loading, isFetching, error, refetch: loadSentMails } = useQuery({
        // page·검색어가 쿼리키에 들어가야 한다. 서버가 두 값을 모두 반영하므로
        //   키에 없으면 페이지를 넘기거나 검색어를 바꿔도 이전 응답이 그대로 재사용된다.
        queryKey: [...adminKeys.sentMails(), page, search],
        queryFn: async () => {
            const result = await api.get(API_ENDPOINTS.MAIL.SENT, {
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
        placeholderData: keepPreviousData,
    });

    return {
        sentMails: data?.mails ?? EMPTY_MAILS,
        totalElements: data?.totalElements ?? 0,
        loading, isFetching, error, selectedSent, setSelectedSent, loadSentMails,
    };
};

const useComposeMail = ({ message }) => {
    const queryClient = useQueryClient();
    const [composing, setComposing] = useState(false);
    // 광고성 발송 여부를 구분한다.

    const [composeForm, setComposeForm] = useState({ toEmail: '', subject: '', body: '', marketing: false });
    const { errors, validate, clearError, resetErrors } = useFormErrors();

    const resetCompose = () => { setComposing(false); setComposeForm({ toEmail: '', subject: '', body: '', marketing: false }); resetErrors(); };

    const sendMutation = useMutation({
        mutationFn: (form) => api.post(API_ENDPOINTS.MAIL.COMPOSE, form),
        onSuccess: () => {
            message.success('메일을 보냈어요.');
            resetCompose();
            void queryClient.invalidateQueries({ queryKey: adminKeys.sentMails() });
        },
        onError: () => message.error('메일 발송에 실패했어요.'),
    });

    const handleComposeSend = () => {
        const trimmedEmail = composeForm.toEmail.trim();
        // 모든 필드를 한 번에 검증해 각 입력 아래에 오류를 표시한다.

        if (!validate((e) => {
            if (!trimmedEmail) e.toEmail = '받는 사람 이메일을 입력해주세요.';
            else if (!EMAIL_REGEX.test(trimmedEmail)) e.toEmail = '올바른 이메일 형식을 입력해주세요.';
            if (!composeForm.subject.trim()) e.subject = '제목을 입력해주세요.';
            if (!composeForm.body.trim()) e.body = '내용을 입력해주세요.';
        })) return;
        sendMutation.mutate(composeForm);
    };

    return { composing, setComposing, composeForm, setComposeForm, composeSending: sendMutation.isPending, resetCompose, handleComposeSend, errors, clearError };
};

/*
 * 발송 기록은 휴지통으로 옮겨 보관 기간 내 복구할 수 있게 한다.
 */
const useTrashMail = ({ message, selectedSent, setSelectedSent }) => {
    const queryClient = useQueryClient();
    const { confirm } = useMessage();

    const mutation = useMutation({
        mutationFn: (id) => api.delete(API_ENDPOINTS.MAIL.TRASH_SENT(id)),
        onSuccess: (_data, id) => {
            message.success('휴지통으로 옮겼어요.');
            // 지운 메일을 보고 있었다면 상세를 비운다 — 안 비우면 목록에서 사라진 메일이
            // 오른쪽 패널에 계속 남아 "지워졌는데 아직 있다"처럼 보인다.
            if (selectedSent?.id === id) setSelectedSent(null);
            void queryClient.invalidateQueries({ queryKey: adminKeys.sentMails() });
            // 휴지통 탭이 이 메일을 새로 받아야 한다.
            void queryClient.invalidateQueries({ queryKey: adminKeys.trash() });
        },
        onError: () => message.error('휴지통으로 옮기지 못했어요.'),
    });

    const askAndTrash = (mail) => confirm({
        title: '휴지통으로 이동',
        content: `"${mail.subject || '(제목 없음)'}" 메일을 휴지통으로 옮겨요. 휴지통 탭에서 30일 안에 복구할 수 있어요.`,
        okText: '휴지통으로',
        okButtonProps: { danger: true },
        onOk: () => mutation.mutateAsync(mail.id),
    });

    return { askAndTrash, trashing: mutation.isPending };
};

// 새로고침 대기·스피너 수명은 RefreshButton에서 관리한다.

const SearchBar = ({ value, onChange, onReload, loading, initialLoading = false, onCompose }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
                {initialLoading ? <Bone width={104} height={40} borderRadius={20} /> : <Button variant="primary" size="sm" onClick={onCompose}
                    style={{ height: 40, borderRadius: 20, paddingLeft: 20, paddingRight: 20, flexShrink: 0, gap: 6 }}>
                    <SendOutlined /> 새 메일
                </Button>}
            </div>
            {initialLoading ? <FilterToolbarSkeleton search={{ placeholder: '받는 사람, 제목 검색' }} style={{ marginBottom: 0 }} /> : <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, minHeight: 40 }}>
                <Input prefix={<SearchOutlined style={{ color: colors.text.tertiary }} />}
                    placeholder="받는 사람, 제목 검색" value={value} onChange={onChange}
                    allowClear size="large" style={{ width: '100%', maxWidth: 480 }} />
                <RefreshButton onReload={onReload} loading={loading} style={{ marginLeft: 'auto' }} />
            </div>}
        </div>
    );
};

/*
 * 골격을 실제 메일 행의 받는 사람·제목·본문 미리보기 배치와 맞춘다.
 */
// 행 패딩은 아래 SentMailItem 의 본문 버튼과 **같은 값**이어야 한다('14px 16px').
//   다르면 로딩이 끝나는 순간 글자가 옆으로 튄다.
const SentMailSkeleton = () => (
    <div style={styles.singlePanel}>
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

/**
 * 목록 한 줄. 목록은 메일 선택만 맡고, 삭제는 상세 화면 오른쪽의 단일 동작으로 둔다.
 * 행마다 휴지통 아이콘을 반복하면 날짜와 제목보다 삭제가 먼저 보여 목록을 읽기 어려웠다.
 */
const SentMailItem = ({ mail, isSelected, onClick }) => (
    <div className={`reserve-maillist-item${isSelected ? ' is-selected' : ''}`} style={styles.mailItem}>
        <button type="button" onClick={() => onClick(mail)} className="reserve-maillist-main" style={styles.mailItemMain}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    → {mail.toEmail}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, flexShrink: 0 }}>{formatDate(mail.sentAt)}</Text>
            </div>
            <Text style={{ display: 'block', fontSize: fontSize.sm, marginTop: 2, fontWeight: fontWeight.medium, color: colors.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {mail.subject || '(제목 없음)'}
            </Text>
            <Text style={{ display: 'block', fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {mail.bodyPreview || ''}
            </Text>
        </button>
    </div>
);

const SentDetailContent = ({ mail, onTrash, trashing }) => (
    <>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <Title level={4} style={{ flex: 1, minWidth: 0, fontWeight: fontWeight.bold, color: colors.text.primary, margin: 0, lineHeight: 1.4 }}>
                {mail.subject || '(제목 없음)'}
            </Title>
            {/* 목록에서 반복하지 않고, 내용을 확인한 뒤 여기서 한 번만 삭제한다. */}
            <Button variant="ghost-sm" size="md" onClick={() => onTrash(mail)} disabled={trashing}
                style={{ flexShrink: 0, gap: 6 }}>
                <DeleteOutlined /> 휴지통
            </Button>
        </div>
        <div style={{ background: colors.background.subtle, borderRadius: radius.md, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 6 }}>
                <Text style={{ width: 72, flexShrink: 0, fontSize: fontSize.xs, color: colors.text.tertiary, paddingTop: 2 }}>받는 사람</Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.text.primary, fontWeight: fontWeight.medium }}>{mail.toEmail}</Text>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Text style={{ width: 72, flexShrink: 0, fontSize: fontSize.xs, color: colors.text.tertiary, paddingTop: 2 }}>보낸 시간</Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>{formatFullDate(mail.sentAt)}</Text>
            </div>
        </div>
        <Divider style={{ margin: '0 0 16px' }} />
        <Paragraph style={{ fontSize: fontSize.sm, color: colors.text.primary, whiteSpace: 'pre-wrap', lineHeight: 1.8, margin: 0 }}>
            {mail.body || '(본문 없음)'}
        </Paragraph>
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
    const { message } = useMessage();
    const isMobile = useWindowWidth() < 768;
    const [{ search, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS);
    const debouncedSearch = useDebounce(search, 300);
    const page = Number(pageStr) || 1;

    const mail = useSentMailData(message, page, debouncedSearch);
    const send = useComposeMail({ message });
    const trash = useTrashMail({ message, selectedSent: mail.selectedSent, setSelectedSent: mail.setSelectedSent });

    // 클라이언트 filter 제거 — 서버가 검색까지 처리하므로 받은 결과가 곧 정답이다.
    // useDebounce 는 유지 — 이젠 타이핑 한 글자마다 서버를 때리지 않기 위한 장치다.
    const filteredSent = mail.sentMails;

    // 검색어가 바뀌면 페이지를 1로 되돌린다 — 3페이지를 보던 중 검색하면 결과가 1페이지뿐인데
    // 3페이지를 요청해 빈 화면이 된다. 반드시 한 번의 setQuery 호출로 묶는다(MembersTab 주석 참고).
    const handleSearchChange = (e) => setQuery({ search: e.target.value, page: '1' });
    const handlePageChange = (p) => { setQuery({ page: String(p) }); mail.setSelectedSent(null); };

    // "보낸 메일이 없습니다"는 검색어가 없을 때만 띄우는 게 맞다.
    // 검색 결과가 0건인 건 목록 패널 안의 "검색 결과가 없습니다"가 담당한다.
    const isEmpty = mail.totalElements === 0 && !debouncedSearch.trim();
    const showLoading = mail.loading;
    const showError = !showLoading && Boolean(mail.error);
    const showEmpty = !showLoading && !showError && isEmpty;
    const showMobDetail = !showLoading && !showError && !showEmpty && isMobile && !!mail.selectedSent;
    const showMobList = !showLoading && !showError && !showEmpty && isMobile && !mail.selectedSent;
    const showDesktop = !showLoading && !showError && !showEmpty && !isMobile;

    return (
        <div>
            <SearchBar value={search} onChange={handleSearchChange}
                onReload={mail.loadSentMails} loading={mail.loading || mail.isFetching}
                initialLoading={mail.loading}
                onCompose={() => send.setComposing(true)} />

            {showLoading && <SentMailSkeleton />}

            {showError && (
                <DataState state="error" kind="mail" subject="보낸 메일" error={mail.error}
                    onRetry={mail.loadSentMails} retrying={mail.isFetching} />
            )}

            {showEmpty && (
                <div style={styles.emptyPanel}>
                    <DataState state="empty" kind="mail" title="보낸 메일이 없어요"
                        description={'"새 메일" 버튼으로 메일을 보낼 수 있어요.'} />
                </div>
            )}

            {showMobDetail && (
                <div style={styles.mobileDetail}>
                    <div style={styles.backBtn}><IconTool kind="navigation" label="목록으로" icon={<ArrowLeftOutlined aria-hidden="true" />}
                        onClick={() => mail.setSelectedSent(null)} /></div>
                    <SentDetailContent mail={mail.selectedSent} onTrash={trash.askAndTrash} trashing={trash.trashing} />
                </div>
            )}

            {showMobList && (
                <>
                    <div style={styles.singlePanel}>
                        {filteredSent.length === 0 ? (
                            <DataState state="empty" kind="mail" title="검색 결과가 없어요." />
                        ) : filteredSent.map(m => (
                            <SentMailItem key={m.id} mail={m} isSelected={false} onClick={mail.setSelectedSent} />
                        ))}
                    </div>
                    {/* 모바일은 폭이 좁아 simple 모드("1 / 5") — 번호 버튼을 다 깔면 줄바꿈이 난다. */}
                    <MailPagination page={page} total={mail.totalElements} onChange={handlePageChange} simple />
                </>
            )}

            {showDesktop && (
                <div style={styles.splitPane}>
                    <div style={styles.listPanel}>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {filteredSent.length === 0 ? (
                                <DataState state="empty" kind="mail" title="검색 결과가 없어요." />
                            ) : filteredSent.map(m => (
                                <SentMailItem key={m.id} mail={m} isSelected={m.id === mail.selectedSent?.id} onClick={mail.setSelectedSent} />
                            ))}
                        </div>
                        {/* 목록 패널 바닥에 고정 — flex:1 인 스크롤 영역 밖에 두어야 항상 보인다. */}
                        <MailPagination page={page} total={mail.totalElements} onChange={handlePageChange} />
                    </div>
                    <div style={styles.detailPanel}>
                        {!mail.selectedSent ? (
                            <div style={styles.emptyDetail}>
                                <InboxOutlined style={{ fontSize: 48, color: colors.border.default, marginBottom: 12 }} />
                                <Text style={{ fontSize: fontSize.base, color: colors.text.tertiary }}>메일을 선택하면 내용이 표시돼요.</Text>
                            </div>
                        ) : (
                            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column' }}>
                                <SentDetailContent mail={mail.selectedSent} onTrash={trash.askAndTrash} trashing={trash.trashing} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            <FormModal title="새 메일 작성" open={send.composing} onClose={send.resetCompose}
                navigationDirty={Boolean(send.composeForm.toEmail || send.composeForm.subject || send.composeForm.body || send.composeForm.marketing)}
                onSubmit={send.handleComposeSend} submitting={send.composeSending}>
                <FormField label="받는 사람" error={send.errors.toEmail}>
                    <FormInput placeholder="example@email.com" value={send.composeForm.toEmail}
                        onChange={(e) => { send.setComposeForm(f => ({ ...f, toEmail: e.target.value })); send.clearError('toEmail'); }} />
                </FormField>
                <FormField label="제목" error={send.errors.subject}>
                    <FormInput placeholder="메일 제목" value={send.composeForm.subject}
                        onChange={(e) => { send.setComposeForm(f => ({ ...f, subject: e.target.value })); send.clearError('subject'); }} maxLength={500} showCount />
                </FormField>
                <FormField label="광고성 정보">
                    {/* 체크하면 서버가 수신자의 마케팅 수신 동의를 확인하고, 동의하지 않았거나
                        회원이 아니면 발송을 거부한다. 정보통신망법상 광고성 정보는 사전 동의가 필요하다. */}
                    <Checkbox
                        checked={send.composeForm.marketing}
                        onChange={(e) => send.setComposeForm(f => ({ ...f, marketing: e.target.checked }))}
                    >
                        <Text style={{ fontSize: fontSize.sm }}>
                            광고·홍보 메일이에요
                            <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block' }}>
                                체크하면 수신 동의한 회원에게만 발송돼요
                            </Text>
                        </Text>
                    </Checkbox>
                </FormField>
                <FormField label="내용" error={send.errors.body}>
                    <FormTextArea rows={8} placeholder="메일 내용을 입력하세요..." value={send.composeForm.body}
                        onChange={(e) => { send.setComposeForm(f => ({ ...f, body: e.target.value })); send.clearError('body'); }}
                        maxLength={5000} showCount />
                </FormField>
            </FormModal>
        </div>
    );
};

const styles = {
    singlePanel:  { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    emptyPanel:   { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, background: colors.background.paper },
    splitPane:    { display: 'flex', height: 'calc(100vh - 280px)', minHeight: 400, maxHeight: 680, border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    listPanel:    { width: 360, flexShrink: 0, borderRight: `1px solid ${colors.border.light}`, display: 'flex', flexDirection: 'column', background: colors.background.subtle },
    detailPanel:  { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: colors.background.paper },
    emptyDetail:  { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 },
    mobileDetail: { padding: '16px 0' },
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
