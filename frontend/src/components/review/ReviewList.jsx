import React, { useEffect, useRef, useState } from 'react';
import { Rate, Typography, Empty } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ReviewCardSkeleton } from '../common';
import {
    UserOutlined, EditOutlined, DeleteOutlined,
    CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import reviewService from '../../services/reviewService';
import { formatRelativeTime } from '../../utils';
import { useMessage, useFormErrors } from '../../hooks';
import { reviewKeys } from '../../hooks/queryKeys';
import useAuthStore from '../../store/useAuthStore';
import { colors, radius, shadows, fontSize, fontWeight } from '../../styles/tokens';
import { FormInput, FormTextArea, FormField } from '../common';

const { Text } = Typography;

const RATING_LABELS = { 1: '별로였어요', 2: '아쉬웠어요', 3: '괜찮았어요', 4: '좋았어요', 5: '최고였어요!' };

/** 리뷰 작성/수정 공용 폼 */
const ReviewForm = ({ userName, form, setForm, onSubmit, onCancel, loading: formLoading, isEdit,
                     errors = {}, clearError = () => {} }) => {
    const [hover, setHover] = useState(0);
    const displayRating = hover || form.rating;

    return (
        <div style={styles.card}>
            <div style={styles.cardHeader}>
                <div style={styles.authorRow}>
                    <div style={styles.avatar}>
                        <UserOutlined style={{ color: colors.primary.main, fontSize: 16 }} />
                    </div>
                    <div>
                        <Text strong style={styles.authorName}>{userName}</Text>
                        <div style={{ marginTop: 2 }}>
                            <Rate
                                value={displayRating}
                                onChange={val => { setForm(f => ({ ...f, rating: val })); clearError('rating'); }}
                                onHoverChange={setHover}
                                style={{ fontSize: 15, color: colors.warning.main }}
                                allowClear={false}
                            />
                            {/* 별점은 카드 헤더에 있어 FormField 로 감쌀 자리가 없다.
                                에러 표기는 같은 클래스(.reserve-field-error)를 직접 써서
                                아래 입력칸들과 모양을 맞춘다 — 스타일 출처는 index.css 하나다. */}
                            {errors.rating && (
                                <span className="reserve-field-error" role="alert">{errors.rating}</span>
                            )}
                        </div>
                    </div>
                </div>
                <Text style={styles.ratingLabel}>
                    {displayRating ? RATING_LABELS[displayRating] : ''}
                </Text>
            </div>

            <div style={styles.divider} />

            <div style={styles.formBody}>
                {/* 라벨은 placeholder 가 대신하므로 FormField 에 label 을 주지 않는다 —
                    인라인 에러 슬롯을 얻으려고 감싸는 것이다. */}
                <FormField error={errors.title}>
                    <FormInput
                        value={form.title}
                        onChange={e => { setForm(f => ({ ...f, title: e.target.value })); clearError('title'); }}
                        placeholder="리뷰 제목을 입력해주세요"
                        maxLength={100}
                        showCount
                    />
                </FormField>
                <FormField error={errors.content}>
                    <FormTextArea
                        value={form.content}
                        onChange={e => { setForm(f => ({ ...f, content: e.target.value })); clearError('content'); }}
                        placeholder="서비스, 분위기 등 솔직한 경험을 공유해주세요 (10자 이상)"
                        rows={4}
                        maxLength={1000}
                        showCount
                    />
                </FormField>
            </div>

            <div style={styles.cardActions}>
                <button style={styles.actionBtn} onClick={onCancel}>
                    <CloseOutlined style={{ marginRight: 4 }} />취소
                </button>
                <div style={styles.actionDivider} />
                <button
                    style={{ ...styles.actionBtn, ...styles.actionBtnPrimary }}
                    onClick={onSubmit}
                    disabled={formLoading}
                >
                    <CheckOutlined style={{ marginRight: 4 }} />
                    {formLoading ? (isEdit ? '저장 중...' : '등록 중...') : (isEdit ? '저장' : '리뷰 등록')}
                </button>
            </div>
        </div>
    );
};

/**
 * 가게 상세 페이지 리뷰 목록 + 작성/수정/삭제
 *
 * 2026-07 추가 — isPC prop. 리뷰 섹션이 StoreDetail.jsx의 2단 레이아웃(pcGrid) 밖으로 나와
 * 풀와이드가 되면서, PC에서는 카드 목록을 2열 그리드로 채우고("빈 오른쪽 공간" 문제 해결),
 * 리뷰가 없을 때의 안내 문구도 그 풀와이드 안에서 진짜로 중앙에 오도록 한다.
 * isPC를 안 넘기면(기존 호출부 호환) 모바일과 동일한 1열 레이아웃으로 동작한다.
 */
const ReviewList = ({
    storeId,
    completedReservation = null,
    focusReviewId = null,
    onRatingLoad,
    isPC = false,
}) => {
    const { user } = useAuthStore();
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();

    const [writeForm,   setWriteForm]   = useState({ rating: 0, title: '', content: '' });
    const [written,     setWritten]     = useState(false);
    const [editingId,   setEditingId]   = useState(null);
    const [editForm,    setEditForm]    = useState({ rating: 0, title: '', content: '' });

    // 작성 폼과 수정 폼은 화면에 동시에 떠 있을 수 있다(아래 목록에서 한 건을 수정하는 동안
    // 위쪽 작성 폼이 그대로 남는다). 오류 상태를 공유하면 한쪽 검증이 다른 쪽 칸을 빨갛게 만든다.
    const { errors: writeErrors, validate: writeValidate, clearError: clearWriteError } = useFormErrors();
    const { errors: editErrors, validate: editValidate,
            clearError: clearEditError, resetErrors: resetEditErrors } = useFormErrors();

    const reviewRefs = useRef({});

    // 2026-07-09: TanStack Query로 전환 (reviewKeys.byStore) — 생성/수정/삭제는
    // 다시 불러오기 대신 setQueryData로 캐시를 직접 수정해서(기존 로컬 state 스플라이싱과 동일한 체감) 즉시 반영된다.
    const { data: reviews = [], isLoading: loading } = useQuery({
        queryKey: reviewKeys.byStore(storeId),
        queryFn: async () => {
            const data = await reviewService.getReviewsByStore(storeId);
            return Array.isArray(data) ? data : [];
        },
        enabled: !!storeId,
    });

    useEffect(() => {
        if (!onRatingLoad) return;
        const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
        onRatingLoad({ avg: avg ? Number(avg) : null, count: reviews.length });
    }, [reviews]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!focusReviewId || loading) return;
        const timer = setTimeout(() => {
            reviewRefs.current[focusReviewId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
        return () => clearTimeout(timer);
    }, [focusReviewId, loading]);

    const createMutation = useMutation({
        mutationFn: (payload) => reviewService.createReview(payload),
        onSuccess: (created) => {
            queryClient.setQueryData(reviewKeys.byStore(storeId), (old = []) => [created, ...old]);
            message.success('리뷰가 등록되었습니다');
            setWriteForm({ rating: 0, title: '', content: '' });
            setWritten(true);
        },
        onError: () => message.error('리뷰 등록에 실패했습니다'),
    });

    const handleWriteSubmit = () => {
        if (!writeValidate((e) => {
            if (!writeForm.rating) e.rating = '별점을 선택해주세요';
            if (!writeForm.title.trim()) e.title = '제목을 입력해주세요';
            if (writeForm.content.trim().length < 10) e.content = '내용을 10자 이상 입력해주세요';
        })) return;
        createMutation.mutate({
            reservationId: completedReservation.reservationId,
            rating:  writeForm.rating,
            title:   writeForm.title.trim(),
            content: writeForm.content.trim(),
        });
    };

    const startEdit = (review) => {
        resetEditErrors();
        setEditingId(review.id);
        setEditForm({ rating: review.rating, title: review.title || '', content: review.content });
    };
    const cancelEdit = () => { setEditingId(null); setEditForm({ rating: 0, title: '', content: '' }); resetEditErrors(); };

    const updateMutation = useMutation({
        mutationFn: ({ reviewId, payload }) => reviewService.updateReview(reviewId, payload),
        onSuccess: (_, { reviewId, payload }) => {
            queryClient.setQueryData(reviewKeys.byStore(storeId), (old = []) =>
                old.map(r => (r.id === reviewId ? { ...r, ...payload } : r))
            );
            message.success('리뷰가 수정되었습니다');
            cancelEdit();
        },
        onError: () => message.error('리뷰 수정에 실패했습니다'),
    });

    const submitEdit = (reviewId) => {
        if (!editValidate((e) => {
            if (!editForm.rating) e.rating = '별점을 선택해주세요';
            if (!editForm.title.trim()) e.title = '제목을 입력해주세요';
            if (editForm.content.trim().length < 10) e.content = '내용을 10자 이상 입력해주세요';
        })) return;
        updateMutation.mutate({
            reviewId,
            payload: { rating: editForm.rating, title: editForm.title.trim(), content: editForm.content.trim() },
        });
    };

    const deleteMutation = useMutation({
        mutationFn: (reviewId) => reviewService.deleteReview(reviewId),
        onSuccess: (_, reviewId) => {
            queryClient.setQueryData(reviewKeys.byStore(storeId), (old = []) => old.filter(r => r.id !== reviewId));
            message.success('리뷰가 삭제되었습니다');
        },
        onError: () => message.error('리뷰 삭제에 실패했습니다'),
    });

    const handleDelete = (reviewId) => {
        confirm({
            title: '리뷰 삭제', content: '리뷰를 삭제하시겠습니까? 삭제 후 되돌릴 수 없습니다.',
            okText: '삭제하기', cancelText: '취소', okButtonProps: { danger: true }, centered: true,
            onOk: () => deleteMutation.mutateAsync(reviewId),
        });
    };

    // 2026-07 추가: PC에서는 2열 그리드라 한 화면에 더 많이 채워지는 게 자연스러워서 개수를 4로 늘림
    // (3개면 2열 그리드에서 한 칸이 어중간하게 비어 보인다). 모바일은 기존과 동일하게 3.
    if (loading) return <ReviewCardSkeleton count={isPC ? 4 : 3} isPC={isPC} />;

    const submitting = createMutation.isPending;
    const editLoading = updateMutation.isPending;
    const canWrite  = !!completedReservation && !completedReservation.reviewId && !written;
    const avgRating = reviews.length
        ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

    return (
        <div>
            {canWrite && (
                <div style={{ marginBottom: 20 }}>
                    <ReviewForm
                        userName={user?.name ?? '나'}
                        form={writeForm} setForm={setWriteForm}
                        errors={writeErrors} clearError={clearWriteError}
                        onSubmit={handleWriteSubmit}
                        onCancel={() => { setWritten(true); setWriteForm({ rating: 0, title: '', content: '' }); }}
                        loading={submitting} isEdit={false}
                    />
                </div>
            )}

            {reviews.length > 0 && (
                <div style={styles.summary}>
                    <span style={styles.avgScore}>{avgRating}</span>
                    <div style={styles.summaryMeta}>
                        <Rate disabled allowHalf value={Number(avgRating)}
                            style={{ fontSize: 15, color: colors.warning.main }} />
                        <Text style={styles.reviewCount}>리뷰 {reviews.length}개</Text>
                    </div>
                </div>
            )}

            {reviews.length === 0 ? (
                // 2026-07 수정 — 리뷰 섹션이 풀와이드가 된 만큼, 안내 문구도 그 풀와이드 폭 전체를
                // 기준으로 진짜 중앙에 오도록 flex 중앙정렬로 감쌌다(예전엔 Empty 자체는 좌우 중앙이지만
                // 그 바깥을 감싼 섹션이 좁은 폭에 고정되어 있어서 화면 전체 기준으로는 왼쪽에 쏠려 보였다).
                <div style={styles.emptyWrap}>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<span style={{ color: colors.text.tertiary }}>아직 리뷰가 없습니다. 첫 번째 리뷰를 남겨보세요!</span>}
                    />
                </div>
            ) : (
                <div style={isPC ? styles.listGridPC : styles.list}>
                    {reviews.map(review => {
                        const isOwner   = user && user.email === review.memberEmail;
                        const isEditing = editingId === review.id;
                        const isFocused = focusReviewId === review.id;

                        if (isEditing) {
                            return (
                                <div key={review.id} ref={el => { reviewRefs.current[review.id] = el; }}
                                    style={isPC ? styles.gridSpanAll : undefined}>
                                    <ReviewForm
                                        userName={review.memberName}
                                        form={editForm} setForm={setEditForm}
                                        errors={editErrors} clearError={clearEditError}
                                        onSubmit={() => submitEdit(review.id)}
                                        onCancel={cancelEdit}
                                        loading={editLoading} isEdit={true}
                                    />
                                </div>
                            );
                        }

                        return (
                            <div
                                key={review.id}
                                ref={el => { reviewRefs.current[review.id] = el; }}
                                style={{ ...styles.card, ...(isFocused ? styles.cardFocused : {}) }}
                            >
                                <div style={styles.cardHeader}>
                                    <div style={styles.authorRow}>
                                        <div style={styles.avatar}>
                                            <UserOutlined style={{ color: colors.primary.main, fontSize: 16 }} />
                                        </div>
                                        <div>
                                            <Text strong style={styles.authorName}>{review.memberName}</Text>
                                            <Rate disabled value={review.rating}
                                                style={{ fontSize: 15, color: colors.warning.main, marginTop: 2, display: 'block' }} />
                                        </div>
                                    </div>
                                    <Text style={styles.date}>{formatRelativeTime(review.createdAt)}</Text>
                                </div>

                                <div style={styles.divider} />

                                <div style={styles.reviewBody}>
                                    {review.title && <p style={styles.reviewTitle}>{review.title}</p>}
                                    <p style={styles.reviewContent}>{review.content}</p>
                                </div>

                                {isOwner && (
                                    <div style={styles.cardActions}>
                                        <button style={styles.actionBtn} onClick={() => startEdit(review)}>
                                            <EditOutlined style={{ marginRight: 4 }} />수정
                                        </button>
                                        <div style={styles.actionDivider} />
                                        <button
                                            style={{ ...styles.actionBtn, ...styles.actionBtnDanger }}
                                            onClick={() => handleDelete(review.id)}
                                        >
                                            <DeleteOutlined style={{ marginRight: 4 }} />삭제
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const styles = {
    summary: {
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '20px 0 24px', borderBottom: `1px solid ${colors.border.light}`, marginBottom: 24,
    },
    summaryMeta: { display: 'flex', flexDirection: 'column', gap: 6 },
    avgScore: {
        fontSize: '42px', fontWeight: fontWeight.heavy, color: colors.text.primary,
        lineHeight: 1, letterSpacing: '-1px',
    },
    reviewCount: { color: colors.text.tertiary, fontSize: fontSize.sm, marginTop: 2 },
    // 2026-07 수정 — 풀와이드 섹션 전체를 기준으로 아이콘+문구가 진짜 중앙에 오도록 flex 중앙정렬.
    emptyWrap: {
        padding: '60px 0 40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    list: { display: 'flex', flexDirection: 'column', gap: 12 },
    // 2026-07 추가 — PC 전용 2열 그리드. 리뷰 섹션이 풀와이드가 되면서 1열로만 쌓으면
    // 오른쪽 절반이 계속 비어 보이는 문제가 있었다.
    listGridPC: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, alignItems: 'start' },
    // 작성/수정 폼은 입력창이 있어 2열 중 한 칸에 넣기엔 좁으므로 그리드 전체 폭을 차지하게 함
    gridSpanAll: { gridColumn: '1 / -1' },
    card: {
        // 2026-07 버그 수정: 예전엔 padding이 '20px 16px 0 16px'(하단 0)이었다.
        // 하단을 cardActions(marginTop 16 + 좌우 -16)가 채워주는 구조였는데, 그 액션바는
        // isOwner일 때만 렌더된다 — 즉 남의 리뷰에서는 본문 마지막 줄이 카드 아래 테두리에
        // 그대로 붙어버렸다. 살리려면 하단에도 padding을 주고, 액션바가 있을 땐 marginBottom으로 상쇄한다.
        padding: '20px 16px',
        backgroundColor: colors.background.paper, borderRadius: radius.xl,
        border: `1px solid ${colors.border.light}`, boxShadow: shadows.card,
        overflow: 'hidden', transition: 'box-shadow 0.2s, border-color 0.2s',
    },
    cardFocused: {
        border: `1px solid ${colors.primary.main}`,
        boxShadow: `0 0 0 3px ${colors.primary.light}`,
    },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
    authorRow:  { display: 'flex', alignItems: 'center', gap: 10 },
    avatar: {
        width: 38, height: 38, borderRadius: '50%',
        backgroundColor: colors.primary.light,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    authorName:   { fontSize: fontSize.base, color: colors.text.primary, display: 'block', lineHeight: 1.3 },
    date:         { fontSize: fontSize.xs, color: colors.text.tertiary },
    ratingLabel:  { fontSize: fontSize.xs, color: colors.text.tertiary, alignSelf: 'flex-end' },
    divider:      { height: 1, backgroundColor: colors.border.light, margin: '14px 0' },
    reviewBody:    { display: 'flex', flexDirection: 'column', gap: 6 },
    reviewTitle:   { margin: 0, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text.primary, lineHeight: 1.4 },
    reviewContent: { margin: 0, fontSize: fontSize.md, color: colors.text.secondary, lineHeight: 1.7, whiteSpace: 'pre-wrap' },
    formBody: { display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 8 },
    cardActions: {
        display: 'flex', borderTop: `1px solid ${colors.border.light}`,
        // marginBottom: -20 — card의 아래 padding(20px)을 상쇄해서 액션바가 카드 밑변에 딱 붙게 함.
        // (액션바가 없는 남의 리뷰에서는 그 padding이 그대로 살아서 본문이 테두리에 안 붙는다)
        marginTop: 16, marginLeft: -16, marginRight: -16, marginBottom: -20,
    },
    actionBtn: {
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '12px 0', border: 'none', background: 'none', cursor: 'pointer',
        fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text.secondary,
        transition: 'background 0.15s, color 0.15s', gap: 4,
    },
    actionBtnPrimary: { color: colors.primary.main },
    actionBtnDanger:  { color: colors.error.main },
    actionDivider:    { width: 1, backgroundColor: colors.border.light, alignSelf: 'stretch' },
};

export default ReviewList;
