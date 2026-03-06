import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Form, Rate, Typography, Spin } from 'antd';
import { StarOutlined } from '@ant-design/icons';
import { PageContainer, Button, FormInput, FormTextArea } from '../../components/common';
import reviewService from '../../services/reviewService';
import { reservationService } from '../../services';
import { handleApiError } from '../../utils/errorHandler';
import { useMessage } from '../../hooks';
import { colors, fontSize, fontWeight, radius, shadows } from '../../styles/tokens';

const { Title, Text } = Typography;

/** 별점에 따른 안내 문구 */
const RATING_LABELS = {
    1: '별로였어요',
    2: '아쉬웠어요',
    3: '괜찮았어요',
    4: '좋았어요',
    5: '최고였어요!',
};

/**
 * 리뷰 작성 페이지
 *
 * - canWriteReview API로 작성 가능 여부 사전 확인
 * - 작성 완료/취소 시 해당 가게 상세 페이지로 이동
 *
 * @route /write-review/:reservationId
 */
const WriteReview = () => {
    const { reservationId } = useParams();
    const navigate = useNavigate();
    const { message } = useMessage();
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [checking, setChecking] = useState(true);
    const [canWrite, setCanWrite] = useState(false);
    const [storeId, setStoreId] = useState(null);
    const [storeName, setStoreName] = useState('');
    const [hoveredRating, setHoveredRating] = useState(0);
    const [selectedRating, setSelectedRating] = useState(0);

    /** 리뷰 작성 가능 여부 + 예약 정보(storeId) 확인 */
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            try {
                // 병렬 요청
                const [canWriteResult, reservation] = await Promise.all([
                    reviewService.canWriteReview(reservationId),
                    reservationService.getReservation(reservationId),
                ]);

                if (cancelled) return;

                if (!canWriteResult?.canWrite) {
                    // 이미 리뷰 있으면 가게 상세로 이동
                    const sid = reservation?.storeId;
                    navigate(sid ? `/store/${sid}` : '/my-reservations', {
                        replace: true,
                        state: { warnMsg: '이미 작성한 리뷰이거나 작성 조건을 충족하지 않습니다.' },
                    });
                    return;
                }

                setStoreId(reservation?.storeId ?? null);
                setStoreName(reservation?.storeName ?? '');
                setCanWrite(true);
            } catch (err) {
                if (cancelled) return;
                handleApiError(err, message, '리뷰 작성 가능 여부를 확인하지 못했습니다');
                navigate('/my-reservations', { replace: true });
            } finally {
                if (!cancelled) setChecking(false);
            }
        };

        init();
        return () => { cancelled = true; };
    }, [reservationId]); // eslint-disable-line react-hooks/exhaustive-deps

    /** 취소 → 가게 상세로 */
    const handleCancel = () => {
        if (storeId) navigate(`/store/${storeId}`);
        else navigate('/my-reservations');
    };

    const handleSubmit = async (values) => {
        setSubmitting(true);
        try {
            await reviewService.createReview({
                reservationId: Number(reservationId),
                rating:        values.rating,
                title:         values.title,
                content:       values.content,
            });
            message.success('리뷰가 등록되었습니다 🎉');
            // 작성 완료 후 가게 상세로 이동
            if (storeId) navigate(`/store/${storeId}`);
            else navigate('/my-reservations');
        } catch (err) {
            handleApiError(err, message, '리뷰 등록에 실패했습니다');
        } finally {
            setSubmitting(false);
        }
    };

    if (checking) {
        return (
            <div style={{ textAlign: 'center', padding: '120px 0' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!canWrite) return null;

    const displayRating = hoveredRating || selectedRating;

    return (
        <PageContainer size="sm" paddingTop="48px">
            <div style={styles.card}>

                {/* 헤더 */}
                <div style={styles.cardHeader}>
                    <div style={styles.iconWrap}>
                        <StarOutlined style={{ fontSize: 22, color: colors.warning.main }} />
                    </div>
                    <Title level={2} style={styles.title}>리뷰 작성</Title>
                    {storeName && (
                        <Text style={styles.storeName}>{storeName}</Text>
                    )}
                    <Text style={styles.subtitle}>방문 경험을 솔직하게 공유해주세요</Text>
                </div>

                <div style={styles.divider} />

                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    requiredMark={false}
                >
                    {/* 별점 */}
                    <Form.Item
                        name="rating"
                        rules={[{ required: true, message: '별점을 선택해주세요' }]}
                    >
                        <div style={styles.ratingSection}>
                            <Rate
                                style={{ fontSize: 40, color: colors.warning.main, gap: 4 }}
                                allowClear={false}
                                onChange={(val) => {
                                    setSelectedRating(val);
                                    form.setFieldValue('rating', val);
                                }}
                                onHoverChange={setHoveredRating}
                            />
                            <div style={styles.ratingLabel}>
                                {displayRating > 0
                                    ? <Text style={styles.ratingLabelText}>{RATING_LABELS[displayRating]}</Text>
                                    : <Text style={styles.ratingPlaceholder}>별을 눌러 평점을 남겨보세요</Text>
                                }
                            </div>
                        </div>
                    </Form.Item>

                    {/* 제목 */}
                    <Form.Item
                        label={<span style={styles.label}>제목</span>}
                        name="title"
                        rules={[
                            { required: true, message: '제목을 입력해주세요' },
                            { max: 100, message: '100자 이내로 입력해주세요' },
                        ]}
                    >
                        <FormInput placeholder="한 줄로 경험을 표현해보세요" />
                    </Form.Item>

                    {/* 내용 */}
                    <Form.Item
                        label={<span style={styles.label}>리뷰 내용</span>}
                        name="content"
                        rules={[
                            { required: true, message: '리뷰 내용을 입력해주세요' },
                            { min: 10, message: '10자 이상 입력해주세요' },
                            { max: 1000, message: '1000자 이내로 입력해주세요' },
                        ]}
                    >
                        <FormTextArea
                            rows={5}
                            placeholder="음식 맛, 서비스, 분위기 등 솔직한 경험을 공유해주세요 (10자 이상)"
                            showCount
                            maxLength={1000}
                        />
                    </Form.Item>

                    <div style={styles.actions}>
                        <Button
                            variant="secondary"
                            block
                            onClick={handleCancel}
                            disabled={submitting}
                        >
                            취소
                        </Button>
                        <Button
                            variant="primary"
                            htmlType="submit"
                            block
                            loading={submitting}
                        >
                            {submitting ? '등록 중...' : '리뷰 등록'}
                        </Button>
                    </div>
                </Form>
            </div>
        </PageContainer>
    );
};

const styles = {
    card: {
        backgroundColor: colors.background.paper,
        borderRadius: radius['3xl'],
        boxShadow: shadows.cardHover,
        border: `1px solid ${colors.border.light}`,
        padding: '40px 36px',
    },
    cardHeader: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 6,
        marginBottom: 0,
    },
    iconWrap: {
        width: 52,
        height: 52,
        borderRadius: '50%',
        backgroundColor: colors.warning.light,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    title: {
        fontSize: fontSize['4xl'],
        fontWeight: fontWeight.extrabold,
        margin: 0,
        color: colors.text.primary,
    },
    storeName: {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
        color: colors.primary.main,
    },
    subtitle: {
        display: 'block',
        color: colors.text.tertiary,
        fontSize: fontSize.md,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border.light,
        margin: '24px 0',
    },
    ratingSection: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '16px 0 8px',
    },
    ratingLabel: {
        minHeight: 24,
    },
    ratingLabelText: {
        fontSize: fontSize.lg,
        fontWeight: fontWeight.semibold,
        color: colors.warning.main,
    },
    ratingPlaceholder: {
        fontSize: fontSize.md,
        color: colors.text.tertiary,
    },
    label: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.semibold,
        color: colors.text.primary,
    },
    actions: {
        display: 'flex',
        gap: 12,
        marginTop: 8,
    },
};

export default WriteReview;
