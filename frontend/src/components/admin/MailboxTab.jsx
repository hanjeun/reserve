/**
 * RESERVE - 관리자 메일함 탭 (발송 전용)
 * 받은편지함/웹훅 수신 기능은 제거됨 — 문의는 Inquiry 도메인(문의 내역 탭)이 대신 처리.
 *
 * 2026-07 전수조사 — 검색어를 URL 쿼리스트링에 동기화(useQueryParamState) — MembersTab 등과
 * 동일한 이유(새로고침해도 유지, 링크 공유 가능).
 */
import React, { useState, useMemo, useEffect } from 'react';
import { Typography, Input, Divider } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SearchOutlined, SendOutlined, InboxOutlined, ArrowLeftOutlined, SyncOutlined } from '@ant-design/icons';
import { Button, FormTextArea, FormInput, FormModal, FormField } from '../common';
import { Bone } from '../common/Skeletons';
import useDebounce from '../../hooks/useDebounce';
import { useMessage, useWindowWidth, useQueryParamsState } from '../../hooks';
import { adminKeys } from '../../hooks/queryKeys';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { EMAIL_REGEX } from '../../utils/validation';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';

const { Text, Title, Paragraph } = Typography;

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

const useSentMailData = (message) => {
    const [selectedSent, setSelectedSent] = useState(null);

    const { data: sentMails = [], isLoading: loading, error, refetch: loadSentMails } = useQuery({
        queryKey: adminKeys.sentMails(),
        queryFn: async () => {
            const data = await api.get(API_ENDPOINTS.MAIL.SENT);
            return Array.isArray(data) ? data : (data?.content ?? []);
        },
    });
    useEffect(() => {
        if (error) message.error('보낸 메일을 불러오지 못했습니다.');
    }, [error, message]);

    return { sentMails, loading, selectedSent, setSelectedSent, loadSentMails };
};

const useComposeMail = ({ message }) => {
    const queryClient = useQueryClient();
    const [composing, setComposing] = useState(false);
    const [composeForm, setComposeForm] = useState({ toEmail: '', subject: '', body: '' });

    const resetCompose = () => { setComposing(false); setComposeForm({ toEmail: '', subject: '', body: '' }); };

    const sendMutation = useMutation({
        mutationFn: (form) => api.post(API_ENDPOINTS.MAIL.COMPOSE, form),
        onSuccess: () => {
            message.success('메일을 보냈습니다.');
            resetCompose();
            queryClient.invalidateQueries({ queryKey: adminKeys.sentMails() });
        },
        onError: () => message.error('메일 발송에 실패했습니다.'),
    });

    const handleComposeSend = () => {
        const trimmedEmail = composeForm.toEmail.trim();
        if (!trimmedEmail) { message.warning('받는 사람 이메일을 입력해주세요.'); return; }
        if (!EMAIL_REGEX.test(trimmedEmail)) { message.warning('올바른 이메일 형식을 입력해주세요.'); return; }
        if (!composeForm.subject.trim()) { message.warning('제목을 입력해주세요.'); return; }
        if (!composeForm.body.trim()) { message.warning('내용을 입력해주세요.'); return; }
        sendMutation.mutate(composeForm);
    };

    return { composing, setComposing, composeForm, setComposeForm, composeSending: sendMutation.isPending, resetCompose, handleComposeSend };
};

const SearchBar = ({ value, onChange, onReload, loading, onCompose }) => {
    const [cooldown, setCooldown] = useState(false);
    const handleReload = () => {
        if (cooldown || loading) return;
        setCooldown(true); onReload();
        setTimeout(() => setCooldown(false), 3000);
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
                <Button variant="primary" size="sm" onClick={onCompose}
                    style={{ height: 40, borderRadius: 20, paddingLeft: 20, paddingRight: 20, flexShrink: 0, gap: 6 }}>
                    <SendOutlined /> 새 메일
                </Button>
                <Button variant="ghost-sm" size="md" onClick={handleReload} disabled={loading || cooldown}
                    style={{ flexShrink: 0, marginLeft: 'auto' }}>
                    <SyncOutlined spin={loading} /> 새로고침
                </Button>
            </div>
            <Input prefix={<SearchOutlined style={{ color: colors.text.tertiary }} />}
                placeholder="받는 사람, 제목 검색" value={value} onChange={onChange}
                allowClear size="large" style={{ maxWidth: 480 }} />
        </div>
    );
};

/**
 * 보낸 메일 목록 스켈레톤 — 아래 SentMailItem의 실제 3줄 구조(받는사람+날짜 / 제목 / 본문미리보기)에 대응.
 *
 * 2026-07 전수조사: 예전엔 AntD 기본 <Skeleton active paragraph>를 썼는데, 이건 우리
 * 디자인 시스템의 shimmer Bone과 전혀 다른 톤/애니메이션이라 관리자 패널 안에서 이 탭만
 * 혼자 이질적으로 보였다 — 공용 Bone으로 교체하고 실제 행 레이아웃과 같은 모양으로 맞춤.
 */
