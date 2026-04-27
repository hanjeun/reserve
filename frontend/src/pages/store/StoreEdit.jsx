import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Form } from 'antd';
import Loading from "../../components/common/Loading";
import StoreForm from "../../components/store/StoreForm";
import { useStoreData, useMessage, useFormReady, useImagePreview, useStoreForm } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';

/**
 * 가게 수정 페이지
 * 
 * 기능:
 * - 가게 기본 정보 수정
 * - 대표 이미지 변경
 * - 상세 이미지 변경 (최대 5장)
 * - 영업 시간 수정
 * 
 * @route /store/edit/:id
 * @auth OWNER (본인 가게만), ADMIN
 */
const StoreEdit = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const { message } = useMessage();
    const { formReady, formRef } = useFormReady();
    const { handlePreview, PreviewModal } = useImagePreview();
    useDocumentTitle('가게 수정');
    
    // 가게 데이터 로딩
    const { store, loading, error } = useStoreData(id);
    
    // 비즈니스 로직을 useStoreForm hook에 위임
    const {
        loading: submitting,
        mainImage,
        detailImages,
        handleSubmit,
        handleMainImageChange,
        handleDetailImagesChange,
        getInitialValues,
    } = useStoreForm({ 
        mode: 'edit', 
        initialData: store,
        storeId: id 
    });

    /**
     * 에러 발생 시 처리
     */
    useEffect(() => {
        if (error) {
            message.error(error);
            navigate('/my-stores');
        }
    }, [error, message, navigate]);

    /**
     * Form 초기값 설정
     * getInitialValues는 store에 의존하므로 store/formReady 변경 시만 실행
     * (getInitialValues를 dependency에 넣으면 매 렌더마다 폼 값이 초기화됨)
     */
    useEffect(() => {
        if (store && formReady) {
            form.setFieldsValue(getInitialValues());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, formReady]);

    /**
     * 취소 버튼 핸들러
     */
    const handleCancel = () => {
        navigate('/my-stores');
    };

    // 가게 데이터 로딩 중 또는 아직 store가 없으면 스피너 유지
    // (initialValues는 Form 최초 마운트 시 1회만 읽히므로 store가 준비된 후 렌더해야 함)
    if (loading || !store) {
        return <Loading fullPage />;
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
                onCancel={handleCancel}
                initialValues={store ? getInitialValues() : undefined}
            />
            
            {/* 이미지 미리보기 모달 */}
            <PreviewModal />
        </>
    );
};

export default StoreEdit;
