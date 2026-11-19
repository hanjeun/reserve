import { useState } from 'react';
import PropTypes from 'prop-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormField, FormModal, FormSelect, FormTextArea } from '../common';
import useMessage from '../../hooks/useMessage';
import { assertCurrentSession, currentSession } from '../../api/sessionScope';
import serviceReportService from '../../services/serviceReportService';
import { handleApiError } from '../../utils/errorHandler';
import { REPORT_REASONS, REPORT_REASON_LABELS, REPORT_TYPE_LABELS } from './serviceReportLabels';

export default function ServiceReportForm({ target, open, onClose, afterClose }) {
    const [reason, setReason] = useState();
    const [details, setDetails] = useState('');
    const { message } = useMessage();
    const client = useQueryClient();
    const appeal = target?.revision != null;
    const action = useMutation({
        mutationFn: async ({ body, id, epoch }) => {
            assertCurrentSession(epoch);
            const data = await (id == null ? serviceReportService.submit(body) : serviceReportService.appeal(id, body));
            assertCurrentSession(epoch);
            return data;
        },
    });
    const submit = async () => {
        if (!target || action.isPending) return;
        const epoch = currentSession().epoch;
        const body = appeal ? { details: details.trim(), revision: target.revision }
            : { type: target.type, targetId: target.id, reason, details: details.trim() };
        try {
            await action.mutateAsync({ id: appeal ? target.id : null, body, epoch });
            assertCurrentSession(epoch);
            void client.invalidateQueries({ queryKey: ['service-reports', 'mine'] });
            message.success(appeal ? '이의를 접수했어요.' : '신고를 접수했어요. 내 신고에서 진행을 확인할 수 있어요.');
            onClose();
        } catch (error) {
            if (currentSession().epoch === epoch) handleApiError(error, message);
        }
    };
    const closed = () => {
        setReason(undefined);
        setDetails('');
        afterClose?.();
    };
    return <FormModal title={appeal ? '신고 결과에 이의 신청' : `${REPORT_TYPE_LABELS[target?.type] ?? ''} 신고`}
        open={open} onClose={onClose} afterClose={closed} onSubmit={submit} submitting={action.isPending}
        submitText={appeal ? '이의 신청' : '신고하기'} submitDisabled={!details.trim() || !appeal && !reason}>
        {!appeal && <FormField label="신고 사유">
            <FormSelect aria-label="신고 사유" value={reason} onChange={setReason} placeholder="사유를 선택해주세요"
                options={(REPORT_REASONS[target?.type] ?? []).map(value => ({ value, label: REPORT_REASON_LABELS[value] }))} />
        </FormField>}
        <FormField label={appeal ? '이의 신청 내용' : '신고 내용'}>
            <FormTextArea aria-label={appeal ? '이의 신청 내용' : '신고 내용'} value={details} rows={4} maxLength={500} showCount
                onChange={event => setDetails(event.target.value)} placeholder="확인이 필요한 상황을 적어주세요." />
        </FormField>
    </FormModal>;
}

ServiceReportForm.propTypes = {
    target: PropTypes.shape({ type: PropTypes.string, id: PropTypes.number, revision: PropTypes.number }),
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    afterClose: PropTypes.func,
};
