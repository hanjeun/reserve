import React, { useState, useCallback } from 'react';
import { Typography, Tag, Empty, Modal, Flex, Radio, Spin, Alert } from 'antd';
import { StarFilled, EditOutlined, DeleteOutlined, ExclamationCircleFilled, WarningFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PageContainer, Card, StoreCardSkeleton } from '../../components/common';
import { useMyStores } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getThumbnailUrl } from '../../utils';
import { colors, radius, fontWeight, fontSize } from '../../styles/tokens';
import storeService from '../../services/storeService';

const { Title, Text } = Typography;

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
                    <ExclamationCircleFilled style={{ color: colors.error.main, fontSize: 18 }} />
                    <span style={{ fontWeight: fontWeight.bold }}>가게 삭제</span>
                </Flex>
            }
            open={open}
            onOk={handleOk}
            onCancel={onCancel}
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
                    <Flex align="center" gap={8} style={{ margin: '20px 0' }}>
                        <Spin size="small" />
                        <Text type="secondary" style={{ fontSize: fontSize.sm }}>예약 현황 확인 중...</Text>
                    </Flex>
                ) : activeCount !== null && (
                    <div style={{ marginTop: 16 }}>
                        {/* 예약 없음 */}
                        {!hasActiveReservations && (
                            <Alert
                                type="success"
                                showIcon
                                message="진행 중인 예약이 없습니다"
                                description="가게를 안전하게 삭제할 수 있습니다."
                                style={{ borderRadius: radius.md }}
                            />
                        )}

                        {/* 예약 있음 → 옵션 선택 */}
                        {hasActiveReservations && (
                            <>
                                <Alert
                                    type="warning"
                                    showIcon
                                    icon={<WarningFilled />}
                                    message={`진행 중인 예약 ${activeCount}건이 있습니다`}
                                    description="삭제 방식을 선택해주세요."
                                    style={{ borderRadius: radius.md, marginBottom: 16 }}
                                />
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
                        ⚠️ 삭제 후에는 가게 정보, 리뷰, 즐겨찾기 등 모든 데이터가 영구 삭제되며 복구할 수 없습니다.
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
            {/* 헤더 */}
            <div style={{ marginBottom: '40px' }}>
                <Title level={2} style={{ margin: '0 0 8px 0', fontWeight: fontWeight.extrabold }}>
                    내 가게 관리
                </Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                    등록된 가게를 수정하거나 관리할 수 있습니다.
                </Text>
            </div>

            {/* 카드 영역 */}
            {loading ? (
                <div style={{ columns: '4 240px', columnGap: 24 }}>
                    <StoreCardSkeleton count={4} withActions />
                </div>
            ) : stores.length > 0 ? (
                <div style={{ columns: '4 240px', columnGap: 24 }}>
                    {stores.map(store => (
                        <div key={store.id} style={{ breakInside: 'avoid', marginBottom: 24 }}>
                            <Card
                                hoverable
                                actions={[
                                    <EditOutlined
                                        key="edit"
                                        onClick={(e) => { e.stopPropagation(); navigate(`/store/${store.id}/edit`); }}
                                        style={{ fontSize: '18px' }}
                                    />,
                                    <DeleteOutlined
                                        key="delete"
                                        onClick={(e) => handleDeleteClick(e, store)}
                                        style={{ fontSize: '18px', color: colors.error.main }}
                                    />,
                                ]}
                                onClick={() => navigate(`/store/${store.id}`)}
                            >
                                <Card.Cover src={getThumbnailUrl(store.mainImageUrl)} alt={store.name} />
                                <div style={{ padding: '16px 16px 20px 16px' }}>
                                    <Tag color="blue" style={{ marginBottom: '6px', borderRadius: radius.sm, fontSize: fontSize.xs }}>
                                        {store.category || '기타'}
                                    </Tag>
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
                    <div style={{ breakInside: 'avoid', marginBottom: 24 }}>
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

export default MyStores;
