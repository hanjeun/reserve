import React from 'react';
import PropTypes from 'prop-types';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

export default function DetailInfoRows({ rows, renderValue = row => row.value, renderAction, className = '' }) {
    return <div className={'reserve-detail-info-rows ' + className} style={styles.card}>
        {rows.map((row, index) => <React.Fragment key={row.label}>
            <div style={styles.row}>
                <row.Icon aria-hidden="true" style={styles.icon} />
                <span style={styles.label}>{row.label}</span>
                <div style={{ ...styles.value, ...(row.highlight ? styles.highlight : {}) }}>{renderValue(row)}</div>
                {renderAction?.(row)}
            </div>
            {index < rows.length - 1 && <div style={styles.divider} />}
        </React.Fragment>)}
    </div>;
}
const styles = {
    card: { padding: '4px 0' },
    row: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 0' },
    icon: { fontSize: 14, color: colors.text.tertiary, flexShrink: 0, marginTop: 3 },
    label: { fontSize: fontSize.sm, color: colors.text.tertiary, flexShrink: 0, width: 'var(--reserve-info-label-width, var(--reserve-store-info-label-width, 80px))', lineHeight: '22px' },
    value: { fontSize: fontSize.sm, color: colors.text.secondary, flex: 1, minWidth: 0, overflowWrap: 'anywhere', lineHeight: '22px' },
    highlight: { color: colors.primary.main, fontWeight: fontWeight.medium },
    divider: { height: 1, background: colors.border.light },
};
DetailInfoRows.propTypes = { rows: PropTypes.array.isRequired, renderValue: PropTypes.func, renderAction: PropTypes.func, className: PropTypes.string };
