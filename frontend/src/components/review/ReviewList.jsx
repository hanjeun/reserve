import LoadingStatus from '../common/LoadingStatus';
import React, { useEffect, useRef, useState } from 'react';
import { Rate, Typography } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    DataState, ReviewCardSkeleton, FormInput, FormTextArea, FormField,
} from '../common';
import {
    UserOutlined, EditOutlined, DeleteOutlined,
    CheckOutlined, CloseOutlined, StarFilled,
} from '../common/icons';
import reviewService from '../../services/reviewService';
import { formatRelativeTime } from '../../utils';
import { useMessage, useFormErrors } from '../../hooks';
import { reviewKeys } from '../../hooks/queryKeys';
import { invalidateReviewData } from '../../hooks/invalidateAfterWrite';
import useAuthStore from '../../store/useAuthStore';
import { colors, radius, shadows, fontSize, fontWeight } from '../../styles/tokens';

const { Text } = Typography;

const RATING_LABELS = { 1: '별로였어요', 2: '아쉬웠어요', 3: '괜찮았어요', 4: '좋았어요', 5: '최고였어요!' };

/** 리뷰 작성/수정 공용 폼 */
const ReviewForm = ({ userName, form, setForm, onSubmit, onCancel, loading: formLoading, isEdit,
                     errors = {}, clearError = () => {} }) => {
    const [hover, setHover] = useState(0);
    const displayRating = hover || form.rating;
    // 제출 버튼 문구 — 수정/작성 여부와 진행 중 여부 조합
    let submitLabel;
    if (formLoading) {
        submitLabel = isEdit ? '저장 중...' : '등록 중...';
    } else {
        submitLabel = isEdit ? '저장' : '리뷰 등록';
    }

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
                            <Rate character={<StarFilled aria-hidden="true" />}
                                value={displayRating}
                                onChange={val => { setForm(f => ({ ...f, rating: val })); clearError('rating'); }}
                                onHoverChange={setHover}
                                style={{ fontSize: 15, color: colors.warning.main }}
                                allowClear={false}
                            />
                            {/*
                             * 별점도 공통 필드 오류 클래스로 입력 오류를 표시한다.
                             */}
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
                    {submitLabel}
                </button>
            </div>
        </div>
    );
};

/*
 * PC 리뷰는 별도 전체 너비 영역의 두 열, 기본 호출은 한 열로 표시한다.
 */
const ReviewList = ({
    storeId,
    completedReservation = null,
    completedReservationError = null,
    completedReservationRetrying = false,
    onCompletedReservationRetry,
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

    // 리뷰 변경 뒤 같은 가게의 리뷰 캐시를 갱신한다.

    const { data: reviews = [], isLoading: loading, isError, error, isFetching, refetch } = useQuery({
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
            // 목록은 위에서 직접 고쳤지만, 가게 별점·리뷰 수와 '내 예약'의 리뷰 버튼은 다른 쿼리다.
            void invalidateReviewData(queryClient);
            message.success('리뷰가 등록됐어요');
            setWriteForm({ rating: 0, title: '', content: '' });
            setWritten(true);
        },
        onError: () => message.error('리뷰 등록에 실패했어요'),
    });

    const handleWriteSubmit = () => {
        if (!completedReservation) return;
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
            void invalidateReviewData(queryClient);
            message.success('리뷰가 수정됐어요');
            cancelEdit();
        },
        onError: () => message.error('리뷰 수정에 실패했어요'),
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
            void invalidateReviewData(queryClient);
            message.success('리뷰가 삭제됐어요');
        },
        onError: () => message.error('리뷰 삭제에 실패했어요'),
    });

    const handleDelete = (reviewId) => {
        confirm({
            title: '리뷰 삭제', content: '리뷰를 삭제할까요? 삭제 후 되돌릴 수 없어요.',
            okText: '삭제하기', cancelText: '취소', okButtonProps: { danger: true }, centered: true,
            onOk: () => deleteMutation.mutateAsync(reviewId),
        });
    };

    // PC의 두 열에 맞춰 골격 네 행을 표시한다.

    if (loading) return <LoadingStatus aria-label="리뷰를 불러오는 중" aria-busy="true"><ReviewCardSkeleton count={isPC ? 4 : 3} isPC={isPC} /></LoadingStatus>;
    if (isError) return <DataState state="error" kind="review" subject="리뷰" error={error}
        onRetry={refetch} retrying={isFetching} />;

    const submitting = createMutation.isPending;
    const editLoading = updateMutation.isPending;
    const canWrite  = !!completedReservation && !completedReservation.reviewId && !written;
    const avgRating = reviews.length
        ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

    return (
        <div>
            {completedReservationError && (
                <DataState
                    state="error"
                    kind="review"
                    subject="리뷰 작성 가능 예약"
                    error={completedReservationError}
                    title="리뷰 작성 가능 예약을 확인하지 못했어요."
                    onRetry={onCompletedReservationRetry}
                    retrying={completedReservationRetrying}
                    compact
                    style={{ marginBottom: 20 }}
                />
            )}
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
                        <Rate character={<StarFilled aria-hidden="true" />} disabled allowHalf value={Number(avgRating)}
                            style={{ fontSize: 15, color: colors.warning.main }} />
                        <Text style={styles.reviewCount}>리뷰 {reviews.length}개</Text>
                    </div>
                </div>
            )}

            {reviews.length === 0 ? (
                // 안내는 리뷰 영역 전체 너비의 중앙에 배치한다.

                <div style={styles.emptyWrap}>
                    <DataState state="empty" kind="review" title="아직 리뷰가 없어요. 첫 번째 리뷰를 남겨보세요!" />
                </div>
            ) : (
                <div style={isPC ? styles.listGridPC : styles.list}>
                    {reviews.map(review => {
                        const isOwner   = user && user.id === review.memberId;
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
                                            <Rate character={<StarFilled aria-hidden="true" />} disabled value={review.rating}
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
    // 빈 결과 안내는 전체 리뷰 영역의 중앙에 배치한다.
    emptyWrap: {
        padding: '60px 0 40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    list: { display: 'flex', flexDirection: 'column', gap: 12 },
    // PC 리뷰는 두 열 그리드를 사용한다.

    listGridPC: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, alignItems: 'start' },
    // 작성/수정 폼은 입력창이 있어 2열 중 한 칸에 넣기엔 좁으므로 그리드 전체 폭을 차지하게 함
    gridSpanAll: { gridColumn: '1 / -1' },
    card: {

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
