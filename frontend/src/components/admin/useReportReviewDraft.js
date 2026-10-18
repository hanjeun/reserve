import { useLayoutEffect, useRef, useState } from 'react';
import { Form } from 'antd';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';
import { reportFormValues } from './managementReviewQuery';

const hasRevision = item => Number.isSafeInteger(item?.revision) && item.revision >= 0;
const validRevision = value => Number.isSafeInteger(value) && value >= 0;

/** 자동 재조회로 옛 입력에 새 버전을 붙이지 않는다. 명시적 재조회 성공 후에만 초안을 교체한다. */
export default function useReportReviewDraft({ selected, report, form, target }) {
    const [selection, setSelection] = useState({ id: selected, baseline: null, rejected: false, targetRevision: undefined, targetRejected: false });
    const [refreshing, setRefreshing] = useState(false);
    const selectedRef = useRef(selected);
    const loading = useRef(false);
    const fields = Form.useWatch([], { form, preserve: true });
    const latestTargetRevision = target ? target.data?.revision : report.data?.postRevision;
    const canConfirmTarget = !target || target.isSuccess && !target.isFetching;
    const changed = selection.id !== selected;
    const initialize = !changed && selected && !selection.baseline && report.isSuccess && !report.isFetching
        && report.data?.id === selected && hasRevision(report.data);
    let current = selection;
    if (changed) current = { id: selected, baseline: null, rejected: false, targetRevision: undefined, targetRejected: false };
    else if (initialize) current = { ...selection,
        targetRevision: canConfirmTarget && validRevision(latestTargetRevision) ? latestTargetRevision : undefined,
        baseline: { id: selected, revision: report.data.revision, values: JSON.stringify(reportFormValues(report.data)) } };
    else if (selection.baseline && selection.targetRevision === undefined && canConfirmTarget && validRevision(latestTargetRevision)) {
        current = { ...selection, targetRevision: latestTargetRevision };
    }
    if (current !== selection) setSelection(current);
    const baseline = current.baseline;
    useLayoutEffect(() => { selectedRef.current = selected; }, [selected]);
    useLayoutEffect(() => {
        if (baseline) form.setFieldsValue(JSON.parse(baseline.values));
    }, [baseline, form]);

    const ready = Boolean(selected && baseline?.id === selected);
    const dirty = Boolean(ready && fields && JSON.stringify(reportFormValues(fields)) !== baseline.values);
    const invalidVersion = Boolean(selected && report.isSuccess && !report.isFetching && !hasRevision(report.data));
    const conflict = ready && (current.rejected || report.data?.id === selected && report.data.revision !== baseline.revision);
    const targetConflict = ready && (current.targetRejected || current.targetRevision !== undefined
        && latestTargetRevision !== undefined && latestTargetRevision !== current.targetRevision);
    const reload = async () => {
        if (!selected || loading.current) return;
        const id = selected;
        const session = currentSession().epoch;
        loading.current = true; setRefreshing(true);
        try {
            const [result, targetResult] = await Promise.all([report.refetch(), target?.refetch()]);
            assertCurrentSession(session);
            if (selectedRef.current !== id || !result.isSuccess || result.data?.id !== id || !hasRevision(result.data)) return;
            const values = reportFormValues(result.data);
            const revision = target ? targetResult?.data?.revision : result.data.postRevision;
            const confirmed = (!target || targetResult?.isSuccess) && validRevision(revision);
            setSelection(current => current.id === id ? { ...current, baseline: { id, revision: result.data.revision, values: JSON.stringify(values) },
                rejected: false, targetRevision: confirmed ? revision : current.targetRevision,
                targetRejected: confirmed ? false : current.targetRejected } : current);
        } catch { /* 조회 실패에는 이전 입력·버전을 보존한다. */ }
        finally { loading.current = false; if (isCurrentSession(session)) setRefreshing(false); }
    };
    return { ready, dirty, revision: baseline?.revision, conflict, invalidVersion, refreshing, reload,
        targetRevision: current.targetRevision, targetConflict,
        acceptTarget: (id, revision) => {
            if (validRevision(revision)) setSelection(current => current.id === id ? { ...current, targetRevision: revision, targetRejected: false } : current);
        },
        rejectTarget: () => setSelection(current => ({ ...current, targetRejected: true })),
        reject: () => setSelection(current => ({ ...current, rejected: true })) };
}
