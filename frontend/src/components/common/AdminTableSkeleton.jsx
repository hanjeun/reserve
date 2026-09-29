import PropTypes from 'prop-types';
import { Pagination } from 'antd';
import AdminTableSkeletonTable from './AdminTableSkeletonTable';

/* ─────────────────────────────────────────────
   AdminTableSkeleton — 관리자/사업자 패널 테이블 로딩용
   표 본문(컬럼 폭 계산 포함)은 AdminTableSkeletonTable 에 있다. 여기서는 페이지 버튼만 덧붙인다.
───────────────────────────────────────────── */
const AdminTableSkeleton = ({ pagination = null, ...table }) => (
  <div>
    <AdminTableSkeletonTable {...table} />

    {/* 페이지네이션 — 스켈레톤 중에도 유지한다 (2026-07 추가)
        예전엔 스켈레톤이 <DataTable>을 통째로 대체해서 페이지 버튼까지 같이 사라졌다 —
        페이지를 넘길 때마다 방금 누른 버튼이 사라졌다 다시 나타나는 게 오히려 어색했다.
        페이지 버튼은 total/current만 알면 그릴 수 있고, keepPreviousData 덕에 그 값은 이미 알고 있다.
        로딩 중엔 누를 수 없게 disabled 처리한다. */}
    {pagination && (
      <Pagination
        disabled
        current={pagination.current}
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
