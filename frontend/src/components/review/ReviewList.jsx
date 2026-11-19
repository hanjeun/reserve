import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Rate } from 'antd';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { DataState, ReviewCardSkeleton } from '../common';
import AnimatedContent from '../common/AnimatedContent';
import { StarFilled } from '../common/icons';
import LoadingStatus from '../common/LoadingStatus';
import UnderlinedTextButton from '../common/UnderlinedTextButton';
import ReviewEditor from './ReviewEditor';
import ReviewCard from './ReviewCard';
import { ReviewPhotoOverview } from './ReviewPhotos';
import reviewService from '../../services/reviewService';
import { pathFromLocation, saveRedirect } from '../../utils/redirect';
import { handleApiError } from '../../utils/errorHandler';
import { useMessage } from '../../hooks';
import useReducedMotion from '../../hooks/useReducedMotion';
import { reviewKeys } from '../../hooks/queryKeys';
import { useFeedProfile } from '../../hooks/feedQueries';
import { invalidateReviewData } from '../../hooks/invalidateAfterWrite';
import { currentSession, isCurrentSession } from '../../api/sessionScope';
import useAuthStore from '../../store/useAuthStore';
import { httpStatusOf } from '../../utils/listErrorMessage';
import { isReadAccessDenied } from '../../hooks/liveUpdateQueries';

const ServiceReportForm = lazy(() => import('../report/ServiceReportForm'));
const NO_REVIEWS = [];
const EXIT_MS = 200;

