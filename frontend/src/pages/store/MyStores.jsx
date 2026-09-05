import React, { useState, useCallback } from 'react';
import { Typography, Empty, Modal, Flex } from 'antd';
import { StarFilled, EditOutlined, DeleteOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { PageContainer, Card, StoreCardSkeleton, Badge, ModalLoading } from '../../components/common';
import { useMyStores } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getThumbnailUrl } from '../../utils';
import { colors, radius, fontWeight, fontSize } from '../../styles/tokens';
import storeService from '../../services/storeService';

const { Title, Text } = Typography;

// ─── 영업 종료 확인 모달 ──────────────────────────────────────────────────────
const DeleteStoreModal = ({ open, storeId, storeName, onConfirm, onCancel }) => {
    const [loadingReadiness, setLoadingReadiness] = useState(false);
    const [readiness, setReadiness] = useState(null);
    const [readinessError, setReadinessError] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // 모달 열릴 때마다 예약·광고·환불·대사·웹훅을 한 번에 확인
    React.useEffect(() => {
        if (!open || !storeId) return;
        setLoadingReadiness(true);
        setReadiness(null);
        setReadinessError(false);
        storeService.getClosureReadiness(storeId)
            .then(setReadiness)
            .catch(() => setReadinessError(true))
            .finally(() => setLoadingReadiness(false));
    }, [open, storeId]);

    const handleOk = async () => {
        setSubmitting(true);
        try {
            await onConfirm();
        } finally {
            setSubmitting(false);
        }
    };

    const canDelete = !loadingReadiness && !readinessError && readiness?.canClose === true;
    const blockerCount = readiness
        ? readiness.unresolvedReservations
            + readiness.activeAdvertisements
            + readiness.unresolvedRefunds
            + readiness.openPaymentIssues
            + readiness.unfinishedWebhooks
        : 0;

    return (
        <Modal
            title={
                <Flex align="center" gap={8}>
                    <ExclamationCircleFilled style={{ color: colors.warning.main, fontSize: 18 }} />
                    <span>가게 영업 종료</span>
                </Flex>
            }
            open={open}
            onOk={handleOk}
            onCancel={onCancel}
            /* maskClosable={false}: 가게 영업 종료 — 명시적으로 버튼을 눌러야 닫히게 한다.
               컨벤션 — 입력 폼/파괴적 확인 모달은 바깥 클릭으로 안 닫히고, 읽기 전용 모달
               (상세보기/QR/예약상세)은 AntD 기본값(true)대로 아무데나 눌러도 닫힌다. */
            maskClosable={false}
            okText="영업 종료"
            cancelText="취소"
            okButtonProps={{
                danger: true,
                disabled: !canDelete,
                loading: submitting,
            }}
            centered
            width={440}
        >
            <div style={{ padding: '4px 0 8px' }}>
                {/* 가게명 */}
                <Text style={{ fontSize: fontSize.md, color: colors.text.primary }}>
                    <Text strong>"{storeName}"</Text>의 영업을 종료하려고 합니다.
                </Text>

                {/* 예약 수 로딩 */}
                {loadingReadiness ? (
                    <ModalLoading text="예약·결제 상태 확인 중..." minHeight="120px" />
                ) : readinessError ? (
                    <div style={{ marginTop: 16, background: colors.error.light, borderRadius: radius.md, padding: '12px 14px' }}>
                        <Text strong style={{ fontSize: fontSize.sm, color: colors.error.main, display: 'block', marginBottom: 2 }}>
                            영업 종료 준비 상태를 확인하지 못했습니다
                        </Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                            잠시 후 다시 시도해주세요. 확인 전에는 영업을 종료할 수 없습니다.
                        </Text>
                    </div>
                ) : readiness && (
                    <div style={{ marginTop: 16 }}>
                        {readiness.canClose && (
                            <div style={{ background: colors.success.light, borderRadius: radius.md, padding: '12px 14px' }}>
                                <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block', marginBottom: 2 }}>
                                    미결 운영 항목이 없습니다
                                </Text>
                                <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>거래 원장을 보존한 채 공개 영업을 종료할 수 있습니다.</Text>
                            </div>
                        )}

                        {!readiness.canClose && (
                            <div style={{ background: colors.warning.light, borderRadius: radius.md, padding: '12px 14px' }}>
                                <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block', marginBottom: 2 }}>
                                    먼저 처리해야 할 항목이 {blockerCount}건 있습니다
                                </Text>
                                <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                                    예약 {readiness.unresolvedReservations} · 광고 {readiness.activeAdvertisements} · 환불 {readiness.unresolvedRefunds} · 결제 확인 {readiness.openPaymentIssues} · 웹훅 {readiness.unfinishedWebhooks}
                                </Text>
                            </div>
                        )}
                    </div>
                )}

                {/* 공통 경고 */}
                <div style={{
                    marginTop: 16,
                    padding: '10px 14px',
                    background: colors.gray[50],
                    borderRadius: radius.md,
                    border: `1px solid ${colors.border.default}`,
                }}>
                    <Text type="secondary" style={{ fontSize: fontSize.sm }}>
                        영업 종료 후 가게는 공개 목록에서 사라지고 이미지는 삭제 대기열로 이동합니다. 예약·결제·환불·리뷰 기록은 대사와 분쟁 대응을 위해 비공개로 보존합니다.
                    </Text>
                </div>
            </div>
        </Modal>
    );
};

