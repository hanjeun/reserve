import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Form } from 'antd';
import StoreOnboardingSkeleton from "../../components/store/StoreOnboardingSkeleton";
import StoreOnboarding from "../../components/store/StoreOnboarding";
import { Button, DataState, PageContainer } from '../../components/common';
import { useStoreData, useMessage, useFormReady, useImagePreview, useStoreForm } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useAuthStore from '../../store/useAuthStore';

/*
 * 가게 수정의 본인 소유·관리자 권한은 서버가 최종 검증한다.
 */
const StoreEdit = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const { message } = useMessage();
    const { formReady, formRef } = useFormReady();
    const { handlePreview, previewNode, suppressLinkNavigation } = useImagePreview();
    useDocumentTitle('가게 수정');

    const { user } = useAuthStore();

    // 가게 수정은 소유권을 검증하는 인증 조회를 사용한다.

    // 숫자가 아닌 가게 ID는 API로 보내지 않는다.

    const validId = /^\d+$/.test(id ?? '') && Number.isSafeInteger(Number(id)) && Number(id) > 0;
    const { store, loading, error, refetch } = useStoreData(validId ? id : null, { forEdit: true });

    // 소유자 검증 — store 로딩 후 본인 가게가 아니면 리다이렉트
    useEffect(() => {
        if (!store || !user) return;
        const isAdmin = user?.role === 'ADMIN';
        const isOwner = store.ownerId && user?.id === store.ownerId;
        if (!isAdmin && !isOwner) {
            message.error('접근 권한이 없어요.');
            navigate('/', { replace: true });
        }
    }, [store, user, message, navigate]);

    // 비즈니스 로직을 useStoreForm hook에 위임
    const {
        loading: submitting,
        mainImage,
        detailImages,
        handleSubmit,
        handleMainImageChange,
        handleDetailImagesChange,
        getInitialValues,
        draftState,
        handleValuesChange,
        saveDraftNow,
    } = useStoreForm({
        mode: 'edit',
        initialData: store,
        storeId: id,
        form,
        formReady,
    });

    // 가게 데이터 로딩 중에는 폼의 골격을 유지한다.
    // (initialValues는 Form 최초 마운트 시 1회만 읽히므로 store가 준비된 후 렌더해야 함)
    if (loading) {
        return <output className="reserve-route-skeleton reserve-route-skeleton--store-form" aria-label="가게 정보를 불러오는 중" aria-busy="true" style={{ display: 'block' }}><div aria-hidden="true"><StoreOnboardingSkeleton mode="edit" /></div></output>;
    }

    if (!store) {
        return (
            <PageContainer size="lg" paddingTop="32px">
                <DataState
                    state={error ? 'error' : 'empty'}
                    requestType="detail"
                    kind="store"
                    subject="내 가게 정보"
                    error={error}
                    title={error ? undefined : '수정할 가게를 찾을 수 없어요.'}
                    onRetry={error ? refetch : undefined}
                    missingAction={<Button variant="ghost" size="sm" onClick={() => navigate('/my-stores')}>내 가게 목록으로</Button>}
                    style={{ marginTop: 100 }}
                />
            </PageContainer>
        );
    }

    return (
        <>
            <StoreOnboarding
                mode="edit"
                form={form}
                formRef={formRef}
                onSubmit={handleSubmit}
                loading={submitting}
                mainImage={mainImage}
                detailImages={detailImages}
                onMainImageChange={handleMainImageChange}
                onDetailImagesChange={handleDetailImagesChange}
                onPreview={handlePreview}
                onPreviewClickCapture={suppressLinkNavigation}
                onValuesChange={handleValuesChange}
                onSaveDraft={saveDraftNow}
                draftState={draftState}
                initialValues={getInitialValues()}
                originalStore={store}
            />
            
            {/* 이미지 미리보기 모달 */}
            {previewNode}
        </>
    );
};

export default StoreEdit;
