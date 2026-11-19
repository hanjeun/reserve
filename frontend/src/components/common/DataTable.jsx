import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { renderPaginationItem } from './paginationItem';
import { Table } from 'antd';
import DataState from './DataState';
import AnimatedContent from './AnimatedContent';
import Pagination from './Pagination';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { DEFAULT_PAGE_SIZE, MOBILE_PAGINATION_BREAKPOINT } from '../../constants/pagination';

/*
 * 서버 전체 건수를 pagination.total로 전달한다. fitContent는 고정 너비 열만 있는 표, stickyFirstColumn은 명시적 너비의 식별 열에 사용한다.
 */
const DataTable = ({ pageSize = DEFAULT_PAGE_SIZE, pagination, size = 'middle', fitContent = false, stickyFirstColumn = false, columns, className, locale, onChange, ...rest }) => {
    const isMobile = useWindowWidth() < MOBILE_PAGINATION_BREAKPOINT;
    const [changes, setChanges] = useState(0);
    const page = pagination?.current;
    const waiting = Boolean(rest.loading) && rest.loading?.spinning !== false;
    const changeTable = (next, filters, sorter, extra) => {
        if (extra?.action !== 'paginate' || page == null) setChanges(value => value + 1);
        onChange?.(next, filters, sorter, extra);
    };

    const paginationConfig = pagination === false ? false : {
        pageSize,
        showSizeChanger: false,
        // 모바일에서는 페이지 버튼 수를 줄여 가로 공간을 확보한다.
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
        <AnimatedContent className="reserve-data-table-motion" motionKey={`${page ?? ''}:${changes}`} ready={!waiting} motionTarget=".ant-table"><Table
            size={size}
            tableLayout="fixed"
            scroll={{ x: 'max-content' }}
            className={[fitContent ? 'reserve-table-fit-content' : '', className].filter(Boolean).join(' ') || undefined}
            pagination={paginationConfig}
            columns={resolvedColumns}
            {...rest}
            onChange={changeTable}
            locale={{ ...locale, emptyText: resolvedEmptyText }}
        /></AnimatedContent>
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
    /** 관리자·사업자 표의 기본 여백은 middle로 맞춘다. */
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
    onChange: PropTypes.func,
};

export default DataTable;

/** 본문을 교체하는 서버 표에서도 페이지 버튼의 DOM과 포커스를 유지한다. */
export function PagedDataTable({ placeholder, pagination, ...table }) {
    const isMobile = useWindowWidth() < MOBILE_PAGINATION_BREAKPOINT;
    return <>
        <AnimatedContent motionKey={String(pagination.current ?? 1)} ready={!placeholder}
            keepResultsHeight={pagination.total > (pagination.pageSize ?? DEFAULT_PAGE_SIZE)} aria-busy={Boolean(placeholder)}>
            {placeholder || <DataTable {...table} pagination={false} />}
        </AnimatedContent>
        {pagination.total > 0 && <Pagination className="reserve-data-table-pagination" showLessItems={isMobile}
            align="center" pageSize={DEFAULT_PAGE_SIZE} showSizeChanger={false} {...pagination} />}
    </>;
}
PagedDataTable.propTypes = { placeholder: PropTypes.node, pagination: PropTypes.object.isRequired };
