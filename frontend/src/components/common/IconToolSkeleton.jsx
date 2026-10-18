import PropTypes from 'prop-types';
import Bone from './Bone';

/** Match the visible 32px surface while retaining the real tool's 44px layout slot. */
export default function IconToolSkeleton({ kind = 'tool', style }) {
    return <span className="reserve-icon-tool reserve-icon-tool--skeleton" data-icon-kind={kind} style={style} aria-hidden="true">
        <Bone width={32} height={32} borderRadius={kind === 'navigation' ? '50%' : 10} />
    </span>;
}
IconToolSkeleton.propTypes = { kind: PropTypes.oneOf(['tool', 'navigation']), style: PropTypes.object };
