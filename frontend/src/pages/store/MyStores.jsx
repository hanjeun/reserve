import React, { useState, useCallback } from 'react';
import { Typography, Modal, Flex } from 'antd';
import { EditOutlined, DeleteOutlined, ExclamationCircleFilled, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageContainer, Button, Card, DataState, StoreCardSkeleton, ModalLoading } from '../../components/common';
import { useMyStores } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useViewModeParam from '../../hooks/useViewModeParam';
import { colors, radius, fontWeight, fontSize } from '../../styles/tokens';
import storeService from '../../services/storeService';
import { canCloseStore } from '../../utils/lifecycleReadiness';
import StoreListingToolbar from '../../components/store/StoreListingToolbar';
import StoreListRowSkeleton from '../../components/store/StoreListRowSkeleton';
import StoreCard from '../../components/store/StoreCard';
import StoreListRow from '../../components/store/StoreListRow';
import { OWNER_STORE_SORT_OPTIONS } from '../../constants';
import { filterAndSortOwnedStores } from './ownedStoreFilters';

const { Title, Text } = Typography;
const OWNER_SORT_OPTIONS = OWNER_STORE_SORT_OPTIONS;

const managedActions = (store, onEdit, onDelete, inRow = false) => [
    <button key="edit" type="button" aria-label={`${store.name} 수정`}
        onClick={event => { event.stopPropagation(); onEdit(store); }}
        className={'reserve-card-action' + (inRow ? ' reserve-mystore-list-action' : '')} style={styles.cardAction}>
        <EditOutlined style={{ fontSize: '18px' }} />
    </button>,
    <button key="delete" type="button" aria-label={`${store.name} 삭제`}
        onClick={event => onDelete(event, store)}
        className={'reserve-card-action' + (inRow ? ' reserve-mystore-list-action' : '')} style={styles.cardAction}>
        <DeleteOutlined style={{ fontSize: '18px', color: colors.error.main }} />
    </button>,
];

