/**
 * RESERVE - 관리자 메일함 탭 (발송 전용)
 * 받은편지함/웹훅 수신 기능은 제거됨 — 문의는 Inquiry 도메인(문의 내역 탭)이 대신 처리.
 *
 * 2026-07 전수조사 — 검색어를 URL 쿼리스트링에 동기화(useQueryParamState) — MembersTab 등과
 * 동일한 이유(새로고침해도 유지, 링크 공유 가능).
 *
 * 2026-08-09: ★ 페이지네이션·검색을 서버로 올렸다.
 *   예전에는 page 파라미터 자체가 없어서 **보낸 메일 전량**을 받아온 뒤 그 배열을 filter 했다.
 *   보낸 메일은 지우지 않는 한 계속 쌓이기만 하는 데이터고, 응답에 본문(body)까지 통째로
 *   들어 있어서 시간이 지날수록 이 화면만 눈에 띄게 느려진다.
 *   백엔드 GET /api/admin/mail/sent 의 **응답 형식도 배열 → Page 로 바뀌었다**(같이 배포할 것).
 */
import React, { useState, useEffect } from 'react';
import { Typography, Input, Divider, Pagination, Checkbox } from 'antd';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { SearchOutlined, SendOutlined, InboxOutlined, ArrowLeftOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, FormTextArea, FormInput, FormModal, FormField, RefreshButton } from '../common';
import { Bone } from '../common/Skeletons';
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
        // ★ page·검색어가 쿼리키에 들어가야 한다. 서버가 두 값을 모두 반영하므로
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
    useEffect(() => {
        if (error) message.error('보낸 메일을 불러오지 못했습니다.');
    }, [error, message]);

    return {
        sentMails: data?.mails ?? EMPTY_MAILS,
        totalElements: data?.totalElements ?? 0,
        loading, isFetching, selectedSent, setSelectedSent, loadSentMails,
    };
};

