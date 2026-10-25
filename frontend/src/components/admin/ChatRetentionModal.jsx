import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Checkbox, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataState, FormDatePicker, FormField, FormModal, FormSelect, FormTextArea, ModalLoading } from '../common';
import { useMessage } from '../../hooks';
import chatRetentionService from '../../services/chatRetentionService';
import useWorkspaceAction from '../../hooks/useWorkspaceAction';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';

const CATEGORIES = [
    { value: 'UNCLASSIFIED', label: '미분류 · 파기 보류' },
    { value: 'GENERAL_REPORT', label: '일반 신고 · 처리 후 1년' },
    { value: 'CONSUMER_DISPUTE', label: '소비자 불만·거래 분쟁 · 처리 후 3년' },
    { value: 'CONTRACT_PAYMENT', label: '계약·청약철회·결제·공급 증거 · 5년' },
];

const basisDay = (iso) => {
    if (!iso) return null;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    const kst = new Date(parsed.getTime() + 9 * 60 * 60 * 1000);
    return dayjs(kst.toISOString().slice(0, 10));
};

export default function ChatRetentionModal({ reportId, onClose }) {
    const { message } = useMessage();
    const client = useQueryClient();
    const [draft, setDraft] = useState(null);
    const [validation, setValidation] = useState(null);
    const [conflictId, setConflictId] = useState(null);
    const [reloading, setReloading] = useState(false);
    const requestAction = useWorkspaceAction();
    const query = useQuery({
        queryKey: ['admin', 'chatRetention', reportId],
        queryFn: () => chatRetentionService.get(reportId),
        enabled: reportId != null,
        staleTime: 0,
    });
    const values = draft?.reportId === reportId ? draft : {
        reportId,
        revision: query.data?.revision,
        category: query.data?.category ?? 'UNCLASSIFIED',
        hold: query.data?.hold ?? false,
        retentionBasisAt: query.data?.retentionBasisAt ?? null,
        note: query.data?.note ?? '',
    };
    const error = validation?.reportId === reportId ? validation.message : '';
    const update = (patch) => { setDraft({ ...values, ...patch }); setValidation(null); };
    const save = useMutation({
        mutationFn: async ({ id, body, session }) => {
            assertCurrentSession(session); const result = await chatRetentionService.update(id, body); assertCurrentSession(session); return result;
        },
        onSuccess: async (_, variables) => {
            if (!isCurrentSession(variables.session)) return;
            await Promise.all([client.invalidateQueries({ queryKey: ['admin', 'chatRetention'] }), client.invalidateQueries({ queryKey: ['admin', 'chatReports'] })]);
            if (!isCurrentSession(variables.session)) return;
            message.success('자료 분류와 보존 설정을 저장했어요.');
            setDraft(null);
            onClose();
        },
        onError: (failure, variables) => {
            if (!isCurrentSession(variables.session) || failure.isStaleSession) return;
            if (failure.status === 409) setConflictId(variables.id);
            message.error(failure?.message || '보존 설정을 저장하지 못했어요.');
        },
    });
    const conflict = conflictId === reportId || draft?.reportId === reportId && query.data?.revision !== draft.revision;
    const reload = async () => {
        if (save.isPending || reloading || reportId == null) return;
        const session = currentSession().epoch;
        setReloading(true);
        try {
            const latest = await query.refetch(); assertCurrentSession(session);
            if (latest.isSuccess && Number.isSafeInteger(latest.data?.revision)) { setDraft(null); setValidation(null); setConflictId(null); }
        } catch { /* 조회 오류 시 기존 설정 입력을 보존한다. */ }
        finally { if (isCurrentSession(session)) setReloading(false); }
    };
    const submit = () => {
        if (reportId == null || query.isPending || query.isError || query.isFetching || save.isPending || reloading || conflict || !Number.isSafeInteger(values.revision)) return;
        if (!values.note.trim()) {
            setValidation({ reportId, message: '분류·보류를 변경하는 근거를 입력해주세요.' });
            return;
        }
        if (values.category === 'CONTRACT_PAYMENT' && !values.hold && !values.retentionBasisAt) {
            setValidation({ reportId, message: '실제 계약·결제·공급일을 선택해주세요.' });
            return;
        }
        save.mutate({ id: reportId, session: currentSession().epoch, body: {
            revision: values.revision,
            category: values.category, hold: values.hold,
            retentionBasisAt: values.category === 'CONTRACT_PAYMENT' ? values.retentionBasisAt : null,
            note: values.note.trim(),
        } });
    };
    return (
        <FormModal title={`신고 #${reportId ?? ''} 보존 설정`} open={reportId != null}
            navigationDirty={Boolean(draft?.reportId === reportId)}
            onClose={() => { if (!save.isPending && !reloading) { setDraft(null); setValidation(null); setConflictId(null); onClose(); } }}
            onSubmit={submit} submitting={save.isPending || reloading} submitText="보존 설정 저장"
            submitDisabled={query.isPending || query.isError || query.isFetching || conflict || !Number.isSafeInteger(values.revision)}>
            {query.isPending ? <ModalLoading minHeight="160px" /> : query.isError ? (
                <DataState state="error" kind="message" subject="보존 설정" error={query.error}
                    onRetry={query.refetch} retrying={query.isFetching} />
            ) : (
                <>
                    {conflict && <DataState state="error" compact title="신고 상태나 보존 설정이 바뀌었어요. 다시 불러와 검토해주세요."
                        onRetry={() => requestAction(reload, { discard: false })} retrying={reloading} />}
                    <FormField label="자료 분류">
                        <FormSelect value={values.category} options={CATEGORIES} onChange={(category) => update({ category })} />
                    </FormField>
                    {values.category === 'CONTRACT_PAYMENT' && <FormField label="실제 계약·결제·공급일 (한국 시간)">
                        <FormDatePicker value={basisDay(values.retentionBasisAt)}
                            onChange={(day) => update({ retentionBasisAt: day ? `${day.format('YYYY-MM-DD')}T00:00:00+09:00` : null })}
                            disabledDate={(day) => day.isAfter(dayjs(), 'day')} />
                    </FormField>}
                    <FormField label="파기 보류">
                        <Checkbox checked={values.hold} onChange={(event) => update({ hold: event.target.checked })}>
                            진행 중인 분쟁·조사로 파기를 보류해요
                        </Checkbox>
                    </FormField>
                    <Typography.Paragraph type="secondary">
                        미처리·미분류 신고는 자동 파기하지 않아요. 이미 확정한 법정 최소 보존기간은 분류를 바꿔도 줄어들지 않아요.
                    </Typography.Paragraph>
                    <FormField label="변경 근거" error={error}>
                        <FormTextArea value={values.note} onChange={(event) => update({ note: event.target.value })}
                            maxLength={500} rows={3} showCount placeholder="자료 분류 또는 파기 보류의 근거를 적어주세요" />
                    </FormField>
                </>
            )}
        </FormModal>
    );
}

ChatRetentionModal.propTypes = { reportId: PropTypes.number, onClose: PropTypes.func.isRequired };