const SentMailSkeleton = () => (
    <div style={styles.singlePanel}>
        {['sk-0', 'sk-1', 'sk-2', 'sk-3'].map((key) => (
            <div key={key} style={{ padding: '14px 16px 14px 22px', borderBottom: `1px solid ${colors.border.light}` }}>
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

const SentMailItem = ({ mail, isSelected, onClick }) => (
    <button type="button" onClick={() => onClick(mail)} style={{ ...styles.mailItem, background: isSelected ? colors.primary.light : 'transparent' }}>
        <div style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
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
        </div>
    </button>
);

const SentDetailContent = ({ mail }) => (
    <>
        <Title level={4} style={{ fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 16, lineHeight: 1.4 }}>
            {mail.subject || '(제목 없음)'}
        </Title>
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

const MailboxTab = () => {
    const { message } = useMessage();
    const isMobile = useWindowWidth() < 768;
    const [{ search }, setQuery] = useQueryParamsState({ search: '' });
    const debouncedSearch = useDebounce(search, 300);

    const mail = useSentMailData(message);
    const send = useComposeMail({ message });

    const filteredSent = useMemo(() => {
        if (!debouncedSearch.trim()) return mail.sentMails;
        const kw = debouncedSearch.toLowerCase();
        return mail.sentMails.filter(m =>
            m.toEmail?.toLowerCase().includes(kw) || m.subject?.toLowerCase().includes(kw)
        );
    }, [mail.sentMails, debouncedSearch]);

    const isEmpty = !mail.loading && mail.sentMails.length === 0;
    const showLoading = mail.loading;
    const showEmpty = !mail.loading && isEmpty;
    const showMobDetail = !showLoading && !showEmpty && isMobile && !!mail.selectedSent;
    const showMobList = !showLoading && !showEmpty && isMobile && !mail.selectedSent;
    const showDesktop = !showLoading && !showEmpty && !isMobile;

    return (
        <div>
            <SearchBar value={search} onChange={(e) => setQuery({ search: e.target.value })}
                onReload={mail.loadSentMails} loading={mail.loading}
                onCompose={() => send.setComposing(true)} />

            {showLoading && <SentMailSkeleton />}

            {showEmpty && (
                <div style={styles.emptyPanel}>
                    <InboxOutlined style={{ fontSize: 56, color: colors.border.default, marginBottom: 16 }} />
                    <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text.secondary, display: 'block', marginBottom: 6 }}>
                        보낸 메일이 없습니다
                    </Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>
                        &quot;새 메일&quot; 버튼으로 메일을 보낼 수 있습니다.
                    </Text>
                </div>
            )}

            {showMobDetail && (
                <div style={styles.mobileDetail}>
                    <button type="button" onClick={() => mail.setSelectedSent(null)} style={styles.backBtn}>
                        <ArrowLeftOutlined style={{ fontSize: 14, marginRight: 6, color: colors.text.secondary }} />
                        <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>목록으로</Text>
                    </button>
                    <SentDetailContent mail={mail.selectedSent} />
                </div>
            )}

            {showMobList && (
                <div style={styles.singlePanel}>
                    {filteredSent.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <Text style={{ color: colors.text.tertiary }}>검색 결과가 없습니다.</Text>
                        </div>
                    ) : filteredSent.map(m => (
                        <SentMailItem key={m.id} mail={m} isSelected={false} onClick={mail.setSelectedSent} />
                    ))}
                </div>
            )}

            {showDesktop && (
                <div style={styles.splitPane}>
                    <div style={styles.listPanel}>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {filteredSent.length === 0 ? (
                                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                    <Text style={{ color: colors.text.tertiary }}>검색 결과가 없습니다.</Text>
                                </div>
                            ) : filteredSent.map(m => (
                                <SentMailItem key={m.id} mail={m} isSelected={m.id === mail.selectedSent?.id} onClick={mail.setSelectedSent} />
                            ))}
                        </div>
                    </div>
                    <div style={styles.detailPanel}>
                        {!mail.selectedSent ? (
                            <div style={styles.emptyDetail}>
                                <InboxOutlined style={{ fontSize: 48, color: colors.border.default, marginBottom: 12 }} />
                                <Text style={{ fontSize: fontSize.base, color: colors.text.tertiary }}>메일을 선택하면 내용이 표시됩니다.</Text>
                            </div>
                        ) : (
                            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column' }}>
                                <SentDetailContent mail={mail.selectedSent} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            <FormModal title="새 메일 작성" open={send.composing} onClose={send.resetCompose}
                onSubmit={send.handleComposeSend} submitting={send.composeSending}>
                <FormField label="받는 사람">
                    <FormInput placeholder="example@email.com" value={send.composeForm.toEmail}
                        onChange={(e) => send.setComposeForm(f => ({ ...f, toEmail: e.target.value }))} />
                </FormField>
                <FormField label="제목">
                    <FormInput placeholder="메일 제목" value={send.composeForm.subject}
                        onChange={(e) => send.setComposeForm(f => ({ ...f, subject: e.target.value }))} maxLength={500} showCount />
                </FormField>
                <FormField label="내용">
                    <FormTextArea rows={8} placeholder="메일 내용을 입력하세요..." value={send.composeForm.body}
                        onChange={(e) => send.setComposeForm(f => ({ ...f, body: e.target.value }))}
                        maxLength={5000} showCount />
                </FormField>
            </FormModal>
        </div>
    );
};

const styles = {
    singlePanel:  { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    emptyPanel:   { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, padding: '64px 20px', textAlign: 'center', background: colors.background.paper },
    splitPane:    { display: 'flex', height: 'calc(100vh - 280px)', minHeight: 400, maxHeight: 680, border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    listPanel:    { width: 360, flexShrink: 0, borderRight: `1px solid ${colors.border.light}`, display: 'flex', flexDirection: 'column', background: colors.background.subtle },
    detailPanel:  { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: colors.background.paper },
    emptyDetail:  { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 },
    mobileDetail: { padding: '16px 0' },
    mailItem:     { width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '14px 16px 14px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', transition: 'background 0.15s', borderBottom: `1px solid ${colors.border.light}` },
    backBtn:      { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 0 16px 0' },
};

export default MailboxTab;
