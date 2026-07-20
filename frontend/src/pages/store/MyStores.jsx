import React, { useState, useCallback } from 'react';
import { Typography, Empty, Modal, Flex, Radio } from 'antd';
import { StarFilled, EditOutlined, DeleteOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PageContainer, Card, StoreCardSkeleton, Badge, ModalLoading } from '../../components/common';
import { useMyStores } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getThumbnailUrl } from '../../utils';
import { colors, radius, fontWeight, fontSize } from '../../styles/tokens';
import storeService from '../../services/storeService';

const { Title, Text } = Typography;

// 2026-07 추가 — MyFavorites/StoreList와 동일한 이유로 masonry(columns) 대신 고정 그리드로 전환.
// PC에서 항상 4열로 고정되고, 좁은 화면에서만 미디어 쿼리로 2열/1열로 줄어든다.
const GRID_STYLE = `
  .rsv-mystore-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;
  }
  @media (max-width: 900px) {
    .rsv-mystore-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 480px) {
    .rsv-mystore-grid { grid-template-columns: 1fr; }
  }
`;

// ─── 삭제 옵션 카드 스타일 ───────────────────────────────────────────────────
const optionCardStyle = (selected, isDanger) => ({
    padding: '12px 16px',
    borderRadius: radius.md,
    border: `1.5px solid ${selected
        ? (isDanger ? colors.error.main : colors.primary.main)
        : colors.border.default}`,
    background: selected
        ? (isDanger ? colors.error.light : colors.primary.light)
        : colors.background.paper,
    cursor: 'pointer',
    transition: 'all 0.15s',
});

// ─── 삭제 확인 모달 ──────────────────────────────────────────────────────────
const DeleteStoreModal = ({ open, storeId, storeName, onConfirm, onCancel }) => {
    const [loadingCount, setLoadingCount] = useState(false);
    const [activeCount, setActiveCount] = useState(null);
    const [deleteOption, setDeleteOption] = useState('safe'); // 'safe' | 'force'
    const [submitting, setSubmitting] = useState(false);

    // 모달 열릴 때마다 활성 예약 수 조회
    React.useEffect(() => {
        if (!open || !storeId) return;
        setLoadingCount(true);
        setActiveCount(null);
        setDeleteOption('safe');
        storeService.getActiveReservationsCount(storeId)
            .then(count => setActiveCount(count))
            .catch(() => setActiveCount(0))
            .finally(() => setLoadingCount(false));
    }, [open, storeId]);

    const handleOk = async () => {
        setSubmitting(true);
        try {
            await onConfirm(deleteOption === 'force');
        } finally {
            setSubmitting(false);
        }
    };

    const hasActiveReservations = activeCount > 0;
    const canDelete = !loadingCount && (!hasActiveReservations || deleteOption === 'force');

    return (
        <Modal
            title={
                <Flex align="center" gap={8}>
                    <ExclamationCircleFilled style={{ color: colors.warning.main, fontSize: 18 }} />
                    <span>가게 삭제</span>
                </Flex>
            }
            open={open}
            onOk={handleOk}
            onCancel={onCancel}
            /* maskClosable={false}: 가게 삭제 — 되돌릴 수 없는 파괴적 액션이라 명시적으로 버튼을 눌러야 닫히게 한다.
               컨벤션 — 입력 폼/파괴적 확인 모달은 바깥 클릭으로 안 닫히고, 읽기 전용 모달
               (상세보기/QR/예약상세)은 AntD 기본값(true)대로 아무데나 눌러도 닫힌다. */
            maskClosable={false}
            okText="삭제하기"
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
                    <Text strong>"{storeName}"</Text>을(를) 삭제하려고 합니다.
                </Text>

                {/* 예약 수 로딩 */}
                {loadingCount ? (
                    <ModalLoading text="예약 현황 확인 중..." minHeight="120px" />
                ) : activeCount !== null && (
                    <div style={{ marginTop: 16 }}>
                        {/* 예약 없음 */}
                        {!hasActiveReservations && (
                            <div style={{ background: colors.success.light, borderRadius: radius.md, padding: '12px 14px' }}>
                                <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block', marginBottom: 2 }}>
                                    진행 중인 예약이 없습니다
                                </Text>
                                <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>가게를 안전하게 삭제할 수 있습니다.</Text>
                            </div>
                        )}

                        {/* 예약 있음 → 옵션 선택 */}
                        {hasActiveReservations && (
                            <>
                                <div style={{ background: colors.warning.light, borderRadius: radius.md, padding: '12px 14px', marginBottom: 16 }}>
                                    <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block', marginBottom: 2 }}>
                                        진행 중인 예약 {activeCount}건이 있습니다
                                    </Text>
                                    <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>삭제 방식을 선택해주세요.</Text>
                                </div>
                                <Radio.Group
                                    value={deleteOption}
                                    onChange={e => setDeleteOption(e.target.value)}
                                    style={{ width: '100%' }}
                                >
                                    <Flex vertical gap={10}>
                                        <div style={optionCardStyle(deleteOption === 'safe', false)}>
                                            <Radio value="safe">
                                                <div>
                                                    <Text strong style={{ fontSize: fontSize.md }}>
                                                        삭제 안 함
                                                    </Text>
                                                    <br />
                                                    <Text type="secondary" style={{ fontSize: fontSize.sm }}>
                                                        진행 중인 예약을 먼저 완료하거나 거절한 후 삭제할 수 있습니다.
                                                    </Text>
                                                </div>
                                            </Radio>
                                        </div>
                                        <div style={optionCardStyle(deleteOption === 'force', true)}>
                                            <Radio value="force">
                                                <div>
                                                    <Text strong style={{ fontSize: fontSize.md, color: colors.error.main }}>
                                                        예약 포함 강제 삭제
                                                    </Text>
                                                    <br />
                                                    <Text type="secondary" style={{ fontSize: fontSize.sm }}>
                                                        진행 중인 예약 {activeCount}건이 모두 취소되며 되돌릴 수 없습니다.
                                                    </Text>
                                                </div>
                                            </Radio>
                                        </div>
                                    </Flex>
                                </Radio.Group>
                            </>
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
                        삭제 후에는 가게 정보, 리뷰, 즐겨찾기 등 모든 데이터가 영구 삭제되며 복구할 수 없습니다.
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

    const handleDeleteConfirm = useCallback(async (force) => {
        try {
            await deleteStore(targetStore.id, force);
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
            <style>{GRID_STYLE}</style>
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
                                    <div
                                        key="edit"
                                        onClick={(e) => { e.stopPropagation(); navigate(`/store/${store.id}/edit`); }}
                                        style={styles.cardAction}
                                    >
                                        <EditOutlined style={{ fontSize: '18px' }} />
                                    </div>,
                                    <div
                                        key="delete"
                                        onClick={(e) => handleDeleteClick(e, store)}
                                        style={styles.cardAction}
                                    >
                                        <DeleteOutlined style={{ fontSize: '18px', color: colors.error.main }} />
                                    </div>,
                                ]}
                                onClick={() => navigate(`/store/${store.id}`)}
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
    },
};

export default MyStores;
