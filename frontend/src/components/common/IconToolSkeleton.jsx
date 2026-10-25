import PropTypes from 'prop-types';
import Bone from './Bone';

/* 44px 도구 자리는 유지하고 보이는 32px 면과 골격을 맞춘다. */
export default function IconToolSkeleton({ kind = 'tool', style }) {
    return <span className="reserve-icon-tool reserve-icon-tool--skeleton" data-icon-kind={kind} style={style} aria-hidden="true">
        <Bone width={32} height={32} borderRadius={kind === 'navigation' ? '50%' : 10} />
    </span>;
}
IconToolSkeleton.propTypes = { kind: PropTypes.oneOf(['tool', 'navigation']), style: PropTypes.object };
