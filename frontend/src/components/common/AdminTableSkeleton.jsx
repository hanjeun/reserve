import PropTypes from 'prop-types';
import Pagination from './Pagination';
import AdminTableSkeletonTable from './AdminTableSkeletonTable';

/*   AdminTableSkeleton — 관리자/사업자 패널 테이블 로딩용
   표 본문(컬럼 폭 계산 포함)은 AdminTableSkeletonTable 에 있다. 여기서는 페이지 버튼만 덧붙인다.*/
const keepCurrentPage = () => {};

const AdminTableSkeleton = ({ pagination = null, ...table }) => (
  <div>
    <AdminTableSkeletonTable {...table} />

    {/*
     * 골격에서도 현재 페이지·전체 건수로 페이지 영역을 유지하고 이동은 막는다.
     */}
    {pagination && (
      <Pagination
        disabled
        current={pagination.current}
        onChange={keepCurrentPage}
        pageSize={pagination.pageSize}
        total={pagination.total}
        showSizeChanger={false}
        style={{ marginTop: 16 }}
      />
    )}
  </div>
);

AdminTableSkeleton.propTypes = {
  pagination: PropTypes.shape({
    current: PropTypes.number,
    pageSize: PropTypes.number,
    total: PropTypes.number,
  }),
};

export default AdminTableSkeleton;