// ─── 영업 종료 확인 모달 ──────────────────────────────────────────────────────
export const DeleteStoreModal = ({ open, storeId, storeName, onConfirm, onCancel }) => {
    const [loadingReadiness, setLoadingReadiness] = useState(Boolean(open && storeId));
    const [readiness, setReadiness] = useState(null);
    const [readinessError, setReadinessError] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [observedTarget, setObservedTarget] = useState({ open, storeId });
    if (observedTarget.open !== open || observedTarget.storeId !== storeId) {
        setObservedTarget({ open, storeId });
        setLoadingReadiness(Boolean(open && storeId));
        setReadiness(null);
        setReadinessError(false);
    }

    // 모달 열릴 때마다 예약·광고·환불·대사·웹훅을 한 번에 확인
    React.useEffect(() => {
        if (!open || !storeId) return;
        let active = true;
        storeService.getClosureReadiness(storeId)
            .then(value => {
                if (!active) return;
                setReadiness(value);
                setReadinessError(typeof value?.canClose !== 'boolean');
            })
            .catch(() => { if (active) setReadinessError(true); })
            .finally(() => { if (active) setLoadingReadiness(false); });
        return () => { active = false; };
    }, [open, storeId]);

    const handleOk = async () => {
        if (!canDelete || submitting) return;
        setSubmitting(true);
        try {
            await onConfirm();
        } finally {
            setSubmitting(false);
        }
    };

    // 합계는 설명용이며 허가 판정에는 쓰지 않는다. 누락된 서버 필드를 0건 허가로 해석하지 않는다.
    const blockerCount = readiness
        ? (readiness.unresolvedReservations ?? 0)
            + (readiness.activeAdvertisements ?? 0)
            + (readiness.unresolvedRefunds ?? 0)
            + (readiness.openPaymentIssues ?? 0)
            + (readiness.unfinishedWebhooks ?? 0)
        : 0;
    const canClose = canCloseStore(readiness);
    const readinessUnavailable = readinessError || (readiness && typeof readiness.canClose !== 'boolean');
    const canDelete = !loadingReadiness && !readinessUnavailable && canClose;

    // 영업 종료 준비 상태 영역 — 확인 중 / 확인 실패 / 결과 중 하나.
    let readinessContent = null;
    if (loadingReadiness) {
        readinessContent = (
            <ModalLoading text="예약·결제 상태 확인 중..." minHeight="120px" />
        );
    } else if (readinessUnavailable) {
        readinessContent = (
            <div style={{ marginTop: 16, background: colors.error.light, borderRadius: radius.md, padding: '12px 14px' }}>
                <Text strong style={{ fontSize: fontSize.sm, color: colors.error.main, display: 'block', marginBottom: 2 }}>
                    영업 종료 준비 상태를 확인하지 못했습니다
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                    잠시 후 다시 시도해주세요. 확인 전에는 영업을 종료할 수 없습니다.
                </Text>
            </div>
        );
    } else if (readiness) {
        readinessContent = (
            <div style={{ marginTop: 16 }}>
                {canClose && (
                    <div style={{ background: colors.success.light, borderRadius: radius.md, padding: '12px 14px' }}>
                        <Text strong style={{ fontSize: fontSize.sm, color: colors.text.primary, display: 'block', marginBottom: 2 }}>
                            미결 운영 항목이 없습니다
                        </Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>거래 원장을 보존한 채 공개 영업을 종료할 수 있습니다.</Text>
                    </div>
                )}

                {!canClose && (
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
        );
    }

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
            /* mask.closable=false: 가게 영업 종료 — 명시적으로 버튼을 눌러야 닫히게 한다.
               컨벤션 — 입력 폼/파괴적 확인 모달은 바깥 클릭으로 안 닫히고, 읽기 전용 모달
               (상세보기/QR/예약상세)은 AntD 기본값(true)대로 아무데나 눌러도 닫힌다. */
            mask={{ closable: false }}
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
                {readinessContent}

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

const resolveOwnerSort = (params) => (OWNER_SORT_OPTIONS.some(option => option.value === params.get('sort'))
    ? params.get('sort') : 'recent');

// 툴바 값 하나를 URL 에 반영한다 — 빈 값과 기본 정렬(recent)은 URL 에서 뺀다.
const withToolbarParam = (current, key, value) => {
    const next = new URLSearchParams(current);
    if (value && !(key === 'sort' && value === 'recent')) next.set(key, value);
    else next.delete(key);
    return next;
};

const OwnedStoresSkeleton = ({ view }) => (
    <div className={view === 'list' ? 'reserve-store-list-rows' : 'rsv-mystore-grid'} role="status" aria-label="내 가게를 불러오는 중">
        <div style={{ display: 'contents' }} aria-hidden="true">
            {view === 'list' ? <StoreListRowSkeleton count={4} /> : <StoreCardSkeleton count={4} withActions />}
        </div>
    </div>
);

// 가게 목록 본문 — 목록형 / 카드형 / 빈 안내 중 하나.
const OwnedStoresBody = ({ stores, visibleStores, view, onEdit, onDelete, onRegister, onResetFilters }) => {
    if (visibleStores.length > 0 && view === 'list') {
        return (
            <>
                <div className="reserve-store-list-rows reserve-mystore-list-rows">
                    {visibleStores.map(store => (
                        <StoreListRow key={store.id} store={store} className="reserve-mystore-list-row"
                            actions={managedActions(store, onEdit, onDelete, true)} />
                    ))}
                </div>
                <button type="button" className="reserve-mystore-add-row" onClick={onRegister}>
                    <PlusOutlined aria-hidden="true" /> 새 가게 등록하기
                </button>
            </>
        );
    }
    if (visibleStores.length > 0) {
        return (
            <div className="rsv-mystore-grid">
                {/* 가게 전체보기와 같은 StoreCard 를 재사용한다. 관리 화면이라 하트 대신 수정·삭제 줄을 붙인다. */}
                {visibleStores.map(store => (
                    <div key={store.id}>
                        <StoreCard store={store} showFavorite={false}
                            actions={managedActions(store, onEdit, onDelete)} />
                    </div>
                ))}
                <div>
                    <Card.Add onClick={onRegister} minHeight="350px">
                        새 가게 등록하기
                    </Card.Add>
                </div>
            </div>
        );
    }
    return (
        <DataState state="empty" kind="store" style={{ marginTop: '100px' }}
            title={stores.length > 0 ? '조건에 맞는 내 가게가 없습니다.' : '등록된 가게가 없습니다.'}
            action={stores.length > 0
                ? <Button variant="secondary" size="sm" onClick={onResetFilters}>필터 초기화</Button>
                : <Button variant="secondary" size="sm" onClick={onRegister}>새 가게 등록하기</Button>} />
    );
};

// ─── MyStores 메인 ──────────────────────────────────────────────────────────
const MyStores = () => {
    const navigate = useNavigate();
    const [urlSearchParams, setUrlSearchParams] = useSearchParams();
    const { stores, loading, error, refetch, deleteStore } = useMyStores();
    useDocumentTitle('내 가게');
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [targetStore, setTargetStore] = useState(null); // { id, name }
    const [retrying, setRetrying] = useState(false);
    const [view, setView] = useViewModeParam(urlSearchParams, setUrlSearchParams, 'cards');
    const domain = urlSearchParams.get('domain') || '';
    const sort = resolveOwnerSort(urlSearchParams);
    const visibleStores = filterAndSortOwnedStores(stores, { domain, sort });

    const setToolbarParam = (key, value) => setUrlSearchParams(current => withToolbarParam(current, key, value));
    const resetOwnedFilters = () => setUrlSearchParams(current => {
        const next = new URLSearchParams(current);
        next.delete('region'); // 예전 지역 필터 링크로 들어온 경우 URL의 낡은 값도 함께 없앤다.
        next.delete('domain');
        next.delete('sort');
        return next;
    });

    const handleRetry = async () => {
        setRetrying(true);
        try { await refetch(); }
        catch { /* 조회 오류는 목록의 오류 상태에 표시한다. */ }
        finally { setRetrying(false); }
    };

    const handleDeleteClick = useCallback((e, store) => {
        e.stopPropagation();
        setTargetStore({ id: store.id, name: store.name });
        setDeleteModalOpen(true);
    }, []);

    const handleDeleteConfirm = useCallback(async () => {
        if (!targetStore) return;
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

    const handleEdit = store => navigate(`/store/${store.id}/edit`);

    // 카드 영역 — 로딩 / 첫 조회 실패 / 목록 중 하나.
    let storesContent;
    if (loading) {
        storesContent = <OwnedStoresSkeleton view={view} />;
    } else if (error && stores.length === 0) {
        storesContent = (
            // 처음부터 못 불러오면 목록 자리에 띄운다 — 제목·툴바 옆이 아니라 결과가 나올 자리.
            <DataState state="error" kind="store" subject="가게 목록" error={error}
                onRetry={handleRetry} retrying={retrying} style={{ marginTop: 100 }} />
        );
    } else {
        storesContent = (
            <>
                {/* 다시 불러오기만 실패했으면 이전 목록은 그대로 두고, 그 위에 작은 띠로만 알린다. */}
                {error && (
                    <DataState state="error" kind="store" subject="가게 목록" error={error}
                        title="최신 가게 정보를 확인하지 못해 이전 목록을 보여드리고 있습니다."
                        onRetry={handleRetry} retrying={retrying} compact style={{ marginBottom: 16 }} />
                )}
                <OwnedStoresBody stores={stores} visibleStores={visibleStores} view={view}
                    onEdit={handleEdit} onDelete={handleDeleteClick}
                    onRegister={() => navigate('/store/register')} onResetFilters={resetOwnedFilters} />
            </>
        );
    }

    return (
        <PageContainer size="xl" paddingTop="40px" className="reserve-mystore-page" aria-busy={loading || retrying}>
            {/* 헤더 */}
            <div style={{ marginBottom: '40px' }}>
                <Title level={2} style={{ margin: '0 0 8px 0', fontWeight: fontWeight.extrabold }}>
                    내 가게 관리
                </Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                    등록된 가게를 수정하거나 관리할 수 있습니다.
                </Text>
            </div>

            <StoreListingToolbar
                view={view}
                onViewChange={setView}
                count={!loading && !error ? visibleStores.length : undefined}
                domain={domain}
                onDomainChange={nextDomain => setToolbarParam('domain', nextDomain)}
                sort={sort}
                onSortChange={nextSort => setToolbarParam('sort', nextSort)}
                sortOptions={OWNER_SORT_OPTIONS}
                disabled={loading || retrying}
                sortDisabled={loading || retrying}
                label="내 가게 목록 필터"
            />

            {/* 카드 영역 — 2026-07 수정: 고정 4열 그리드(rsv-mystore-grid)로 통일(위 GRID_STYLE 참고).
                Card.Add도 같은 시점에 borderRadius를 0(각짐)으로 맞춰서 실제 가게 카드와 모서리가 일치한다. */}
            {storesContent}

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
