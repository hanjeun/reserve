import { useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { WorkspaceMenuContext } from './workspaceMenu';
import useInputModality from '../../hooks/useInputModality';

/** 현재 작업 화면이 헤더 메뉴를 제어한다. 로딩 화면과 이전 화면의 정리는 현재 메뉴를 덮지 않는다. */
export default function WorkspaceMenuProvider({ children }) {
    const [control, setControl] = useState(null);
    const modality = useInputModality();
    const inputModality = modality === 'keyboard' ? 'keyboard' : 'pointer';
    const publish = useCallback(next => setControl(next), []);
    const clear = useCallback(owner => setControl(current => current?.owner === owner ? null : current), []);
    const value = useMemo(() => ({ control, publish, clear, inputModality }), [control, publish, clear, inputModality]);
    return <WorkspaceMenuContext.Provider value={value}>{children}</WorkspaceMenuContext.Provider>;
}
WorkspaceMenuProvider.propTypes = { children: PropTypes.node };
