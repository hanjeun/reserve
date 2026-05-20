/**
 * RESERVE - 관리자 메일함 탭
 * 서브탭: 받은 메일함 / 보낸 메일함
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Typography, Input, Divider, Skeleton, Modal } from 'antd';
import {
    MailOutlined, SearchOutlined,
    SendOutlined, CloseOutlined, InboxOutlined, ArrowLeftOutlined, SyncOutlined,
} from '@ant-design/icons';
import { Button } from '../common';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);
    return isMobile;
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs   = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs  = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1)  return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHrs  < 24) return `${diffHrs}시간 전`;
    if (diffDays < 7)  return `${diffDays}일 전`;
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}`;
};

const formatFullDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. `
         + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const SubTabBar = ({ active, onChangeTab }) => (
    <div style={S.subTabBar}>
        {[{ key: 'inbox', label: '받은 메일함' }, { key: 'sent', label: '보낸 메일함' }].map(({ key, label }) => (
            <button key={key} onClick={() => onChangeTab(key)} style={{
                ...S.subTabBtn,
                color:        active === key ? colors.primary.main : colors.text.tertiary,
                borderBottom: active === key ? `2px solid ${colors.primary.main}` : '2px solid transparent',
                fontWeight:   active === key ? fontWeight.semibold : fontWeight.medium,
            }}>
                {label}
            </button>
        ))}
    </div>
);

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
                placeholder="발신자, 제목 검색" value={value} onChange={onChange}
                allowClear size="large" style={{ maxWidth: 480 }} />
        </div>
    );
};

// ── 받은 메일 목록 아이템 — borderLeft 제거됨 ──────────────
const MailItem = ({ mail, isSelected, onClick }) => {
    const isUnread = !mail.isRead;
    return (
        <button onClick={() => onClick(mail)} style={{ ...S.mailItem, background: isSelected ? colors.primary.light : 'transparent' }}>
            <div style={S.dotWrapper}>
                {isUnread && <span style={S.unreadDot} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: isUnread ? fontWeight.bold : fontWeight.medium, color: colors.text.primary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mail.fromName || mail.fromEmail}
                    </Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, flexShrink: 0 }}>
                        {formatDate(mail.receivedAt)}
                    </Text>
                </div>
                <Text style={{ display: 'block', fontSize: fontSize.sm, marginTop: 2, fontWeight: isUnread ? fontWeight.semibold : fontWeight.medium, color: isUnread ? colors.text.primary : colors.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mail.subject || '(제목 없음)'}
                </Text>
                <Text style={{ display: 'block', fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mail.body?.replace(/\n/g, ' ') || ''}
                </Text>
            </div>
        </button>
    );
};

// ── 보낸 메일 목록 아이템 — borderLeft 제거됨 ─────────────
const SentMailItem = ({ mail, isSelected, onClick }) => (
    <button onClick={() => onClick(mail)} style={{ ...S.mailItem, background: isSelected ? colors.primary.light : 'transparent' }}>
        <div style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    → {mail.toEmail}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, flexShrink: 0 }}>
                    {formatDate(mail.sentAt)}
                </Text>
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

const ReplyItem = ({ reply }) => (
    <div style={S.replyItem}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={S.replyAvatar}>A</div>
            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text.primary }}>RESERVE 관리자</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>{formatFullDate(reply.sentAt)}</Text>
                </div>
                <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>→ {reply.toEmail}</Text>
            </div>
        </div>
        <Paragraph style={{ margin: '10px 0 0', fontSize: fontSize.sm, color: colors.text.secondary, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {reply.body}
        </Paragraph>
    </div>
);

const InboxDetailContent = ({ mail, replyOpen, replyBody, setReplyBody, sending, openReply, handleSendReply, setReplyOpen, replyRef, isMobile }) => (
    <>
        <Title level={4} style={{ fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 16, lineHeight: 1.4 }}>
            {mail.subject || '(제목 없음)'}
        </Title>
        <div style={{ background: colors.background.subtle, borderRadius: radius.md, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 6 }}>
                <Text style={{ width: 72, flexShrink: 0, fontSize: fontSize.xs, color: colors.text.tertiary, paddingTop: 2 }}>보낸 사람</Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.text.primary, fontWeight: fontWeight.medium }}>
                    {mail.fromName ? `${mail.fromName} <${mail.fromEmail}>` : mail.fromEmail}
                </Text>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Text style={{ width: 72, flexShrink: 0, fontSize: fontSize.xs, color: colors.text.tertiary, paddingTop: 2 }}>받은 시간</Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>{formatFullDate(mail.receivedAt)}</Text>
            </div>
        </div>
        <Divider style={{ margin: '0 0 16px' }} />
        <Paragraph style={{ fontSize: fontSize.sm, color: colors.text.primary, whiteSpace: 'pre-wrap', lineHeight: 1.8, margin: '0 0 auto' }}>
            {mail.body || '(본문 없음)'}
        </Paragraph>
        {mail.replies?.length > 0 && (
            <>
                <Divider style={{ margin: '24px 0 16px' }}>
                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>보낸 답장 {mail.replies.length}개</Text>
                </Divider>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {mail.replies.map(r => <ReplyItem key={r.id} reply={r} />)}
                </div>
            </>
        )}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${colors.border.light}` }}>
            {!replyOpen ? (
                <Button variant="primary" size="sm" icon={<SendOutlined />} onClick={openReply}
                    style={{ borderRadius: radius.xl, paddingLeft: 20, paddingRight: 20 }}>
                    답장하기
                </Button>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: colors.background.subtle, borderRadius: radius.lg, padding: 16, border: `1px solid ${colors.border.default}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text.primary }}>답장</Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>→ {mail.fromEmail}</Text>
                            <button onClick={() => { setReplyOpen(false); setReplyBody(''); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text.tertiary, padding: '2px 4px', borderRadius: radius.sm, display: 'flex', alignItems: 'center' }}>
                                <CloseOutlined style={{ fontSize: 13 }} />
                            </button>
                        </div>
                    </div>
                    <TextArea ref={replyRef} rows={isMobile ? 4 : 6} placeholder="답장 내용을 입력하세요..."
                        value={replyBody} onChange={(e) => setReplyBody(e.target.value)}
                        maxLength={2000} style={{ resize: 'none', fontSize: fontSize.base }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                        <Button variant="ghost" size="sm" onClick={() => { setReplyOpen(false); setReplyBody(''); }} disabled={sending}>취소</Button>
                        <Button variant="primary" size="sm" loading={sending} onClick={handleSendReply}
                            style={{ borderRadius: radius.xl, paddingLeft: 20, paddingRight: 20 }}>
                            보내기
                        </Button>
                    </div>
                </div>
            )}
        </div>
    </>
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

const MailboxTab = ({ onUnreadCountChange }) => {
    const { message } = useMessage();
    const isMobile = useIsMobile();

    const [subTab,         setSubTab]         = useState('inbox');
    const [mails,          setMails]          = useState([]);
    const [selectedMail,   setSelectedMail]   = useState(null);
    const [loading,        setLoading]        = useState(true);
    const [detailLoading,  setDetailLoading]  = useState(false);
    const [search,         setSearch]         = useState('');
    const [replyOpen,      setReplyOpen]      = useState(false);
    const [replyBody,      setReplyBody]      = useState('');
    const [sending,        setSending]        = useState(false);
    const [sentMails,      setSentMails]      = useState([]);
    const [selectedSent,   setSelectedSent]   = useState(null);
    const [sentLoading,    setSentLoading]    = useState(false);
    const [sentLoaded,     setSentLoaded]     = useState(false);
    const [composing,      setComposing]      = useState(false);
    const [composeForm,    setComposeForm]    = useState({ toEmail: '', subject: '', body: '' });
    const [composeSending, setComposeSending] = useState(false);
    const replyRef = useRef(null);

    const loadMails = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.get(API_ENDPOINTS.MAIL.LIST);
            const list = Array.isArray(data) ? data : (data?.content ?? []);
            setMails(list);
            onUnreadCountChange?.(list.filter(m => !m.isRead).length);
        } catch { message.error('메일을 불러오지 못했습니다.'); }
        finally { setLoading(false); }
    }, [message, onUnreadCountChange]);

    const loadSentMails = useCallback(async (force = false) => {
        if (!force && sentLoaded) return;
        setSentLoading(true);
        try {
            const data = await api.get(API_ENDPOINTS.MAIL.SENT);
            setSentMails(Array.isArray(data) ? data : (data?.content ?? []));
            setSentLoaded(true);
        } catch { message.error('보낸 메일을 불러오지 못했습니다.'); }
        finally { setSentLoading(false); }
    }, [message, sentLoaded]);

    useEffect(() => { loadMails(); }, [loadMails]);
    useEffect(() => { if (subTab === 'sent') loadSentMails(); }, [subTab, loadSentMails]);

    const handleSelect = useCallback(async (mail) => {
        if (selectedMail?.id === mail.id) return;
        setSelectedMail({ ...mail, isRead: true });
        setReplyOpen(false); setReplyBody(''); setDetailLoading(true);
        try {
            const detail = await api.get(API_ENDPOINTS.MAIL.DETAIL(mail.id));
            setSelectedMail(detail);
            setMails(prev => {
                const updated = prev.map(m => m.id === mail.id ? { ...m, isRead: true } : m);
                onUnreadCountChange?.(updated.filter(m => !m.isRead).length);
                return updated;
            });
        } catch { message.error('메일 상세를 불러오지 못했습니다.'); }
        finally { setDetailLoading(false); }
    }, [selectedMail, message, onUnreadCountChange]);

    const handleSendReply = async () => {
        if (!replyBody.trim()) { message.warning('답장 내용을 입력해주세요.'); return; }
        setSending(true);
        try {
            await api.post(API_ENDPOINTS.MAIL.REPLY(selectedMail.id), { body: replyBody.trim() });
            message.success('답장을 보냈습니다.');
            setReplyOpen(false); setReplyBody('');
            const detail = await api.get(API_ENDPOINTS.MAIL.DETAIL(selectedMail.id));
            setSelectedMail(detail);
        } catch { message.error('답장 발송에 실패했습니다.'); }
        finally { setSending(false); }
    };

    const handleComposeSend = async () => {
        if (!composeForm.toEmail.trim()) { message.warning('받는 사람 이메일을 입력해주세요.'); return; }
        if (!composeForm.subject.trim()) { message.warning('제목을 입력해주세요.'); return; }
        if (!composeForm.body.trim())    { message.warning('내용을 입력해주세요.'); return; }
        setComposeSending(true);
        try {
            await api.post(API_ENDPOINTS.MAIL.COMPOSE, composeForm);
            message.success('메일을 보냈습니다.');
            setComposing(false); setComposeForm({ toEmail: '', subject: '', body: '' });
            if (subTab === 'sent') loadSentMails(true); else setSentLoaded(false);
        } catch { message.error('메일 발송에 실패했습니다.'); }
        finally { setComposeSending(false); }
    };

    const openReply = () => { setReplyOpen(true); setTimeout(() => replyRef.current?.focus(), 100); };
    const handleBack = () => { setSelectedMail(null); setSelectedSent(null); setReplyOpen(false); setReplyBody(''); };
    const handleTabChange = (key) => { setSubTab(key); setSelectedMail(null); setSelectedSent(null); setSearch(''); setReplyOpen(false); };

    const filteredMails = search.trim()
        ? mails.filter(m => { const kw = search.toLowerCase(); return m.fromEmail?.toLowerCase().includes(kw) || m.fromName?.toLowerCase().includes(kw) || m.subject?.toLowerCase().includes(kw); })
        : mails;
    const filteredSent = search.trim()
        ? sentMails.filter(m => { const kw = search.toLowerCase(); return m.toEmail?.toLowerCase().includes(kw) || m.subject?.toLowerCase().includes(kw); })
        : sentMails;

    const unreadCount = mails.filter(m => !m.isRead).length;
    const isInbox = subTab === 'inbox';
    const currentList    = isInbox ? filteredMails : filteredSent;
    const currentLoading = isInbox ? loading : sentLoading;
    const currentEmpty   = isInbox ? (!loading && mails.length === 0) : (!sentLoading && sentMails.length === 0);
    const mobileDetailOpen = isMobile && (isInbox ? !!selectedMail : !!selectedSent);

    const ComposeModal = (
        <Modal title={<Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold }}>새 메일 작성</Text>}
            open={composing} onCancel={() => { setComposing(false); setComposeForm({ toEmail: '', subject: '', body: '' }); }}
            footer={<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                <Button variant="ghost" size="sm" onClick={() => setComposing(false)} disabled={composeSending}>취소</Button>
                <Button variant="primary" size="sm" loading={composeSending} onClick={handleComposeSend} style={{ borderRadius: radius.xl, paddingLeft: 24, paddingRight: 24 }}>보내기</Button>
            </div>}
            width={560} centered>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
                <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>받는 사람</Text>
                    <Input size="large" placeholder="example@email.com" value={composeForm.toEmail} onChange={(e) => setComposeForm(f => ({ ...f, toEmail: e.target.value }))} />
                </div>
                <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>제목</Text>
                    <Input size="large" placeholder="메일 제목" value={composeForm.subject} onChange={(e) => setComposeForm(f => ({ ...f, subject: e.target.value }))} maxLength={500} />
                </div>
                <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>내용</Text>
                    <TextArea rows={8} placeholder="메일 내용을 입력하세요..." value={composeForm.body} onChange={(e) => setComposeForm(f => ({ ...f, body: e.target.value }))} maxLength={5000} style={{ resize: 'none', fontSize: fontSize.base }} />
                    <div style={{ textAlign: 'right', marginTop: 4 }}>
                        <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>{composeForm.body.length} / 5000</Text>
                    </div>
                </div>
            </div>
        </Modal>
    );

    const unreadLabel = <Text style={{ fontSize: fontSize.sm, color: unreadCount > 0 && isInbox ? colors.primary.main : colors.text.tertiary, fontWeight: unreadCount > 0 && isInbox ? fontWeight.semibold : undefined }}>
        {isInbox && unreadCount > 0 ? `읽지 않은 메일 ${unreadCount}개` : `전체 ${currentList.length}개`}
    </Text>;

    return (
        <div>
            <SearchBar value={search} onChange={(e) => setSearch(e.target.value)}
                onReload={isInbox ? loadMails : () => loadSentMails(true)}
                loading={currentLoading} onCompose={() => setComposing(true)} />
            <SubTabBar active={subTab} onChangeTab={handleTabChange} />

            {currentLoading && (
                <div style={S.singlePanel}>
                    {[...Array(4)].map((_, i) => (
                        <div key={i} style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border.light}` }}>
                            <Skeleton active paragraph={{ rows: 2 }} title={false} />
                        </div>
                    ))}
                </div>
            )}

            {!currentLoading && currentEmpty && (
                <div style={S.emptyPanel}>
                    <InboxOutlined style={{ fontSize: 56, color: colors.border.default, marginBottom: 16 }} />
                    <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text.secondary, display: 'block', marginBottom: 6 }}>
                        {isInbox ? '받은 메일이 없습니다' : '보낸 메일이 없습니다'}
                    </Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>
                        {isInbox ? 'reserve@reserve.it.kr로 보낸 메일이 여기에 표시됩니다.' : '"새 메일" 버튼으로 메일을 보낼 수 있습니다.'}
                    </Text>
                </div>
            )}

            {/* 모바일: 상세 화면 */}
            {!currentLoading && !currentEmpty && isMobile && mobileDetailOpen && (
                <div style={S.mobileDetail}>
                    <button onClick={handleBack} style={S.backBtn}>
                        <ArrowLeftOutlined style={{ fontSize: 14, marginRight: 6, color: colors.text.secondary }} />
                        <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>목록으로</Text>
                    </button>
                    {isInbox && selectedMail && (detailLoading ? <Skeleton active paragraph={{ rows: 6 }} /> : <InboxDetailContent mail={selectedMail} replyOpen={replyOpen} replyBody={replyBody} setReplyBody={setReplyBody} sending={sending} openReply={openReply} handleSendReply={handleSendReply} setReplyOpen={setReplyOpen} replyRef={replyRef} isMobile={true} />)}
                    {!isInbox && selectedSent && <SentDetailContent mail={selectedSent} />}
                </div>
            )}

            {/* 모바일: 목록 */}
            {!currentLoading && !currentEmpty && isMobile && !mobileDetailOpen && (
                <div style={S.singlePanel}>
                    <div style={{ padding: '6px 18px', borderBottom: `1px solid ${colors.border.light}` }}>{unreadLabel}</div>
                    {currentList.length === 0
                        ? <div style={{ padding: '40px 20px', textAlign: 'center' }}><Text style={{ color: colors.text.tertiary }}>검색 결과가 없습니다.</Text></div>
                        : isInbox
                            ? currentList.map(m => <MailItem key={m.id} mail={m} isSelected={false} onClick={handleSelect} />)
                            : currentList.map(m => <SentMailItem key={m.id} mail={m} isSelected={false} onClick={setSelectedSent} />)
                    }
                </div>
            )}

            {/* PC: 분할 화면 */}
            {!currentLoading && !currentEmpty && !isMobile && (
                <div style={S.splitPane}>
                    <div style={S.listPanel}>
                        <div style={{ padding: '6px 18px', borderBottom: `1px solid ${colors.border.light}` }}>{unreadLabel}</div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {currentList.length === 0
                                ? <div style={{ padding: '40px 20px', textAlign: 'center' }}><Text style={{ color: colors.text.tertiary }}>검색 결과가 없습니다.</Text></div>
                                : isInbox
                                    ? currentList.map(m => <MailItem key={m.id} mail={m} isSelected={selectedMail?.id === m.id} onClick={handleSelect} />)
                                    : currentList.map(m => <SentMailItem key={m.id} mail={m} isSelected={selectedSent?.id === m.id} onClick={setSelectedSent} />)
                            }
                        </div>
                    </div>
                    <div style={S.detailPanel}>
                        {(isInbox ? !selectedMail : !selectedSent) ? (
                            <div style={S.emptyDetail}>
                                <MailOutlined style={{ fontSize: 48, color: colors.border.default, marginBottom: 12 }} />
                                <Text style={{ fontSize: fontSize.base, color: colors.text.tertiary }}>메일을 선택하면 내용이 표시됩니다.</Text>
                            </div>
                        ) : isInbox ? (
                            detailLoading
                                ? <div style={{ padding: 32 }}><Skeleton active paragraph={{ rows: 8 }} /></div>
                                : <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column' }}>
                                    <InboxDetailContent mail={selectedMail} replyOpen={replyOpen} replyBody={replyBody} setReplyBody={setReplyBody} sending={sending} openReply={openReply} handleSendReply={handleSendReply} setReplyOpen={setReplyOpen} replyRef={replyRef} isMobile={false} />
                                  </div>
                        ) : (
                            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column' }}>
                                <SentDetailContent mail={selectedSent} />
                            </div>
                        )}
                    </div>
                </div>
            )}
            {ComposeModal}
        </div>
    );
};

