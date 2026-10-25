/*
 * 사진 정렬은 공통 입력 경계를 사용하며 폼 값·접근성·스크롤을 유지한다. 공통 배럴 대신 직접 가져와 드래그 의존성을 가게 폼 청크에 한정한다.
 */
import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { ConfigProvider } from 'antd';
import LoadingUpload from './LoadingUpload';
import {
    DndContext,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useReducedMotion from '../../hooks/useReducedMotion';

const SortableItem = ({ file, originNode, reducedMotion, disabled }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.uid, disabled });
    return (
        <div
            ref={setNodeRef}
            className={`reserve-sortable-upload-item${isDragging ? ' is-dragging' : ''}`}
            style={{
                transform: CSS.Translate.toString(transform),
                transition: reducedMotion ? undefined : transition,
                cursor: disabled ? 'default' : undefined,
            }}
            {...attributes}
            {...listeners}
            aria-roledescription="순서를 바꿀 수 있는 사진"
        >
            {/* 실패한 업로드를 끄는 동안 내부 도구 툴팁이 따라오지 않게 한다. */}
            {file.status === 'error' && isDragging ? originNode.props.children : originNode}
        </div>
    );
};

SortableItem.propTypes = {
    file: PropTypes.shape({ uid: PropTypes.string.isRequired, status: PropTypes.string }).isRequired,
    originNode: PropTypes.node.isRequired,
    reducedMotion: PropTypes.bool,
    disabled: PropTypes.bool,
};

const SortableImageUpload = ({ fileList = [], onReorder, children, itemRender, disabled: disabledProp, ...uploadProps }) => {
    const { componentDisabled } = ConfigProvider.useConfig();
    // 기존 가게 Form의 disabled도 그대로 상속한다. 업로드와 드래그가 같은 잠금을 쓴다.
    const disabled = disabledProp ?? componentDisabled;
    const reducedMotion = useReducedMotion();
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const renderSortableItem = useCallback((originNode, file, files, actions) => (
        <SortableItem file={file} originNode={itemRender ? itemRender(originNode, file, files, actions) : originNode}
            reducedMotion={reducedMotion} disabled={disabled} />
    ), [reducedMotion, disabled, itemRender]);

    const handleDragEnd = ({ active, over }) => {
        if (disabled || !over || active.id === over.id) return;
        const from = fileList.findIndex(file => file.uid === active.id);
        const to = fileList.findIndex(file => file.uid === over.id);
        if (from < 0 || to < 0) return;
        onReorder?.(arrayMove(fileList, from, to));
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fileList.map(file => file.uid)} strategy={rectSortingStrategy}>
                <LoadingUpload
                    {...uploadProps}
                    disabled={disabled}
                    fileList={fileList}
                    itemRender={renderSortableItem}
                >
                    {children}
                </LoadingUpload>
            </SortableContext>
        </DndContext>
    );
};

SortableImageUpload.propTypes = {
    itemRender: PropTypes.func,
    fileList: PropTypes.arrayOf(PropTypes.object),
    onReorder: PropTypes.func,
    children: PropTypes.node,
    disabled: PropTypes.bool,
};

export default SortableImageUpload;
