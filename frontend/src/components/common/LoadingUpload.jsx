import { Children, cloneElement, isValidElement, useCallback } from 'react';
import PropTypes from 'prop-types';
import { ConfigProvider, Upload } from 'antd';
import { isImageUrl } from 'antd/es/upload/utils';
import LoadingImage from './LoadingImage';
import PhotoUploadThumbnail from './PhotoUploadThumbnail';
import { DeleteOutlined, EyeOutlined, DownloadOutlined } from './icons';

const DEFAULT_LIST_OPTIONS = {};
const showTool = (setting, file) => typeof setting === 'function' ? setting(file) : setting;

// AntD 항목의 DOM·실행 도구를 유지하고 기본 사진만 대체한다.
function withLoadingPictures(node) {
    if (Array.isArray(node)) return Children.map(node, withLoadingPictures);
    if (!isValidElement(node)) return node;
    if (node.type === 'img') return <LoadingImage key={node.key} {...node.props} />;
    if (node.props.children === undefined) return node;
    return cloneElement(node, {}, withLoadingPictures(node.props.children));
}

export default function LoadingUpload({ itemRender, className, showUploadList: listOptions, disabled: disabledProp,
    listType, previewFile, onPreview, isImageUrl: checkImageUrl = isImageUrl, showTrigger, children, ...props }) {
    const { componentDisabled } = ConfigProvider.useConfig();
    const disabled = disabledProp ?? componentDisabled;
    const pictureCard = listType === 'picture-card';
    const managesTrigger = showTrigger !== undefined && Boolean(children)
        && pictureCard && listOptions !== false && props.type !== 'drag';
    const triggerHidden = managesTrigger && !showTrigger;
    const options = listOptions && typeof listOptions === 'object' ? listOptions : DEFAULT_LIST_OPTIONS;
    const usePhotoThumbnail = pictureCard && !previewFile && !options.extra && !options.showDownloadIcon
        && !options.previewIcon && !options.removeIcon;
    const renderItem = useCallback((originNode, file, files, actions) => {
        const localFile = !file.url && file.originFileObj instanceof Blob ? file.originFileObj : undefined;
        const src = localFile ? undefined : file.thumbUrl || file.url;
        let item;
        if (usePhotoThumbnail && (src || localFile) && checkImageUrl(file) && file.status !== 'uploading' && file.status !== 'error') {
            const showPreview = showTool(options.showPreviewIcon ?? true, file);
            const showRemove = showTool(options.showRemoveIcon ?? !disabled, file);
            const preview = url => {
                if (onPreview) actions.preview();
                else window.open(file.url || url, '_blank', 'noopener,noreferrer');
            };
            item = <PhotoUploadThumbnail src={src} file={localFile} alt={file.name || '사진'} crossOrigin={file.crossOrigin}
                active={files.some(current => current.uid === file.uid)} onPreview={showPreview ? preview : undefined}
                onRemove={showRemove ? actions.remove : undefined} removeDisabled={disabled} />;
        } else item = withLoadingPictures(originNode);
        return itemRender ? itemRender(item, file, files, actions) : item;
    }, [checkImageUrl, disabled, itemRender, onPreview, options, usePhotoThumbnail]);
    const showUploadList = listOptions === false ? false : {
        previewIcon: <EyeOutlined aria-hidden="true" />,
        removeIcon: <DeleteOutlined aria-hidden="true" />,
        downloadIcon: <DownloadOutlined aria-hidden="true" />,
        ...options,
    };
    // 공통 썸네일은 로컬 파일을 직접 읽으므로 AntD의 정사각형 변환을 건너뛴다.
    const uploadClassName = [className, pictureCard && 'reserve-picture-upload',
        managesTrigger && 'reserve-picture-upload--managed-trigger', triggerHidden && 'reserve-picture-upload--trigger-hidden'].filter(Boolean).join(' ');
    // 사진 추가 칸의 내용은 표시용이므로 AntD가 키보드 조작을 맡는다.
    const triggerHasControl = !pictureCard || !children || disabled || props.openFileDialogOnClick === false;
    // 선택 칸이 접히는 동안 파일 선택과 폼 라벨의 연결을 바로 끊는다.
    const hiddenTriggerProps = triggerHidden ? { id: undefined, openFileDialogOnClick: false, hasControlInside: true } : {};
    return <Upload hasControlInside={triggerHasControl} {...props} {...hiddenTriggerProps} listType={listType} disabled={disabled} previewFile={usePhotoThumbnail ? null : previewFile}
        onPreview={onPreview} isImageUrl={checkImageUrl} className={uploadClassName} showUploadList={showUploadList} itemRender={renderItem}>
        {managesTrigger ? <div inert={triggerHidden || undefined}>{children}</div> : children}
    </Upload>;
}
LoadingUpload.propTypes = {
    itemRender: PropTypes.func, className: PropTypes.string, listType: PropTypes.string, disabled: PropTypes.bool,
    previewFile: PropTypes.func, onPreview: PropTypes.func, isImageUrl: PropTypes.func, showTrigger: PropTypes.bool, children: PropTypes.node,
    showUploadList: PropTypes.oneOfType([PropTypes.bool, PropTypes.object]),
};
