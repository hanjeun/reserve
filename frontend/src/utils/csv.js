const FORMULA_PREFIX = /^[\s\p{Cc}]*[=+@-]/u;

const csvCell = value => {
    if (value == null) return '';
    // 실제 숫자는 수식 문자열과 구분해 음수·소수도 그대로 내보낸다.
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    const text = String(value);
    const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
};

/** 표시용 render/단위·천 단위 구분 대신 각 필드의 원래 값을 CSV로 직렬화한다. */
export const serializeCsv = (columns, rows) => '\uFEFF' + [
    columns.map(column => csvCell(column.label)).join(','),
    ...rows.map(row => columns.map(column => csvCell(row[column.key])).join(',')),
].join('\r\n') + '\r\n';

export const downloadCsv = (filename, columns, rows) => {
    const url = URL.createObjectURL(new Blob([serializeCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    try { link.click(); }
    finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
};
