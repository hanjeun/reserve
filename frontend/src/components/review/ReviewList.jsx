import React, { useEffect, useRef, useState } from 'react';
import { Rate, Typography, Empty } from 'antd';
import { ReviewCardSkeleton } from '../common';
import {
    UserOutlined, EditOutlined, DeleteOutlined,
    CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import reviewService from '../../services/reviewService';
import { formatRelativeTime } from '../../utils';
import { useMessage } from '../../hooks';
import useAuthStore from '../../store/useAuthStore';
import { colors, radius, shadows, fontSize, fontWeight } from '../../styles/tokens';
import { FormInput, FormTextArea } from '../common';

const { Text } = Typography;

const RATING_LABELS = { 1: '별로였어요', 2: '아쉬웠어요', 3: '괜찮았어요', 4: '좋았어요', 5: '최고였어요!' };

/** 리뷰 작성/수정 공용 폼 */
const ReviewForm = ({ userName, form, setForm, onSubmit, onCancel, loading: formLoading, isEdit }) => {
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
                                onChange={val => setForm(f => ({ ...f, rating: val }))}
                                onHoverChange={setHover}
                                style={{ fontSize: 15, color: colors.warning.main }}
                                allowClear={false}
                            />
                        </div>
                    </div>
                </div>
                <Text style={styles.ratingLabel}>
                    {displayRating ? RATING_LABELS[displayRating] : ''}
                </Text>
            </div>

            <div style={styles.divider} />

            <div style={styles.formBody}>
                <FormInput
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="리뷰 제목을 입력해주세요"
                    maxLength={100}
                />
                <FormTextArea
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="서비스, 분위기 등 솔직한 경험을 공유해주세요 (10자 이상)"
                    rows={4}
                    maxLength={1000}
                    showCount
                />
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

/** 가게 상세 페이지 리뷰 목록 + 작성/수정/삭제 */
const ReviewList = ({
    storeId,
    completedReservation = null,
    focusReviewId = null,
    onRatingLoad,
}) => {
    const { user } = useAuthStore();
    const { message, confirm } = useMessage();

    const [reviews,     setReviews]     = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [writeForm,   setWriteForm]   = useState({ rating: 0, title: '', content: '' });
    const [submitting,  setSubmitting]  = useState(false);
    const [written,     setWritten]     = useState(false);
    const [editingId,   setEditingId]   = useState(null);
    const [editForm,    setEditForm]    = useState({ rating: 0, title: '', content: '' });
    const [editLoading, setEditLoading] = useState(false);

    const reviewRefs = useRef({});

    const notifyRating = (list) => {
        if (!onRatingLoad) return;
        const avg = list.length ? (list.reduce((s, r) => s + r.rating, 0) / list.length).toFixed(1) : null;
        onRatingLoad({ avg: avg ? Number(avg) : null, count: list.length });
    };

    useEffect(() => {
        if (!storeId) return;
        setLoading(true);
        reviewService.getReviewsByStore(storeId)
            .then(data => { const list = Array.isArray(data) ? data : []; setReviews(list); notifyRating(list); })
            .catch(() => setReviews([]))
            .finally(() => setLoading(false));
    }, [storeId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!focusReviewId || loading) return;
        const timer = setTimeout(() => {
            reviewRefs.current[focusReviewId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
        return () => clearTimeout(timer);
    }, [focusReviewId, loading]);

    const handleWriteSubmit = async () => {
        if (!writeForm.rating)                    return message.warning('별점을 선택해주세요');
        if (!writeForm.title.trim())              return message.warning('제목을 입력해주세요');
        if (writeForm.content.trim().length < 10) return message.warning('내용을 10자 이상 입력해주세요');
        setSubmitting(true);
        try {
            const created = await reviewService.createReview({
                reservationId: completedReservation.reservationId,
                rating:  writeForm.rating,
                title:   writeForm.title.trim(),
                content: writeForm.content.trim(),
            });
            const updated = [created, ...reviews];
            setReviews(updated); notifyRating(updated);
            message.success('리뷰가 등록되었습니다');
            setWriteForm({ rating: 0, title: '', content: '' });
            setWritten(true);
        } catch { message.error('리뷰 등록에 실패했습니다'); }
        finally  { setSubmitting(false); }
    };

    const startEdit = (review) => {
        setEditingId(review.id);
        setEditForm({ rating: review.rating, title: review.title || '', content: review.content });
    };
    const cancelEdit = () => { setEditingId(null); setEditForm({ rating: 0, title: '', content: '' }); };

    const submitEdit = async (reviewId) => {
        if (!editForm.rating)                    return message.warning('별점을 선택해주세요');
        if (!editForm.title.trim())              return message.warning('제목을 입력해주세요');
        if (editForm.content.trim().length < 10) return message.warning('내용을 10자 이상 입력해주세요');
        setEditLoading(true);
        try {
            await reviewService.updateReview(reviewId, {
                rating:  editForm.rating,
                title:   editForm.title.trim(),
                content: editForm.content.trim(),
            });
            const updated = reviews.map(r =>
                r.id === reviewId
                    ? { ...r, rating: editForm.rating, title: editForm.title.trim(), content: editForm.content.trim() }
                    : r
            );
            setReviews(updated); notifyRating(updated);
            message.success('리뷰가 수정되었습니다');
            cancelEdit();
        } catch { message.error('리뷰 수정에 실패했습니다'); }
        finally  { setEditLoading(false); }
    };

    const handleDelete = (reviewId) => {
        confirm({
            title: '리뷰 삭제', content: '리뷰를 삭제하시겠습니까? 삭제 후 되돌릴 수 없습니다.',
            okText: '삭제하기', cancelText: '취소', okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                try {
                    await reviewService.deleteReview(reviewId);
                    const updated = reviews.filter(r => r.id !== reviewId);
                    setReviews(updated); notifyRating(updated);
                    message.success('리뷰가 삭제되었습니다');
                } catch { message.error('리뷰 삭제에 실패했습니다'); }
            },
        });
    };

    if (loading) return <ReviewCardSkeleton count={3} />;

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
                <div style={styles.emptyWrap}>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<span style={{ color: colors.text.tertiary }}>아직 리뷰가 없습니다. 첫 번째 리뷰를 남겨보세요!</span>}
                    />
                </div>
            ) : (
                <div style={styles.list}>
                    {reviews.map(review => {
                        const isOwner   = user && user.email === review.memberEmail;
                        const isEditing = editingId === review.id;
                        const isFocused = focusReviewId === review.id;

                        if (isEditing) {
                            return (
                                <div key={review.id} ref={el => { reviewRefs.current[review.id] = el; }}>
                                    <ReviewForm
                                        userName={review.memberName}
                                        form={editForm} setForm={setEditForm}
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
    emptyWrap: { padding: '40px 0 20px' },
    list: { display: 'flex', flexDirection: 'column', gap: 12 },
    card: {
        padding: '20px 16px 0 16px',
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
        marginTop: 16, marginLeft: -16, marginRight: -16,
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
