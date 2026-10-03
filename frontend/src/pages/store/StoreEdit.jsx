import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Form } from 'antd';
import StoreFormSkeleton from "../../components/store/StoreFormSkeleton";
import StoreForm from "../../components/store/StoreForm";
import { Button, DataState, PageContainer } from '../../components/common';
import { useStoreData, useMessage, useFormReady, useImagePreview, useStoreForm } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useAuthStore from '../../store/useAuthStore';

/**
 * 가게 수정 페이지
 * 
 * 기능:
 * - 가게 기본 정보 수정
 * - 대표 이미지 변경
 * - 상세 이미지 변경 (최대 5장)
 * - 영업 시간 수정
 * 
 * @route /store/:id/edit
 * @auth OWNER (본인 가게만), ADMIN
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

    // 가게 수정용 데이터 로딩 — /api/stores/{id}/edit (인증 + 소유자 검증)
    // 공개 GET /api/stores/{id} 대신 인증된 엔드포인트를 주으로서
    // URL 조작시 다른 사람의 가게 운영 설정이 노출되지 않도록 차단
    // 숫자가 아닌 id(/store/abc/edit)는 API 에 보내지 않고, 404 와 함께 "없는 가게"로 보여 준다.
    // 예전엔 400/404 가 "요청을 처리할 수 없습니다 · 다시 불러오기" 오류로 보였다.
    const validId = /^\d+$/.test(id ?? '') && Number.isSafeInteger(Number(id)) && Number(id) > 0;
    const { store, loading, error, refetch } = useStoreData(validId ? id : null, { forEdit: true });

    // 소유자 검증 — store 로딩 후 본인 가게가 아니면 리다이렉트
    useEffect(() => {
        if (!store || !user) return;
        const isAdmin = user?.role === 'ADMIN';
        const isOwner = store.ownerId && user?.id === store.ownerId;
        if (!isAdmin && !isOwner) {
            message.error('접근 권한이 없습니다.');
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
        return <output className="reserve-route-skeleton reserve-route-skeleton--store-form" aria-label="가게 정보를 불러오는 중" aria-busy="true" style={{ display: 'block' }}><div aria-hidden="true"><StoreFormSkeleton mode="edit" /></div></output>;
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
                    title={error ? undefined : '수정할 가게를 찾을 수 없습니다.'}
                    onRetry={error ? refetch : undefined}
                    missingAction={<Button variant="ghost" size="sm" onClick={() => navigate('/my-stores')}>내 가게 목록으로</Button>}
                    style={{ marginTop: 100 }}
                />
            </PageContainer>
        );
    }

    return (
        <>
            <StoreForm
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
            />
            
            {/* 이미지 미리보기 모달 */}
            {previewNode}
        </>
    );
};

export default StoreEdit;
