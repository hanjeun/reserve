import PropTypes from 'prop-types';

// 가벼운 골격 원자. 페이지 청크 대기 때문에 업무 테이블/페이지 번호 코드를 미리 받지 않는다.
export default function Bone({ width = '100%', height = 14, style = {}, borderRadius }) {
    return <div className="reserve-skeleton-block" style={{ width, height, flexShrink: 0, borderRadius: borderRadius ?? 6, ...style }} />;
}
Bone.propTypes = {
    width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    style: PropTypes.object,
    borderRadius: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
