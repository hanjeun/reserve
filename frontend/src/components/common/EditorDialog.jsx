import { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import FormModal from './FormModal';
import { EditorDialogContext } from './editorDialogContext';

/** 다운로드·첫 닉네임 설정·작성·미리보기 동안 동일한 모달 인스턴스를 유지한다. */
export default function EditorDialog({ open, title, width = 520, onClose, children, rootClassName = 'reserve-feed-modal' }) {
    const [stage, setStage] = useState(null);
    const register = useCallback(settings => {
        setStage(settings);
        return () => setStage(current => current === settings ? null : current);
    }, []);
    // 모달 제목/버튼 변경으로 본문을 다시 렌더하거나 초기화하지 않는다.
    const context = useMemo(() => ({ register }), [register]);
    return <FormModal open={open} title={stage?.title || title} width={stage?.width ?? width}
        onClose={stage?.onClose || onClose} footer={stage?.footer ?? null}
        scrollResetKey={stage?.scrollResetKey} rootClassName={rootClassName}>
        <EditorDialogContext.Provider value={context}>{children}</EditorDialogContext.Provider>
    </FormModal>;
}
EditorDialog.propTypes = { open: PropTypes.bool.isRequired, title: PropTypes.string.isRequired,
    width: PropTypes.number, onClose: PropTypes.func.isRequired, children: PropTypes.node, rootClassName: PropTypes.string };