const useComposeMail = ({ message }) => {
    const queryClient = useQueryClient();
    const [composing, setComposing] = useState(false);
    // marketing: 광고성 정보 여부 (2026-08-11).
    // ⚠️ 백엔드는 이 값이 없으면 **광고로 간주**한다(안전한 쪽이 기본). 그래서 화면에서는
    //    반드시 명시적으로 보내야 하고, 기본값은 false(=문의 답변 등 일반 발송)로 둔다.
    //    광고를 보낼 때만 체크하게 해서, 체크하는 순간 동의 확인이 걸리게 만든다.
    const [composeForm, setComposeForm] = useState({ toEmail: '', subject: '', body: '', marketing: false });
    const { errors, validate, clearError, resetErrors } = useFormErrors();

    const resetCompose = () => { setComposing(false); setComposeForm({ toEmail: '', subject: '', body: '', marketing: false }); resetErrors(); };

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
        // 네 칸을 한 번에 검사한다. 예전엔 warning 토스트를 네 번 이어 붙여서
        // 첫 오류만 보이고, 겹쳐 누르면 토스트가 쌓였다.
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

/**
 * 보낸 메일을 휴지통으로 보낸다.
 *
 * 실제 삭제가 아니라 소프트 삭제다 — 보낸 메일은 "무엇을 보냈는가"의 기록이라
 * 실수로 지웠을 때 되돌릴 수 없으면 기록의 가치가 사라진다.
 * 휴지통 탭에서 30일 안에 복구할 수 있고, 그 뒤 스케줄러가 영구 삭제한다.
 */
const useTrashMail = ({ message, selectedSent, setSelectedSent }) => {
    const queryClient = useQueryClient();
    const { confirm } = useMessage();

    const mutation = useMutation({
        mutationFn: (id) => api.delete(API_ENDPOINTS.MAIL.TRASH_SENT(id)),
        onSuccess: (_data, id) => {
            message.success('휴지통으로 옮겼습니다.');
            // 지운 메일을 보고 있었다면 상세를 비운다 — 안 비우면 목록에서 사라진 메일이
            // 오른쪽 패널에 계속 남아 "지워졌는데 아직 있다"처럼 보인다.
            if (selectedSent?.id === id) setSelectedSent(null);
            queryClient.invalidateQueries({ queryKey: adminKeys.sentMails() });
            // 휴지통 탭이 이 메일을 새로 받아야 한다.
            queryClient.invalidateQueries({ queryKey: adminKeys.trash() });
        },
        onError: () => message.error('휴지통으로 옮기지 못했습니다.'),
    });

    const askAndTrash = (mail) => confirm({
        title: '휴지통으로 이동',
        content: `"${mail.subject || '(제목 없음)'}" 메일을 휴지통으로 옮깁니다. 휴지통 탭에서 30일 안에 복구할 수 있습니다.`,
        okText: '휴지통으로',
        okButtonProps: { danger: true },
        onOk: () => mutation.mutateAsync(mail.id),
    });

    return { askAndTrash, trashing: mutation.isPending };
};

// 쿨다운·스피너 정지는 RefreshButton 이 갖는다(2026-08-25). 예전엔 여기서 3초 쿨다운을
// 직접 구현했는데, setTimeout 을 정리하지 않아 쿨다운 도중 화면을 떠나면 사라진 컴포넌트에
// setState 가 걸렸다. 같은 구현이 FilterToolbar·ChatTab 에도 따로 있었다.
const SearchBar = ({ value, onChange, onReload, loading, onCompose }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
                <Button variant="primary" size="sm" onClick={onCompose}
                    style={{ height: 40, borderRadius: 20, paddingLeft: 20, paddingRight: 20, flexShrink: 0, gap: 6 }}>
                    <SendOutlined /> 새 메일
                </Button>
                <RefreshButton onReload={onReload} loading={loading} style={{ marginLeft: 'auto' }} />
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
// ★ 행 패딩은 아래 SentMailItem 의 본문 버튼과 **같은 값**이어야 한다('14px 16px').
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
 * 목록 한 줄.
 *
 * ★ 휴지통 버튼을 행 안에 넣으면서 구조가 바뀌었다 — 예전엔 행 전체가 하나의 {@code <button>}
 *   이었는데, {@code <button>} 안에 {@code <button>} 은 HTML 상 허용되지 않는다(중첩 금지).
 *   그래서 바깥을 div 로 바꾸고, "본문 선택"과 "휴지통"을 **형제 버튼 둘**로 나눴다.
 *   각각이 진짜 버튼이라 키보드 Tab·Enter·스크린리더가 그대로 동작한다.
 *
 * ★ hover/active/선택 상태는 index.css 의 .reserve-maillist-item 이 담당한다.
 *   인라인 style 로는 :hover 를 표현할 수 없어서, 예전엔 transition 만 걸어놓고
 *   정작 바뀌는 값이 없어 **눌리는 느낌이 전혀 없었다.**
 */
const SentMailItem = ({ mail, isSelected, onClick, onTrash, trashing }) => (
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
        <button type="button" className="reserve-maillist-trash" style={styles.mailItemTrash}
            onClick={() => onTrash(mail)} disabled={trashing}
            aria-label={`${mail.subject || '제목 없음'} 메일을 휴지통으로`} title="휴지통으로">
            <DeleteOutlined />
        </button>
    </div>
);

const SentDetailContent = ({ mail, onTrash, trashing }) => (
    <>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <Title level={4} style={{ flex: 1, minWidth: 0, fontWeight: fontWeight.bold, color: colors.text.primary, margin: 0, lineHeight: 1.4 }}>
                {mail.subject || '(제목 없음)'}
            </Title>
            {/* 목록에서도 지울 수 있지만, 읽고 나서 지우는 게 자연스러운 순서라 여기에도 둔다. */}
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
    const showEmpty = !mail.loading && isEmpty;
    const showMobDetail = !showLoading && !showEmpty && isMobile && !!mail.selectedSent;
    const showMobList = !showLoading && !showEmpty && isMobile && !mail.selectedSent;
    const showDesktop = !showLoading && !showEmpty && !isMobile;

    return (
        <div>
            <SearchBar value={search} onChange={handleSearchChange}
                onReload={mail.loadSentMails} loading={mail.loading || mail.isFetching}
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
                    {/* ★ 손으로 만든 <button> 을 쓰지 않는다 (2026-08-24 2차).
                        가게 상세의 "뒤로가기"와 **같은 컴포넌트·같은 variant** 다.
                        한때 전용 클래스(.reserve-backlink)를 따로 만들었는데, 그러면
                        hover 색·포커스 링·모서리를 이 화면만 따로 갖게 된다 —
                        실제로 파란 알약처럼 보인다는 지적이 나왔다.
                        같은 동작(뒤로 가기)은 같은 버튼으로 그린다. */}
                    <Button variant="ghost" onClick={() => mail.setSelectedSent(null)} style={styles.backBtn}>
                        <ArrowLeftOutlined style={{ fontSize: 14 }} /> 목록으로
                    </Button>
                    <SentDetailContent mail={mail.selectedSent} onTrash={trash.askAndTrash} trashing={trash.trashing} />
                </div>
            )}

            {showMobList && (
                <>
                    <div style={styles.singlePanel}>
                        {filteredSent.length === 0 ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                <Text style={{ color: colors.text.tertiary }}>검색 결과가 없습니다.</Text>
                            </div>
                        ) : filteredSent.map(m => (
                            <SentMailItem key={m.id} mail={m} isSelected={false} onClick={mail.setSelectedSent}
                                onTrash={trash.askAndTrash} trashing={trash.trashing} />
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
                                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                    <Text style={{ color: colors.text.tertiary }}>검색 결과가 없습니다.</Text>
                                </div>
                            ) : filteredSent.map(m => (
                                <SentMailItem key={m.id} mail={m} isSelected={m.id === mail.selectedSent?.id} onClick={mail.setSelectedSent}
                                    onTrash={trash.askAndTrash} trashing={trash.trashing} />
                            ))}
                        </div>
                        {/* 목록 패널 바닥에 고정 — flex:1 인 스크롤 영역 밖에 두어야 항상 보인다. */}
                        <MailPagination page={page} total={mail.totalElements} onChange={handlePageChange} />
                    </div>
                    <div style={styles.detailPanel}>
                        {!mail.selectedSent ? (
                            <div style={styles.emptyDetail}>
                                <InboxOutlined style={{ fontSize: 48, color: colors.border.default, marginBottom: 12 }} />
                                <Text style={{ fontSize: fontSize.base, color: colors.text.tertiary }}>메일을 선택하면 내용이 표시됩니다.</Text>
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
                            광고·홍보 메일입니다
                            <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block' }}>
                                체크하면 수신 동의한 회원에게만 발송됩니다
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
    emptyPanel:   { border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, padding: '64px 20px', textAlign: 'center', background: colors.background.paper },
    splitPane:    { display: 'flex', height: 'calc(100vh - 280px)', minHeight: 400, maxHeight: 680, border: `1px solid ${colors.border.default}`, borderRadius: radius.lg, overflow: 'hidden', background: colors.background.paper },
    listPanel:    { width: 360, flexShrink: 0, borderRight: `1px solid ${colors.border.light}`, display: 'flex', flexDirection: 'column', background: colors.background.subtle },
    detailPanel:  { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: colors.background.paper },
    emptyDetail:  { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 },
    mobileDetail: { padding: '16px 0' },
    // 행 껍데기. 배경·hover·선택 표시는 index.css 의 .reserve-maillist-item 이 갖는다 —
    // 인라인 style 로는 :hover 를 쓸 수 없어서 여기에 두면 눌리는 느낌이 안 난다.
    mailItem:     { display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${colors.border.light}` },
    // 왼쪽 22 → 16 (2026-08-24). 22 는 선택 표시용 세로줄(4px) 자리를 비우려던 값인데
    // 그 줄을 없앴다 — 연한 파란 배경만으로 충분하고, 목록마다 세로선이 생겨 어긋나 보였다.
    // 위 SentMailSkeleton 과 같은 값을 유지할 것.
    mailItemMain: { flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 4px 14px 16px' },
    /**
     * ★ 휴지통 버튼 위치 (2026-08-24 2차 수정).
     *
     * 전에는 3줄짜리 행의 **세로 한가운데**에 떠 있었다. 그런데 오른쪽 열에서 눈에 먼저
     * 들어오는 기준선은 같은 열 맨 위의 보낸 시각("3일 전")이다. 아이콘만 한 줄 아래에
     * 있으니 오른쪽 정렬이 어긋난 것처럼 보였다.
     * alignSelf 로 위에 붙이고 marginTop 으로 **첫 줄의 중심**에 맞춘다
     * (본문 상단 패딩 14 + 첫 줄 높이 절반 ≈ 23 → 32px 판의 중심이 그 지점에 온다).
     *
     * 크기를 32×32 로 고정한 이유 — 아이콘만 있으면 어디를 눌러야 하는지가 안 보이고
     * 손가락 목표로도 작다. 둥근 네모 판은 index.css 가 hover 에서 드러낸다.
     */
    mailItemTrash:{ alignSelf: 'flex-start', flexShrink: 0, width: 32, height: 32, margin: '7px 14px 0 0', padding: 0, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    // 가게 상세(StoreDetail)의 backBtn 과 같은 값 — 두 화면의 뒤로가기가 달라 보이면 안 된다.
    backBtn:      { marginBottom: 12, padding: '4px 8px', fontSize: fontSize.sm, color: colors.text.secondary },
    // 데스크톱은 목록 패널 안쪽 바닥(위 경계선 있음), 모바일은 카드 바로 아래에 떨어져 놓인다.
    paginationBar: { display: 'flex', justifyContent: 'center', padding: '10px 8px', borderTop: `1px solid ${colors.border.light}` },
};

export default MailboxTab;
