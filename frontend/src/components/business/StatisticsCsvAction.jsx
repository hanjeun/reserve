import PropTypes from 'prop-types';
import Button from '../common/Button';
import SkeletonText from '../common/SkeletonText';
import { fontSize, fontWeight, heights, radius } from '../../styles/tokens';

export default function StatisticsCsvAction({ loading = false, disabled, onClick, 'aria-label': label }) {
    if (loading) return <span aria-hidden="true" style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
        height: heights.buttonSm, padding: '0 20px', border: '1px solid transparent', borderRadius: radius.pill,
        fontSize: fontSize.sm, fontWeight: fontWeight.bold, whiteSpace: 'nowrap',
    }}><SkeletonText>CSV 다운로드</SkeletonText></span>;
    return <Button variant="outline" size="sm" disabled={disabled} aria-label={label} onClick={onClick}>CSV 다운로드</Button>;
}

StatisticsCsvAction.propTypes = { loading: PropTypes.bool, disabled: PropTypes.bool, onClick: PropTypes.func, 'aria-label': PropTypes.string };
