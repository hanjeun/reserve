/**
 * RESERVE - 순서를 바꿀 수 있는 사진 업로드 (2026-09-28)
 *
 * AntD Upload(picture-card)를 그대로 쓰고, 사진 칸만 끌어서 순서를 바꿀 수 있게 감싼다.
 * 여러 장을 올리는 사진 목록은 전부 이 관문을 쓴다 — 칸마다 드래그를 따로 구현하면
 * 터치·키보드·모션 규칙이 화면마다 어긋난다(CLAUDE.md "규칙은 관문으로").
 *
 * - 마우스: 6px 이상 끌어야 시작 → 미리보기·삭제 아이콘 클릭은 그대로 동작한다
 * - 터치: 180ms 누르고 있어야 시작 → 목록 위에서 손가락으로 스크롤해도 사진이 딸려 오지 않는다
 * - 키보드: 사진 칸에 초점 → Space 로 집고 방향키로 옮긴 뒤 Space 로 내려놓는다
 * - 모션: 옮겨지는 칸은 떠오르고(그림자·확대), 나머지는 자리로 미끄러진다. 동작 줄이기 설정이면 끈다
 *
 * Form.Item 이 주입하는 value/onChange 는 그대로 Upload 에 넘긴다(검증용 값이 계속 갱신되게).
 *
 * ⚠️ components/common/index.js 배럴로 내보내지 않는다. 배럴에 넣으면 드래그 라이브러리(@dnd-kit)가
 *    공통 청크로 딸려 들어가 번들 예산(청크 600KiB)을 넘긴다(2026-09-28 빌드 실측 637KiB).
 *    쓰는 곳에서 '../../common/SortableImageUpload' 처럼 파일로 직접 import 하면 가게 폼 청크에만 들어간다.
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Upload } from 'antd';
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

const SortableItem = ({ file, originNode, reducedMotion }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.uid });
    return (
        <div
            ref={setNodeRef}
            className={`reserve-sortable-upload-item${isDragging ? ' is-dragging' : ''}`}
            style={{
                transform: CSS.Translate.toString(transform),
                transition: reducedMotion ? undefined : transition,
            }}
            {...attributes}
            {...listeners}
            aria-roledescription="순서를 바꿀 수 있는 사진"
        >
            {/* 업로드 실패 칸은 끄는 동안 툴팁이 따라다니지 않게 안쪽만 그린다(AntD 공식 예제와 같은 처리). */}
            {file.status === 'error' && isDragging ? originNode.props.children : originNode}
        </div>
    );
};

SortableItem.propTypes = {
    file: PropTypes.shape({ uid: PropTypes.string.isRequired, status: PropTypes.string }).isRequired,
    originNode: PropTypes.node.isRequired,
    reducedMotion: PropTypes.bool,
};

const SortableImageUpload = ({ fileList = [], onReorder, children, ...uploadProps }) => {
    const reducedMotion = useReducedMotion();
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return;
        const from = fileList.findIndex(file => file.uid === active.id);
        const to = fileList.findIndex(file => file.uid === over.id);
        if (from < 0 || to < 0) return;
        onReorder?.(arrayMove(fileList, from, to));
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fileList.map(file => file.uid)} strategy={rectSortingStrategy}>
                <Upload
                    {...uploadProps}
                    fileList={fileList}
                    itemRender={(originNode, file) => (
                        <SortableItem file={file} originNode={originNode} reducedMotion={reducedMotion} />
                    )}
                >
                    {children}
                </Upload>
            </SortableContext>
        </DndContext>
    );
};

SortableImageUpload.propTypes = {
    fileList: PropTypes.arrayOf(PropTypes.object),
    onReorder: PropTypes.func,
    children: PropTypes.node,
};

export default SortableImageUpload;
