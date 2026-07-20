import React from 'react';
import { Form, Upload, Divider, message as antMessage } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const MAX_SIZE_MB = 10;

const validateImage = (file) => {
    if (!file.type.startsWith('image/')) {
        antMessage.error('이미지 파일만 업로드할 수 있습니다');
        return Upload.LIST_IGNORE;
    }
    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > MAX_SIZE_MB) {
        antMessage.error(
            `파일 크기가 ${MAX_SIZE_MB}MB를 초과합니다 (현재 ${sizeMB.toFixed(1)}MB)`
        );
        return Upload.LIST_IGNORE;
    }
    return false;
};

/**
 * 가게 이미지 업로드 섹션
 */
const StoreImages = ({
    mainImage = [],
    detailImages = [],
    onMainImageChange,
    onDetailImagesChange,
    onPreview,
    onPreviewClickCapture,
    mainImageRequired = true,
}) => {
    return (
        <>
            <Divider>이미지 등록</Divider>

            {/* 대표 이미지 */}
            <Form.Item
                label="대표 이미지"
                name="mainImage"
                extra={`JPG · PNG · WEBP 등 이미지 파일 / 최대 ${MAX_SIZE_MB}MB`}
                rules={mainImageRequired ? [{ required: true, message: '대표 이미지를 등록해주세요' }] : []}
            >
                <Upload
                    listType="picture-card"
                    fileList={mainImage}
                    onChange={onMainImageChange}
                    onPreview={onPreview}
                    beforeUpload={validateImage}
                    maxCount={1}
                    onClickCapture={onPreviewClickCapture}
                >
                    {mainImage.length === 0 && <UploadButton />}
                </Upload>
            </Form.Item>

            {/* 상세 이미지 */}
            <Form.Item
                label="상세 이미지 (최대 5장)"
                name="detailImages"
                extra={`JPG · PNG · WEBP 등 이미지 파일 / 장당 최대 ${MAX_SIZE_MB}MB`}
            >
                <Upload
                    listType="picture-card"
                    fileList={detailImages}
                    onChange={onDetailImagesChange}
                    onPreview={(file) => onPreview(file, detailImages)}
                    beforeUpload={validateImage}
                    maxCount={5}
                    multiple
                    onClickCapture={onPreviewClickCapture}
                >
                    {detailImages.length < 5 && <UploadButton />}
                </Upload>
            </Form.Item>
        </>
    );
};

const UploadButton = () => (
    <div>
        <PlusOutlined />
        <div style={{ marginTop: 8 }}>업로드</div>
    </div>
);

export default StoreImages;
