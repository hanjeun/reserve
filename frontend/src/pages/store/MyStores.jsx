import React, { useState } from 'react';
import { Typography, Tag, Empty, Modal, Flex } from 'antd';
import { StarFilled, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PageContainer, Card, StoreCardSkeleton } from '../../components/common';
import { useMyStores, useMessage } from '../../hooks';
import { getThumbnailUrl } from '../../utils';
import { colors, radius, fontWeight, fontSize } from '../../styles/tokens';

const { Title, Text } = Typography;

const MyStores = () => {
    const navigate = useNavigate();
    const { message } = useMessage();
    const { stores, loading, deleteStore } = useMyStores();
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [targetStoreId, setTargetStoreId] = useState(null);

    const handleDeleteClick = (e, storeId) => {
        e.stopPropagation();
        setTargetStoreId(storeId);
        setDeleteModalOpen(true);
    };

    const handleDeleteConfirm = async () => {
        setDeleteModalOpen(false);
        const result = await deleteStore(targetStoreId);
        if (result.success) {
            message.success('가게가 삭제되었습니다.');
        } else {
            message.error(result.error);
        }
        setTargetStoreId(null);
    };

    const handleDeleteCancel = () => {
        setDeleteModalOpen(false);
        setTargetStoreId(null);
    };

    return (
        <PageContainer size="xl" paddingTop="40px">
            {/* 헤더 — 항상 즉시 표시 */}
            <div style={{ marginBottom: '40px' }}>
                <Title level={2} style={{ margin: '0 0 8px 0', fontWeight: fontWeight.extrabold }}>
                    내 가게 관리
                </Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                    등록된 가게를 수정하거나 관리할 수 있습니다.
                </Text>
            </div>

            {/* 카드 영역 — 로딩 중엔 스켈레톤 */}
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
                                        onClick={(e) => handleDeleteClick(e, store.id)}
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

            {/* 삭제 확인 모달 */}
            <Modal
                title="가게 삭제"
                open={deleteModalOpen}
                onOk={handleDeleteConfirm}
                onCancel={handleDeleteCancel}
                okText="삭제하기"
                cancelText="닫기"
                okButtonProps={{ danger: true }}
                centered
            >
                <p style={{ margin: '8px 0 4px' }}>
                    가게를 삭제하시겠습니까? 삭제 후 되돌릴 수 없습니다.
                </p>
            </Modal>
        </PageContainer>
    );
};

export default MyStores;
