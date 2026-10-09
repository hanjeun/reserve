import React from 'react';
import { Form, Upload, Divider, Switch, message as antMessage } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
    IMAGE_ACCEPT,
    MAX_IMAGE_REQUEST_BYTES,
    MAX_IMAGE_REQUEST_MB,
    imageFileError,
    uploadListBytes,
} from '../../../utils/imageUploadPolicy';
import SortableImageUpload from '../../common/SortableImageUpload';

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
    const error = imageFileError(file);
    if (error) {
        antMessage.error(error);
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
    const withinRequestLimit = (nextMain, nextDetails) => {
        if (uploadListBytes([...nextMain, ...nextDetails]) <= MAX_IMAGE_REQUEST_BYTES) return true;
        antMessage.error(`새로 올리는 이미지 전체 합계는 ${MAX_IMAGE_REQUEST_MB}MB 이하여야 해요.`);
        return false;
    };

    const handleMainChange = (event) => {
        const next = event.fileList.slice(-1);
        if (withinRequestLimit(next, detailImages)) onMainImageChange({ ...event, fileList: next });
    };

    const handleDetailsChange = (event) => {
        const next = event.fileList.slice(0, 5);
        if (withinRequestLimit(mainImage, next)) onDetailImagesChange({ ...event, fileList: next });
    };

    return (
        <>
            <Divider>이미지 등록</Divider>

            {/* 대표 이미지 */}
            <Form.Item
                label="대표 이미지"
                name="mainImage"
                getValueFromEvent={normFileList}
                extra={<span>대표 이미지는 가게 카드와 고객의 가게 문의 채팅 사진에 표시돼요. 변경하면 채팅 사진도 함께 바뀌어요.<br />JPG · PNG · WEBP · GIF / 새 이미지 전체 합계 최대 {MAX_IMAGE_REQUEST_MB}MB</span>}
                rules={mainImageRequired ? [{ required: true, message: '대표 이미지를 등록해주세요' }] : []}
            >
                <Upload
                    listType="picture-card"
                    fileList={mainImage}
                    onChange={handleMainChange}
                    onPreview={onPreview}
                    beforeUpload={validateImage}
                    maxCount={1}
                    accept={IMAGE_ACCEPT}
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
                extra={<span>사진을 끌어 옆 사진과 순서를 바꿀 수 있어요. 휴대폰에서는 사진을 길게 누른 뒤 끌어주세요.<br />JPG · PNG · WEBP · GIF / 대표 이미지와 합쳐 최대 {MAX_IMAGE_REQUEST_MB}MB</span>}
            >
                {/* 순서가 곧 가게 상세의 사진 순서다. 기존·새 사진이 섞여도 서버가 이 순서로 저장한다(useStoreForm detailImageOrder). */}
                <SortableImageUpload
                    listType="picture-card"
                    fileList={detailImages}
                    onReorder={(next) => onDetailImagesChange({ fileList: next })}
                    onChange={handleDetailsChange}
                    onPreview={(file) => onPreview(file, detailImages)}
                    beforeUpload={validateImage}
                    maxCount={5}
                    multiple
                    accept={IMAGE_ACCEPT}
                    onClickCapture={onPreviewClickCapture}
                >
                    {detailImages.length < 5 && <UploadButton />}
                </SortableImageUpload>
            </Form.Item>
            <Form.Item
                className="reserve-store-photo-autoplay"
                label="사진 자동 넘김"
                name="imageAutoplayEnabled"
                valuePropName="checked"
                extra="가게 상세의 사진을 자동으로 넘겨요. 끄면 직접 넘길 수 있어요."
            >
                <Switch />
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
