import { useCallback } from 'react';
import PropTypes from 'prop-types';
import { ConfigProvider } from 'antd';
import { arrayMove } from '@dnd-kit/sortable';
import LoadingUpload from './LoadingUpload';
import SortablePhotoList, { SortablePhotoItem } from './SortablePhotoList';

const SortableImageUpload = ({ fileList = [], onReorder, children, itemRender, disabled: disabledProp, ...uploadProps }) => {
    const { componentDisabled } = ConfigProvider.useConfig();
    // 기존 가게 Form의 disabled도 그대로 상속한다. 업로드와 드래그가 같은 잠금을 쓴다.
    const disabled = disabledProp ?? componentDisabled;
    const renderSortableItem = useCallback((originNode, file, files, actions) => {
        const item = itemRender ? itemRender(originNode, file, files, actions) : originNode;
        const sortable = !disabled && files.length > 1 && files.some(current => current.uid === file.uid);
        return <SortablePhotoItem id={file.uid} disabled={!sortable}>
            {dragging => file.status === 'error' && dragging ? item.props.children : item}
        </SortablePhotoItem>;
    }, [disabled, itemRender]);

    const movePhoto = (source, destination) => {
        const from = fileList.findIndex(file => file.uid === source);
        const to = fileList.findIndex(file => file.uid === destination);
        onReorder?.(arrayMove(fileList, from, to));
    };

    return <SortablePhotoList ids={fileList.map(file => file.uid)} disabled={disabled} onMove={movePhoto}>
        <LoadingUpload {...uploadProps} disabled={disabled} fileList={fileList} itemRender={renderSortableItem}>
            {children}
        </LoadingUpload>
    </SortablePhotoList>;
};

SortableImageUpload.propTypes = {
    itemRender: PropTypes.func,
    fileList: PropTypes.arrayOf(PropTypes.object),
    onReorder: PropTypes.func,
    children: PropTypes.node,
    disabled: PropTypes.bool,
};

export default SortableImageUpload;
