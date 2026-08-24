import React from 'react';
import { Form, Upload, Divider, message as antMessage } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const MAX_SIZE_MB = 10;

/**
 * Upload 의 onChange 이벤트에서 폼 값으로 쓸 배열만 꺼낸다.
 *
 * ★ 이게 없으면 `required` 검사가 통째로 무력해진다.
 * Upload 는 `{ file, fileList }` 객체를 onChange 로 넘기는데, 그 객체가 그대로 폼 값이 되면
 * fileList 가 비어 있어도 **객체 자체는 truthy** 라 required 를 통과한다.
 * 즉 "이미지를 올렸다가 지우고 제출" 하면 대표 이미지 없이 등록이 됐다.
 *
 * 배열로 바꿔주면 `[]` 가 되어 async-validator 가 빈 값으로 판정한다.
 * (실제 파일은 폼이 아니라 useStoreForm 의 state 로 전송되므로, 이 값은 검증 전용이다.)
 */
const normFileList = (e) => (Array.isArray(e) ? e : e?.fileList ?? []);

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
                getValueFromEvent={normFileList}
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
                getValueFromEvent={normFileList}
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
