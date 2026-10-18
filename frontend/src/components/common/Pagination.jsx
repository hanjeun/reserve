import PropTypes from 'prop-types';
import { Pagination as AntPagination } from 'antd';
import { renderPaginationItem } from './paginationItem';

export default function Pagination({ itemRender = renderPaginationItem, ...props }) {
    return <AntPagination {...props} itemRender={itemRender} />;
}
Pagination.propTypes = { itemRender: PropTypes.func };