const ReviewList = ({
    storeId,
    completedReservation = null,
    completedReservationError = null,
    completedReservationRetrying = false,
    onCompletedReservationRetry,
    autoOpenWrite = false,
    focusReviewId = null,
    reviewNavigationKey,
    onRatingLoad,
    ratingSummary,
    isPC = false,
}) => {
    const user = useAuthStore(state => state.user);
    const navigate = useNavigate();
    const location = useLocation();
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();
    const reducedMotion = useReducedMotion();
    const [writtenReservation, setWrittenReservation] = useState(null);
    const [dismissed, setDismissed] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [createdId, setCreatedId] = useState(null);
    const [exits, setExits] = useState([]);
    const [report, setReport] = useState(null);
    const editor = useRef(null);
    const unavailable = useRef(null);
    const cards = useRef(new Map());
    const exitTimers = useRef(new Map());
    const scrolled = useRef(null);
    const restoreEditFocus = useRef(null);

    const targetReviewId = focusReviewId ?? (autoOpenWrite ? completedReservation?.reviewId : null);
    const storeQueryKey = reviewKeys.byStore(storeId);
    const { data: loadedReviews, isLoading: loading, isError, error, isFetching, refetch,
        hasNextPage, isFetchNextPageError, fetchNextPage } = useInfiniteQuery({
        queryKey: targetReviewId == null ? storeQueryKey : [...storeQueryKey, 'focused', targetReviewId],
        queryFn: async ({ signal, pageParam }) => {
            const data = await reviewService.getReviewsByStore(storeId, signal, {
                limit: 10, ...(pageParam ?? { focusId: targetReviewId }),
            });
            return Array.isArray(data) ? { content: data, next: null } : data ?? { content: NO_REVIEWS, next: null };
        },
        initialPageParam: null,
        getNextPageParam: page => page.next ?? undefined,
        enabled: !!storeId,
    });
    const reviews = useMemo(() => {
        if (!loadedReviews) return NO_REVIEWS;
        const distinct = new Map();
        for (const page of loadedReviews.pages) {
            for (const review of page.content) if (!distinct.has(review.id)) distinct.set(review.id, review);
        }
        return [...distinct.values()];
    }, [loadedReviews]);

    const reviewCount = ratingSummary?.reviewCount || reviews.length;
    const rating = ratingSummary?.reviewCount ? ratingSummary.rating
        : reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : null;
    const averageRating = rating?.toFixed(1);
    useEffect(() => {
        onRatingLoad?.({ avg: averageRating ? Number(averageRating) : null, count: reviewCount });
    }, [averageRating, reviewCount, onRatingLoad]);
    useEffect(() => {
        const timers = exitTimers.current;
        return () => { timers.forEach(clearTimeout); timers.clear(); };
    }, []);

    const reservationId = completedReservation?.reservationId;
    const draftKey = [user?.id, reviewNavigationKey, reservationId].join(':');
    const canWrite = Boolean(reservationId && !completedReservation.reviewId && !completedReservation.reviewWritten && writtenReservation !== draftKey);
    const showEditor = canWrite && dismissed !== draftKey;
    const { data: profile, error: profileError, isLoading: profileLoading } = useFeedProfile(Boolean(user?.id && (showEditor || editingId != null)));
    const reviewProfile = !isReadAccessDenied(profileError) && ['PUBLIC', 'MEMBERS'].includes(profile?.visibility) ? profile : null;
    const unavailableWrite = autoOpenWrite && !completedReservationRetrying && !completedReservationError
        && (!completedReservation || completedReservation.reviewWritten) && targetReviewId == null && writtenReservation !== draftKey;
    const targetKey = [reviewNavigationKey, targetReviewId ?? reservationId, targetReviewId != null ? 'review' : 'write'].join(':');
    useEffect(() => {
        if (loading || isError || scrolled.current === targetKey) return undefined;
        const target = targetReviewId != null ? cards.current.get(targetReviewId)
            : autoOpenWrite && (editor.current ?? unavailable.current);
        if (!target) return undefined;
        const view = target.ownerDocument.defaultView;
        const frame = view.requestAnimationFrame(() => {
            if (!target.isConnected) return;
            scrolled.current = targetKey;
            target.focus({ preventScroll: true });
            target.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
        });
        return () => view.cancelAnimationFrame(frame);
    }, [autoOpenWrite, isError, loading, profileLoading, reducedMotion, reviews, showEditor, targetKey, targetReviewId, unavailableWrite]);
    useEffect(() => {
        if (profileLoading) return;
        if (editingId != null) cards.current.get(editingId)?.querySelector('[aria-label="리뷰 제목"]')?.focus({ preventScroll: true });
        else if (restoreEditFocus.current != null) {
            cards.current.get(restoreEditFocus.current)?.querySelector('.reserve-feed-more')?.focus({ preventScroll: true });
            restoreEditFocus.current = null;
        }
    }, [editingId, profileLoading]);

    const updateReviews = async (targetStore, epoch, update) => {
        const matches = { queryKey: reviewKeys.byStore(targetStore),
            predicate: query => Array.isArray(query.state.data?.pages) };
        if (!isCurrentSession(epoch)) return false;
        await queryClient.cancelQueries(matches);
        if (!isCurrentSession(epoch)) return false;
        queryClient.setQueriesData(matches, current => current && ({
            ...current, pages: current.pages.map((page, index) => ({ ...page, content: update(page.content, index) })),
        }));
        return true;
    };

    const createMutation = useMutation({
        mutationFn: ({ payload, files }) => files.length ? reviewService.createReview(payload, files) : reviewService.createReview(payload),
        onSuccess: async (created, { epoch, key, targetStore }) => {
            if (!await updateReviews(targetStore, epoch, (old, index) => index === 0
                ? [created, ...old.filter(row => row.id !== created.id)] : old)) return;
            setCreatedId(created.id);
            setWrittenReservation(key);
            void invalidateReviewData(queryClient);
            message.success('리뷰가 등록됐어요.');
        },
        onError: (failure, { epoch, key, targetStore }) => {
            if (!isCurrentSession(epoch)) return;
            if (httpStatusOf(failure) === 409) {
                setWrittenReservation(key);
                void invalidateReviewData(queryClient);
                void queryClient.invalidateQueries({ queryKey: reviewKeys.byStore(targetStore) });
            }
            handleApiError(failure, message);
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload, files, removed }) => reviewService.updateReview(id, payload, files, removed),
        onSuccess: async (saved, { id, epoch, targetStore }) => {
            if (!await updateReviews(targetStore, epoch, (old = []) => old.map(row => row.id === id ? saved : row))) return;
            void invalidateReviewData(queryClient);
            message.success('리뷰가 수정됐어요.');
            setEditingId(current => current === id ? null : current);
        },
        onError: (failure, { epoch }) => { if (isCurrentSession(epoch)) handleApiError(failure, message); },
    });

    const deleteMutation = useMutation({
        mutationFn: ({ id }) => reviewService.deleteReview(id),
        onSuccess: async (_, { id, epoch, targetStore }) => {
            const index = reviews.findIndex(review => review.id === id);
            const height = cards.current.get(id)?.getBoundingClientRect().height;
            if (!isCurrentSession(epoch)) return;
            if (!reducedMotion && targetStore === storeId && index >= 0 && height > 0) {
                setExits(previous => [...previous, { id, index, height, storeId }]);
                exitTimers.current.set(id, setTimeout(() => {
                    setExits(previous => previous.filter(exit => exit.id !== id));
                    exitTimers.current.delete(id);
                }, EXIT_MS));
            }
            if (!await updateReviews(targetStore, epoch, (old = []) => old.filter(row => row.id !== id))) return;
            void invalidateReviewData(queryClient);
            message.success('리뷰가 삭제됐어요.');
        },
        onError: (failure, { epoch }) => { if (isCurrentSession(epoch)) handleApiError(failure, message); },
    });

    const confirmDeletion = id => {
        const { epoch } = currentSession();
        confirm({
            title: '리뷰를 삭제할까요?', content: '등록한 리뷰와 사진이 삭제돼요. 같은 예약에는 리뷰를 다시 쓸 수 없어요.',
            okText: '삭제하기', okButtonProps: { danger: true },
            onOk: () => { if (isCurrentSession(epoch)) return deleteMutation.mutateAsync({ id, epoch, targetStore: storeId }); },
        });
    };
    const requireLogin = () => {
        saveRedirect(pathFromLocation(location));
        navigate('/login', { state: { from: location } });
    };
    const updateInteractions = async (id, changes) => {
        const { epoch } = currentSession();
        await updateReviews(storeId, epoch, current => current.map(row => row.id === id
            ? { ...row, interactions: { ...row.interactions, ...changes } } : row));
    };

    if (loading) return <LoadingStatus aria-label="리뷰를 불러오는 중" aria-busy="true"><ReviewCardSkeleton count={isPC ? 4 : 3} isPC={isPC} /></LoadingStatus>;
    if (isError && (loadedReviews == null || isReadAccessDenied(error))) {
        return <DataState state="error" kind="review" subject="리뷰" error={error} onRetry={refetch} retrying={isFetching} />;
    }

    const photos = reviews.flatMap(review => review.photos ?? []).slice(0, 10);
    const rows = reviews.map(review => ({ id: review.id, review }));
    if (!reducedMotion) for (const exit of exits) {
        if (exit.storeId === storeId && !reviews.some(review => review.id === exit.id)) rows.splice(exit.index, 0, exit);
    }
    const activeReport = report && isCurrentSession(report.epoch) ? report : null;
    return (
        <div className="reserve-reviews">
            {isError && !isFetchNextPageError && <DataState compact state="error" kind="review" title="리뷰를 갱신하지 못했어요."
                error={error} onRetry={refetch} retrying={isFetching} />}
            {completedReservationError && <DataState state="error" kind="review" requestType="detail" subject="리뷰 작성 가능 예약"
                title="리뷰 작성 가능 예약을 확인하지 못했어요." error={completedReservationError} onRetry={onCompletedReservationRetry}
                retrying={completedReservationRetrying} compact />}
            {unavailableWrite && <p ref={unavailable} tabIndex={-1} className="reserve-review-scroll-target reserve-store-section-target reserve-review-muted">
                {completedReservation?.reviewWritten ? '이미 리뷰를 작성한 예약이에요.' : '이 예약의 리뷰 작성 가능 상태를 내 예약에서 확인해주세요.'}
            </p>}
            {showEditor && profileLoading && <LoadingStatus aria-label="리뷰 작성 정보를 불러오는 중" aria-busy="true" />}
            {showEditor && !profileLoading && <ReviewEditor key={draftKey} profile={reviewProfile} editorRef={editor}
                reservationDate={completedReservation?.reservationDate}
                submitting={createMutation.isPending} onCancel={() => setDismissed(draftKey)}
                onSubmit={(payload, files) => createMutation.mutate({
                    payload: { reservationId, ...payload }, files, key: draftKey, epoch: currentSession().epoch, targetStore: storeId,
                })} />}
            {reviewCount > 0 && <div className="reserve-review-summary">
                <span className="reserve-review-score">{averageRating}</span>
                <div>
                    <Rate aria-label={'평균 ' + averageRating + '점'} character={<StarFilled aria-hidden="true" />}
                        disabled allowHalf value={Number(averageRating)} className="reserve-review-stars" />
                    <div className="reserve-review-muted">리뷰 {reviewCount}개</div>
                </div>
            </div>}
            {photos.length > 0 && <ReviewPhotoOverview key={storeId} photos={photos} isPC={isPC} />}
            {rows.length === 0
                ? <DataState state="empty" kind="review" title="아직 리뷰가 없어요. 첫 번째 리뷰를 남겨보세요!" />
                : <div className="reserve-feed-list reserve-review-list">
                    {rows.map(({ id, review, height }) => {
                        if (!review) return <div key={id} aria-hidden="true" className="reserve-review-removal"
                            style={{ '--review-row-height': height + 'px' }} />;
                        const mine = Boolean(user && (review.mine ?? user.id === review.memberId));
                        const editing = mine && editingId === id;
                        const cardRef = node => { if (node) cards.current.set(id, node); else cards.current.delete(id); };
                        return <AnimatedContent key={id} className="reserve-review-list-row" motionKey={id + (editing ? ':edit' : ':read')}
                            ready={!editing || !profileLoading} animateOnMount={createdId === id}>
                            {editing ? <div className="reserve-review-edit-item">
                                {profileLoading ? <LoadingStatus aria-label="리뷰 수정 정보를 불러오는 중" aria-busy="true" />
                                    : <ReviewEditor review={review} profile={reviewProfile} editorRef={cardRef}
                                    submitting={updateMutation.isPending} onCancel={() => setEditingId(null)}
                                    onSubmit={(payload, files, removed) => updateMutation.mutate({
                                        id, payload, files, removed, epoch: currentSession().epoch, targetStore: storeId,
                                    })} />}
                            </div>
                            : <ReviewCard review={review} cardRef={cardRef} mine={mine} signedIn={Boolean(user)}
                                onEdit={id => { restoreEditFocus.current = id; setEditingId(id); }}
                                onDelete={confirmDeletion} onLogin={requireLogin}
                                onReport={id => setReport({ id, open: true, epoch: currentSession().epoch })}
                                onInteractions={updateInteractions} commentsKey={[...reviewKeys.byStore(storeId), 'comments', id]} />}
                        </AnimatedContent>;
                    })}
                </div>}
            {hasNextPage && <div className="reserve-review-load-more">
                {isFetchNextPageError && <p className="reserve-review-muted" role="status">다음 리뷰를 불러오지 못했어요.</p>}
                <UnderlinedTextButton disabled={isFetching} onClick={() => fetchNextPage()}>
                    {isFetching ? '리뷰 불러오는 중…' : '리뷰 더 보기'}
                </UnderlinedTextButton>
            </div>}
            {activeReport && <Suspense fallback={null}>
                <ServiceReportForm target={{ type: 'REVIEW', id: activeReport.id }} open={activeReport.open}
                    onClose={() => setReport(current => ({ ...current, open: false }))} afterClose={() => setReport(null)} />
            </Suspense>}
        </div>
    );
};

export default ReviewList;
