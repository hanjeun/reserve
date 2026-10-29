import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, FormInput, FormSelect } from '../common';
import FormModal, { FormField } from '../common/FormModal';
import ResponsiveModal from '../common/ResponsiveModal';
import DetailInfoRows from '../common/DetailInfoRows';
import { FileTextOutlined, CheckCircleOutlined, DollarOutlined } from '../common/icons';
import useMessage from '../../hooks/useMessage';
import useAuthStore from '../../store/useAuthStore';
import { handleApiError } from '../../utils/errorHandler';
import { formatCurrency } from '../../utils';
import service from '../../services/reservationRetentionService';

const purposes = [{ value: 'DISPUTE', label: '분쟁 확인' }, { value: 'CONTRACT', label: '계약 확인' },
    { value: 'LEGAL_REQUEST', label: '법적 요청' }];
const titles = { evidence: '거래 증거 조회', hold: '예약 증거 파기 보류', release: '파기 보류 해제' };
const field = (row, key) => row?.[key] ?? row?.[key.toUpperCase()];

export default function ReservationRetentionTools({ reservationId, open }) {
    const revision = useAuthStore(state => state.sessionRevision);
    return <ReservationRetentionSession key={`${revision}:${reservationId}`} reservationId={reservationId} open={open} revision={revision} />;
}

function ReservationRetentionSession({ reservationId, open, revision }) {
    const { message } = useMessage();
    const [mode, setMode] = useState(null);
    const [displayMode, setDisplayMode] = useState('evidence');
    const [purpose, setPurpose] = useState('DISPUTE');
    const [reference, setReference] = useState('');
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [evidence, setEvidence] = useState(null);
    const [evidenceOpen, setEvidenceOpen] = useState(false);
    const guard = useRef({ generation: 0, mounted: false, open });
    const [previousOpen, setPreviousOpen] = useState(open);
    if (previousOpen !== open) {
        setPreviousOpen(open);
        if (!open) { setMode(null); setEvidenceOpen(false); setBusy(false); }
    }
    const { data, error, refetch } = useQuery({
        queryKey: ['reservation-retention', 'availability', revision],
        queryFn: service.availability, enabled: open && reservationId != null, retry: false,
    });
    useEffect(() => {
        const current = guard.current;
        current.generation++; current.mounted = true; current.open = open;
        return () => { current.generation++; current.mounted = false; };
    }, [open]);
    const show = next => { setDisplayMode(next); setMode(next); setErrors({}); };
    const submit = async () => {
        if (busy) return;
        if (mode !== 'evidence' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(reference)) {
            setErrors({ reference: '개인정보 없이 영문·숫자·밑줄·하이픈으로 사건 참조 번호를 입력해주세요.' }); return;
        }
        const request = guard.current.generation;
        const current = () => guard.current.mounted && guard.current.open && guard.current.generation === request
            && useAuthStore.getState().sessionRevision === revision;
        setBusy(true);
        try {
            if (mode === 'evidence') {
                const result = await service.evidence(reservationId, purpose);
                if (current()) { setEvidence(result); setEvidenceOpen(true); }
            } else if (mode === 'hold') {
                await service.hold(reservationId, purpose, reference);
                if (current()) message.success('예약 증거의 파기를 보류했어요.');
            } else {
                await service.release(reservationId, reference);
                if (current()) message.success('파기 보류를 해제했어요.');
            }
            if (current()) setMode(null);
        } catch (failure) { if (current()) handleApiError(failure, message); }
        finally { if (current()) setBusy(false); }
    };
    if (reservationId == null || !data?.enabled && !error) return null;
    if (error) return open ? <Button variant="ghost-sm" onClick={() => void refetch()}>증거 조회 준비 상태 다시 확인</Button> : null;
    const proof = evidence?.consent?.[0];
    return <>
        {open && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {Object.entries(titles).map(([key, label]) => <Button key={key} variant="ghost-sm"
                disabled={!data.strongAuthentication} onClick={() => show(key)}>{label}</Button>)}
        </div>}
        {open && !data.strongAuthentication && <p>추가 인증을 마친 관리자만 거래 증거와 파기 보류를 관리할 수 있어요.</p>}
        <FormModal title={titles[displayMode]} open={mode != null} onClose={() => { if (!busy) setMode(null); }}
            onSubmit={submit} submitting={busy} submitText="확인">
            {displayMode !== 'release' && <FormField label="처리 목적">
                <FormSelect aria-label="처리 목적" options={purposes} value={purpose} onChange={setPurpose} />
            </FormField>}
            {displayMode !== 'evidence' && <FormField label="사건 참조 번호" error={errors.reference}>
                <FormInput aria-label="사건 참조 번호" value={reference} maxLength={80}
                    onChange={event => { setReference(event.target.value); setErrors({}); }} />
            </FormField>}
            <p>조회와 보류 처리는 접근 기록에 남아요. 이름·이메일·요청사항은 참조 번호에 입력하지 마세요.</p>
        </FormModal>
        <ResponsiveModal title="예약 거래 증거" open={evidenceOpen} onCancel={() => setEvidenceOpen(false)}
            afterClose={() => { if (!evidenceOpen) setEvidence(null); }} footer={null}>
            {evidence && <>
                <DetailInfoRows rows={[
                    { Icon: FileTextOutlined, label: '예약번호', value: evidence.reservation?.reservationCode },
                    { Icon: FileTextOutlined, label: '예약자', value: evidence.reservation?.memberName },
                    { Icon: FileTextOutlined, label: '이메일', value: evidence.reservation?.memberEmail },
                    { Icon: FileTextOutlined, label: '요청사항', value: evidence.reservation?.specialRequest || '없음' },
                    { Icon: CheckCircleOutlined, label: '동의 버전', value: field(proof, 'notice_version') || '기존 예약' },
                    { Icon: CheckCircleOutlined, label: '제공 동의', value: field(proof, 'privacy_accepted') ? '동의함' : '기록 없음' },
                    { Icon: CheckCircleOutlined, label: '조건 확인', value: field(proof, 'conditions_accepted') ? '확인함' : '기록 없음' },
                ]} />
                {(evidence.payments || []).map(payment => <DetailInfoRows key={field(payment, 'payment_id')} rows={[
                    { Icon: FileTextOutlined, label: '주문번호', value: field(payment, 'merchant_uid') },
                    { Icon: DollarOutlined, label: '결제금액', value: formatCurrency(field(payment, 'amount')) },
                    { Icon: DollarOutlined, label: '환불금액', value: formatCurrency(field(payment, 'refund_amount') || 0) },
                ]} />)}
            </>}
        </ResponsiveModal>
    </>;
}
