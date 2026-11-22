import { useCallback, useId } from 'react';
import PropTypes from 'prop-types';
import {
    AutoScrollActivator, DndContext, KeyboardSensor, MouseSensor, TouchSensor,
    closestCenter, pointerWithin, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useReducedMotion from '../../hooks/useReducedMotion';
import { PHOTO_SORT_HOLD_MS, PHOTO_TOUCH_SLOP } from '../../utils/photoPreview';

const horizontal = transform => ({ ...transform, y: 0 });
const isPhotoStrip = element => element.matches('.reserve-picture-upload .ant-upload-list-picture-card, .reserve-chat-attachments');
const modifiers = [({ transform, draggingNodeRect, scrollableAncestors, scrollableAncestorRects }) => {
    const strip = scrollableAncestorRects[scrollableAncestors.findIndex(isPhotoStrip)];
    if (!strip || !draggingNodeRect) return horizontal(transform);
    // 끄는 사진이 넘친 만큼 다시 자동 스크롤되어 줄 너비가 계속 커지는 것을 막는다.
    const minX = strip.left - draggingNodeRect.left;
    const maxX = strip.right - draggingNodeRect.right;
    return horizontal({ ...transform, x: Math.max(minX, Math.min(maxX, transform.x)) });
}];
const photoCollision = args => {
    const pointed = pointerWithin(args);
    return pointed.length ? pointed : closestCenter(args);
};
const autoScroll = {
    activator: AutoScrollActivator.DraggableRect,
    canScroll: element => isPhotoStrip(element) && element.scrollWidth > element.clientWidth,
    layoutShiftCompensation: { x: true, y: false },
};

export function SortablePhotoItem({ id, children, disabled, className }) {
    const reducedMotion = useReducedMotion();
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
        id, disabled: { draggable: disabled, droppable: disabled },
        attributes: { role: 'group', roleDescription: '순서를 바꿀 수 있는 사진' },
    });
    const setRefs = useCallback(node => {
        setNodeRef(node);
        setActivatorNodeRef(node);
    }, [setNodeRef, setActivatorNodeRef]);
    const startSort = listener => event => {
        if (!event.target.closest('.ant-upload-list-item-actions')) listener?.(event);
    };
    return <div ref={setRefs} className={['reserve-sortable-upload-item', isDragging && 'is-dragging', className].filter(Boolean).join(' ')}
        style={{ transform: CSS.Translate.toString(transform && horizontal(transform)), transition: reducedMotion ? undefined : transition }}
        {...(!disabled && attributes)} data-discovery-swipe-ignore="true"
        onMouseDown={event => { if (event.button === 0) startSort(listeners?.onMouseDown)(event); }}
        onTouchStart={startSort(listeners?.onTouchStart)}
        onKeyDown={event => { if (event.target === event.currentTarget) listeners?.onKeyDown?.(event); }}
        onDragStart={event => event.preventDefault()}>
        {typeof children === 'function' ? children(isDragging) : children}
    </div>;
}
SortablePhotoItem.propTypes = {
    id: PropTypes.string.isRequired, children: PropTypes.oneOfType([PropTypes.node, PropTypes.func]).isRequired,
    disabled: PropTypes.bool, className: PropTypes.string,
};

export default function SortablePhotoList({ ids, children, onMove, disabled = false }) {
    const id = useId();
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: PHOTO_SORT_HOLD_MS, tolerance: PHOTO_TOUCH_SLOP } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    return <DndContext id={id} sensors={sensors} collisionDetection={photoCollision} modifiers={modifiers} autoScroll={autoScroll} onDragEnd={({ active, over }) => {
        if (!disabled && over && active.id !== over.id && ids.includes(active.id) && ids.includes(over.id)) onMove(active.id, over.id);
    }}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy} disabled={disabled}>{children}</SortableContext>
    </DndContext>;
}
SortablePhotoList.propTypes = {
    ids: PropTypes.arrayOf(PropTypes.string).isRequired, children: PropTypes.node.isRequired,
    onMove: PropTypes.func.isRequired, disabled: PropTypes.bool,
};
