import React from 'react';
import PropTypes from 'prop-types';
import { renderPaginationItem } from './paginationItem';
import { Table } from 'antd';
import DataState from './DataState';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { DEFAULT_PAGE_SIZE, MOBILE_PAGINATION_BREAKPOINT } from '../../constants/pagination';

/*
 * 서버 전체 건수를 pagination.total로 전달한다. fitContent는 고정 너비 열만 있는 표, stickyFirstColumn은 명시적 너비의 식별 열에 사용한다.
 */
const DataTable = ({ pageSize = DEFAULT_PAGE_SIZE, pagination, size = 'middle', fitContent = false, stickyFirstColumn = false, columns, className, locale, ...rest }) => {
    const isMobile = useWindowWidth() < MOBILE_PAGINATION_BREAKPOINT;

    const paginationConfig = pagination === false ? false : {
        pageSize,
        showSizeChanger: false,
        // 모바일에선 페이지 버튼 개수와 크기를 줄인다 (위 컨벤션 주석 참고)
        showLessItems: isMobile,
        itemRender: renderPaginationItem,
        ...pagination,
    };

    // PC 에서는 고정하지 않는다 — 가로 스크롤이 없어 고정할 이유가 없고,
    // 고정하면 경계 그림자만 생겨 오히려 지저분해진다.
    const resolvedColumns = stickyFirstColumn && isMobile && Array.isArray(columns) && columns.length > 0
        ? [{ ...columns[0], fixed: 'left' }, ...columns.slice(1)]
        : columns;
    const emptyText = locale?.emptyText;
    const resolvedEmptyText = emptyText === undefined || (typeof emptyText === 'string' && emptyText.trim())
        ? <DataState state="empty" title={emptyText} />
        : emptyText;

    return (
        <Table
            size={size}
            tableLayout="fixed"
            scroll={{ x: 'max-content' }}
            className={[fitContent ? 'reserve-table-fit-content' : '', className].filter(Boolean).join(' ') || undefined}
            pagination={paginationConfig}
            columns={resolvedColumns}
            {...rest}
            locale={{ ...locale, emptyText: resolvedEmptyText }}
        />
    );
};

// components/common의 공용 컴포넌트는 PropTypes 필수 (docs/rules/code-conventions.md).
// columns/dataSource 등 나머지 Table props는 ...rest로 그대로 위임하므로 여기서 다시 선언하지 않는다 —
// 이 컴포넌트가 직접 해석하는 prop만 계약으로 명시한다.
DataTable.propTypes = {
    /** 페이지당 행 수 (pagination이 false면 무시) */
    pageSize: PropTypes.number,
    /** false면 페이지네이션 비활성, 객체면 기본 설정에 병합 */
    pagination: PropTypes.oneOfType([PropTypes.bool, PropTypes.object]),
    /** AntD Table size — 기본 middle로 통일(관리자/사업자 패널 간 여백 불일치 방지) */
    size: PropTypes.oneOf(['small', 'middle', 'large']),
    /** 모든 열이 고정폭일 때 true — 테이블이 컨테이너 전체 폭을 차지하지 않게 함 */
    fitContent: PropTypes.bool,
    /** 모바일(<576px)에서 첫 열을 왼쪽에 고정 — 첫 열이 식별 열인 테이블에만 켠다 */
    stickyFirstColumn: PropTypes.bool,
    /** AntD Table columns — stickyFirstColumn 처리를 위해 직접 받는다 */
    columns: PropTypes.array,
    className: PropTypes.string,
    /** 문자열 빈 결과는 공통 DataState로 표시하고, 사용자 정의 노드·함수는 그대로 둔다 */
    locale: PropTypes.object,
};

export default DataTable;
