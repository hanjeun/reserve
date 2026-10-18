import { useState } from 'react';
import PropTypes from 'prop-types';
import { WorkspaceActivityContext } from './workspaceActivity';
import AnimatedContent from '../common/AnimatedContent';

/** 관리자는 방문한 작업을 보존하고, 사업자는 이전 작업을 해제한다. */
export default function WorkspacePanels({ activeKey, items, keepMounted = false }) {
    const [visited, setVisited] = useState([activeKey]);
    if (keepMounted && !visited.includes(activeKey)) setVisited([...visited, activeKey]);
    return items.filter(item => item.key === activeKey || keepMounted && visited.includes(item.key)).map(item =>
        <section key={item.key} hidden={item.key !== activeKey} inert={item.key !== activeKey || undefined}
            aria-label={item.label} data-workspace-panel={item.key}>
            <WorkspaceActivityContext.Provider value={item.key === activeKey}><AnimatedContent motionKey={activeKey} ready={item.key === activeKey}>{item.children}</AnimatedContent></WorkspaceActivityContext.Provider>
        </section>);
}
WorkspacePanels.propTypes = {
    activeKey: PropTypes.string.isRequired,
    items: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string.isRequired, label: PropTypes.string.isRequired, children: PropTypes.node })).isRequired,
    keepMounted: PropTypes.bool,
};