const S = {
    subTabBar: { display: 'flex', borderBottom: `1px solid ${colors.border.light}`, marginBottom: 12, gap: 0 },
    subTabBtn: { background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', padding: '8px 16px', fontSize: fontSize.sm, transition: 'all 0.15s' },
    singlePanel: { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    emptyPanel: { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, padding: '64px 20px', textAlign: 'center', background: colors.background.paper },
    splitPane: { display: 'flex', height: 'calc(100vh - 280px)', minHeight: 400, maxHeight: 680, border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    listPanel: { width: 360, flexShrink: 0, borderRight: `1px solid ${colors.border.light}`, display: 'flex', flexDirection: 'column', background: colors.background.subtle },
    detailPanel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: colors.background.paper },
    emptyDetail: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 },
    mobileDetail: { padding: '16px 0' },
    mailItem: { width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '14px 16px 14px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', transition: 'background 0.15s', borderBottom: `1px solid ${colors.border.light}` },
    dotWrapper: { width: 8, paddingTop: 5, flexShrink: 0, display: 'flex', justifyContent: 'center' },
    unreadDot: { display: 'block', width: 7, height: 7, borderRadius: '50%', background: colors.primary.main },
    replyItem: { background: colors.primary.light, borderRadius: radius.md, padding: '14px 16px', border: `1px solid ${colors.border.light}` },
    replyAvatar: { width: 30, height: 30, borderRadius: '50%', background: colors.primary.main, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fontSize.xs, fontWeight: fontWeight.bold, flexShrink: 0 },
    backBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 0 16px 0' },
};

export default MailboxTab;