// ─── MyStores 메인 ──────────────────────────────────────────────────────────
const MyStores = () => {
    const navigate = useNavigate();
    const { stores, loading, deleteStore } = useMyStores();
    useDocumentTitle('내 가게');
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [targetStore, setTargetStore] = useState(null); // { id, name }

    const handleDeleteClick = useCallback((e, store) => {
        e.stopPropagation();
        setTargetStore({ id: store.id, name: store.name });
        setDeleteModalOpen(true);
    }, []);

    const handleDeleteConfirm = useCallback(async () => {
        try {
            await deleteStore(targetStore.id);
            setDeleteModalOpen(false);
            setTargetStore(null);
        } catch {
            // 에러 메시지는 useMyStores onError에서 자동 표시
        }
    }, [deleteStore, targetStore]);

    const handleDeleteCancel = useCallback(() => {
        setDeleteModalOpen(false);
        setTargetStore(null);
    }, []);

    return (
        <PageContainer size="xl" paddingTop="40px">
            {/* 헤더 */}
            <div style={{ marginBottom: '40px' }}>
                <Title level={2} style={{ margin: '0 0 8px 0', fontWeight: fontWeight.extrabold }}>
                    내 가게 관리
                </Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                    등록된 가게를 수정하거나 관리할 수 있습니다.
                </Text>
            </div>

            {/* 카드 영역 — 2026-07 수정: 고정 4열 그리드(rsv-mystore-grid)로 통일(위 GRID_STYLE 참고).
                Card.Add도 같은 시점에 borderRadius를 0(각짐)으로 맞춰서 실제 가게 카드와 모서리가 일치한다. */}
            {loading ? (
                <div className="rsv-mystore-grid">
                    <StoreCardSkeleton count={4} withActions />
                </div>
            ) : stores.length > 0 ? (
                <div className="rsv-mystore-grid">
                    {stores.map(store => (
                        <div key={store.id}>
                            <Card
                                hoverable
                                actions={[
                                    /* onClick을 아이콘이 아니라 li 전체를 채우는 wrapper에 건다 — 예전에는
                                       아이콘 자체에만 onClick이 있어 아이콘 픽셀만 눌러야 동작하고 주위 네모
                                       여백은 안 눌렸다. 각 li를 꿉 채우는 클릭 영역으로 감싸 네모 전체가 눌리게 한다. */
                                    <button
                                        key="edit"
                                        type="button"
                                        aria-label={`${store.name} 수정`}
                                        onClick={(e) => { e.stopPropagation(); navigate(`/store/${store.id}/edit`); }}
                                        className="reserve-card-action"
                                        style={styles.cardAction}
                                    >
                                        <EditOutlined style={{ fontSize: '18px' }} />
                                    </button>,
                                    <button
                                        key="delete"
                                        type="button"
                                        aria-label={`${store.name} 삭제`}
                                        onClick={(e) => handleDeleteClick(e, store)}
                                        className="reserve-card-action"
                                        style={styles.cardAction}
                                    >
                                        <DeleteOutlined style={{ fontSize: '18px', color: colors.error.main }} />
                                    </button>,
                                ]}
                            >
                                <Link
                                    to={`/store/${store.id}`}
                                    className="reserve-card-link"
                                    aria-label={`${store.name} 상세 보기`}
                                >
                                    <Card.Cover src={getThumbnailUrl(store.mainImageUrl)} alt={store.name} />
                                    <div style={{ padding: '16px 16px 20px 16px' }}>
                                        <Badge variant="category" style={{ marginBottom: 6 }}>
                                            {store.category || '기타'}
                                        </Badge>
                                        <Title level={5} style={{ margin: '0 0 2px 0', fontSize: fontSize.xl }}>
                                            {store.name}
                                        </Title>
                                        <Flex align="center" gap={4}>
                                            <StarFilled style={{ color: '#fadb14', fontSize: '14px' }} />
                                            <Text strong style={{ fontSize: fontSize.sm }}>
                                                {store.rating?.toFixed(1) || '0.0'}
                                            </Text>
                                        </Flex>
                                    </div>
                                </Link>
                            </Card>
                        </div>
                    ))}
                    <div>
                        <Card.Add onClick={() => navigate('/store/register')} minHeight="350px">
                            새 가게 등록하기
                        </Card.Add>
                    </div>
                </div>
            ) : (
                <Empty
                    description="등록된 가게가 없습니다."
                    style={{ marginTop: '100px' }}
                />
            )}

            {/* 삭제 모달 */}
            <DeleteStoreModal
                open={deleteModalOpen}
                storeId={targetStore?.id}
                storeName={targetStore?.name}
                onConfirm={handleDeleteConfirm}
                onCancel={handleDeleteCancel}
            />
        </PageContainer>
    );
};

const styles = {
    // 가게 카드 하단 액션(수정/삭제) — AntD Card actions의 <li> 안을 꿉 채워
    // 아이콘뿐 아니라 네모 영역 전체가 클릭되게 한다. 세로 padding으로 클릭 높이도 확보.
    cardAction: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        padding: '4px 0',
        cursor: 'pointer',
        // <div>에서 네이티브 <button>으로 바꾸면서(키보드·스크린리더 지원)
        // 버튼 기본 외형을 지워 예전 모양을 그대로 유지한다.
        background: 'none',
        border: 'none',
        color: 'inherit',
        font: 'inherit',
    },
};

export default MyStores;
