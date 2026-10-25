import { cloneElement, isValidElement, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Upload } from 'antd';
import LoadingImage from './LoadingImage';
import { DeleteOutlined, EyeOutlined, DownloadOutlined } from './icons';

// AntD 항목의 DOM·실행 도구를 유지하고 기본 사진만 대체한다.
function withLoadingPictures(node) {
    if (Array.isArray(node)) return node.map(withLoadingPictures);
    if (!isValidElement(node)) return node;
    if (node.type === 'img') return <LoadingImage key={node.key} {...node.props} />;
    if (node.props.children === undefined) return node;
    return cloneElement(node, {}, withLoadingPictures(node.props.children));
}

export default function LoadingUpload({ itemRender, ...props }) {
    const renderItem = useCallback((originNode, ...args) => {
        const loadingNode = withLoadingPictures(originNode);
        return itemRender ? itemRender(loadingNode, ...args) : loadingNode;
    }, [itemRender]);
    const showUploadList = props.showUploadList === false ? false : {
        previewIcon: <EyeOutlined aria-hidden="true" />,
        removeIcon: <DeleteOutlined aria-hidden="true" />,
        downloadIcon: <DownloadOutlined aria-hidden="true" />,
        ...(typeof props.showUploadList === 'object' ? props.showUploadList : {}),
    };
    return <Upload {...props} showUploadList={showUploadList} itemRender={renderItem} />;
}
LoadingUpload.propTypes = { itemRender: PropTypes.func };
