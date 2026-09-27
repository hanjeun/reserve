import React, { useId } from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { colors, radius, shadows, fontSize, fontWeight } from '../../styles/tokens';

const { Text } = Typography;

/**
 * RESERVE Design System - ChartCard
 *
 * 차트를 감싸는 둥근 카드 — StatCard와 동일한 radius/shadow 톤으로 통일.
 * 관리자 DashboardTab, 사업자 통계 탭이 공유해서 쓰는 걸 목적으로 함.
 *
 * <ChartCard title="예약 상태 분포">
 *   <ResponsiveContainer width="100%" height="100%"><PieChart>...</PieChart></ResponsiveContainer>
 * </ChartCard>
 */
const ChartCard = ({
    title,
    extra,
    children,
    height = 260,
    minWidth = 300,
    summary,
    tableColumns = [],
    tableRows = [],
}) => {
    const titleId = useId();
    const hasTable = tableColumns.length > 0 && tableRows.length > 0;

    return (
        <section style={{ ...styles.card, minWidth }} aria-labelledby={titleId}>
            <div style={styles.header}>
                <h3 id={titleId} style={styles.title}>{title}</h3>
                {extra}
            </div>
            {summary && <Text style={styles.summary}>{summary}</Text>}
            {/* Recharts SVG는 키보드·스크린리더 데이터 탐색을 제공하지 않는다.
                표가 있으면 시각 차트는 중복 낭독에서 제외하고 아래 실제 table을 대체 표현으로 둔다. */}
            <div style={{ height }} aria-hidden={hasTable ? 'true' : undefined}>
                {children}
            </div>
            {hasTable && (
                <details style={styles.details}>
                    <summary style={styles.detailsSummary}>데이터 표 보기</summary>
                    <div style={styles.tableScroller}>
                        <table style={styles.table}>
                            <caption style={styles.caption}>{title} 원본 데이터</caption>
                            <thead>
                                <tr>
                                    {tableColumns.map((column) => (
                                        <th key={column.key} scope="col" style={styles.th}>{column.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row, rowIndex) => (
                                    <tr key={row.key ?? row.id ?? row.date ?? row.name ?? rowIndex}>
                                        {tableColumns.map((column) => (
                                            <td key={column.key} style={styles.td}>
                                                {column.render ? column.render(row[column.key], row) : row[column.key]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </details>
            )}
        </section>
    );
};

const styles = {
    card: {
        background: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius['2xl'],
        boxShadow: shadows.card,
        padding: '20px 22px',
        flex: '1 1 320px',
        alignSelf: 'flex-start',
        boxSizing: 'border-box',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        margin: 0,
        fontSize: fontSize.base,
        lineHeight: 1.5,
        color: colors.text.primary,
        fontWeight: fontWeight.bold,
    },
    summary: {
        display: 'block',
        margin: '-8px 0 12px',
        color: colors.text.secondary,
        fontSize: fontSize.xs,
        lineHeight: 1.55,
    },
    details: {
        marginTop: 12,
        borderTop: `1px solid ${colors.border.light}`,
        paddingTop: 10,
    },
    detailsSummary: {
        cursor: 'pointer',
        color: colors.text.secondary,
        fontSize: fontSize.sm,
        fontWeight: fontWeight.semibold,
    },
    tableScroller: { overflowX: 'auto', marginTop: 10 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: fontSize.xs },
    caption: { textAlign: 'left', color: colors.text.tertiary, paddingBottom: 8 },
    th: {
        color: colors.text.secondary,
        fontWeight: fontWeight.semibold,
        textAlign: 'left',
        whiteSpace: 'nowrap',
        padding: '8px 10px',
        borderBottom: `1px solid ${colors.border.light}`,
    },
    td: {
        color: colors.text.primary,
        textAlign: 'left',
        whiteSpace: 'nowrap',
        padding: '8px 10px',
        borderBottom: `1px solid ${colors.border.light}`,
    },
};

ChartCard.propTypes = {
    title: PropTypes.node.isRequired,
    extra: PropTypes.node,
    children: PropTypes.node,
    height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    minWidth: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    summary: PropTypes.node,
    tableColumns: PropTypes.arrayOf(PropTypes.shape({
        key: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        render: PropTypes.func,
    })),
    tableRows: PropTypes.arrayOf(PropTypes.object),
};

export default ChartCard;
