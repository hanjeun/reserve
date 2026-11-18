import { useState } from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { AdminTableSkeleton, Button, DataState, FormModal, PagedDataTable } from '../common';
import useAuthStore from '../../store/useAuthStore';
import serviceReportService from '../../services/serviceReportService';
import { DEFAULT_PAGE_SIZE } from '../../constants/pagination';
import ServiceReportForm from './ServiceReportForm';
import { REPORT_TYPE_LABELS, reportStateLabel } from './serviceReportLabels';

export default function MyServiceReports({ open, onClose }) {
    const memberId = useAuthStore(state => state.user?.id);
    const session = useAuthStore(state => state.sessionRevision);
    const [page, setPage] = useState(1);
    const [appeal, setAppeal] = useState(null);
    const [appealOpen, setAppealOpen] = useState(false);
    const query = useQuery({ queryKey: ['service-reports', 'mine', memberId, session, page],
        queryFn: ({ signal }) => serviceReportService.mine({ page: page - 1, size: DEFAULT_PAGE_SIZE }, signal),
        enabled: open && memberId != null,
        placeholderData: (data, previous) => previous?.queryKey[2] === memberId && previous?.queryKey[3] === session ? data : undefined });
    const columns = [
        { title: '신고', key: 'targetType', width: 116, render: (_, row) => `${REPORT_TYPE_LABELS[row.targetType]} #${row.id}` },
        { title: '상태', dataIndex: 'status', width: 100, render: reportStateLabel },
        { title: '처리 결과', dataIndex: 'decisionNote', width: 260, render: value => value || '—' },
        { title: '관리', key: 'action', width: 104, render: (_, row) => ['RESOLVED', 'DISMISSED'].includes(row.status) &&
            <Button variant="ghost-sm" onClick={() => { setAppeal(row); setAppealOpen(true); }}>이의 신청</Button> },
    ];
    return <>
        <FormModal title="내 신고" open={open} onClose={onClose} footer={null} width={720}>
            {query.error ? <DataState state="error" error={query.error} title="신고 내역을 불러오지 못했어요." onRetry={query.refetch} />
                : <PagedDataTable columns={columns} dataSource={query.data?.content ?? []} rowKey="id"
                    placeholder={query.isPending || query.isPlaceholderData ? <AdminTableSkeleton /> : null}
                    locale={{ emptyText: '신고 내역이 없어요.' }}
                    pagination={{ current: page, total: query.data?.page?.totalElements ?? query.data?.totalElements ?? 0,
                        pageSize: DEFAULT_PAGE_SIZE, hideOnSinglePage: true, onChange: setPage }} />}
        </FormModal>
        <ServiceReportForm target={appeal} open={open && appealOpen} onClose={() => setAppealOpen(false)} afterClose={() => setAppeal(null)} />
    </>;
}

MyServiceReports.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired };
