import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Checkbox, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataState, FormDatePicker, FormField, FormModal, FormSelect, FormTextArea, ModalLoading } from '../common';
import { useMessage } from '../../hooks';
import chatRetentionService from '../../services/chatRetentionService';

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
    const query = useQuery({
        queryKey: ['admin', 'chatRetention', reportId],
        queryFn: () => chatRetentionService.get(reportId),
        enabled: reportId != null,
        staleTime: 0,
    });
    const values = draft?.reportId === reportId ? draft : {
        reportId,
        category: query.data?.category ?? 'UNCLASSIFIED',
        hold: query.data?.hold ?? false,
        retentionBasisAt: query.data?.retentionBasisAt ?? null,
        note: query.data?.note ?? '',
    };
    const error = validation?.reportId === reportId ? validation.message : '';
    const update = (patch) => { setDraft({ ...values, ...patch }); setValidation(null); };
    const save = useMutation({
        mutationFn: ({ id, body }) => chatRetentionService.update(id, body),
        onSuccess: async () => {
            await client.invalidateQueries({ queryKey: ['admin', 'chatRetention'] });
            message.success('자료 분류와 보존 설정을 저장했습니다.');
            setDraft(null);
            onClose();
        },
        onError: (failure) => message.error(failure?.message || '보존 설정을 저장하지 못했습니다.'),
    });
    const submit = () => {
        if (reportId == null || query.isPending || query.isError || save.isPending) return;
        if (!values.note.trim()) {
            setValidation({ reportId, message: '분류·보류를 변경하는 근거를 입력해주세요.' });
            return;
        }
        if (values.category === 'CONTRACT_PAYMENT' && !values.hold && !values.retentionBasisAt) {
            setValidation({ reportId, message: '실제 계약·결제·공급일을 선택해주세요.' });
            return;
        }
        save.mutate({ id: reportId, body: {
            category: values.category, hold: values.hold,
            retentionBasisAt: values.category === 'CONTRACT_PAYMENT' ? values.retentionBasisAt : null,
            note: values.note.trim(),
        } });
    };
    return (
        <FormModal title={`신고 #${reportId ?? ''} 보존 설정`} open={reportId != null}
            onClose={() => { if (!save.isPending) { setDraft(null); setValidation(null); onClose(); } }}
            onSubmit={submit} submitting={save.isPending} submitText="보존 설정 저장"
            submitDisabled={query.isPending || query.isError}>
            {query.isPending ? <ModalLoading minHeight="160px" /> : query.isError ? (
                <DataState state="error" kind="message" subject="보존 설정" error={query.error}
                    onRetry={query.refetch} retrying={query.isFetching} compact />
            ) : (
                <>
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
                            진행 중인 분쟁·조사로 파기를 보류합니다
                        </Checkbox>
                    </FormField>
                    <Typography.Paragraph type="secondary">
                        미처리·미분류 신고는 자동 파기하지 않습니다. 이미 확정한 법정 최소 보존기간은 분류를 바꿔도 줄어들지 않습니다.
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
