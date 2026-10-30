import { useState } from 'react';
import PropTypes from 'prop-types';
import { Checkbox, Form, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import Button from '../common/Button';
import ResponsiveModal from '../common/ResponsiveModal';
import ReservationConsentNotice from '../../pages/legal/ReservationConsentNotice';

function ConsentChoice({ value, onChange, notice, pending, failed, retry }) {
    const [open, setOpen] = useState(false);
    const details = notice?.details;
    const ready = notice?.enabled && !pending && !failed;
    const choice = key => event => onChange?.({
        ...(value?.noticeHash === notice.hash ? value : {}), version: notice.version, noticeHash: notice.hash, [key]: event.target.checked,
    });
    const matches = value?.noticeHash === notice?.hash;
    return <>
        {pending || failed ? <div className="reserve-reservation-consent-status">
            <Typography.Text type="secondary">{failed ? '예약 안내를 불러오지 못했어요.' : '예약 안내를 확인하고 있어요.'}</Typography.Text>
            {failed && <Button variant="ghost-sm" onClick={retry}>다시 불러오기</Button>}
        </div> : <>
            <div className="reserve-reservation-consent">
                <Checkbox checked={matches && Boolean(value?.conditionsAccepted)} disabled={!ready} onChange={choice('conditionsAccepted')}>
                    [필수] 예약·취소·환불 조건을 확인했어요.
                </Checkbox>
                <Checkbox checked={matches && Boolean(value?.privacyAccepted)} disabled={!ready} onChange={choice('privacyAccepted')}>
                    [필수] 가게에 예약 정보를 제공하는 데 동의해요.
                </Checkbox>
                <div className="reserve-auth-secondary-actions"><Button variant="ghost-sm" onClick={() => setOpen(true)}>예약 및 개인정보 제공 안내</Button></div>
            </div>
            <ResponsiveModal open={open} title="예약 및 개인정보 제공 안내" onCancel={() => setOpen(false)}
                footer={<Button variant="outline" size="sm" onClick={() => setOpen(false)}>닫기</Button>}>
                {details && <ReservationConsentNotice details={details} />}
            </ResponsiveModal>
        </>}
    </>;
}
ConsentChoice.propTypes = { value: PropTypes.object, onChange: PropTypes.func, notice: PropTypes.object,
    pending: PropTypes.bool, failed: PropTypes.bool, retry: PropTypes.func };

function ConsentQueryField({ storeId, member, revision }) {
    const query = useQuery({
        queryKey: ['reservation-consent', member, revision, storeId],
        queryFn: ({ signal }) => api.get('/api/reservations/notices/' + storeId, { signal }),
        enabled: true,
        staleTime: 30_000, retry: false,
    });
    if (query.data?.enabled === false) return null;
    return <Form.Item name="legalConsent" rules={[{ validator: (_, value) => {
        if (query.isPending || query.isError || !query.data?.enabled) return Promise.reject(new Error('예약 안내를 먼저 확인해주세요.'));
        if (!value?.privacyAccepted || !value?.conditionsAccepted || value.noticeHash !== query.data.hash)
            return Promise.reject(new Error('예약 조건과 개인정보 제공 안내를 확인하고 동의해주세요.'));
        return Promise.resolve();
    } }]}>
        <ConsentChoice notice={query.data} pending={query.isPending} failed={query.isError} retry={() => query.refetch()} />
    </Form.Item>;
}
ConsentQueryField.propTypes = { storeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired, member: PropTypes.number.isRequired, revision: PropTypes.number };
export default function ReservationConsentField({ storeId, disabled = false }) {
    const member = useAuthStore(state => state.user?.id);
    const revision = useAuthStore(state => state.sessionRevision);
    return disabled || !member || !storeId ? null : <ConsentQueryField storeId={storeId} member={member} revision={revision} />;
}
ReservationConsentField.propTypes = { storeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), disabled: PropTypes.bool };
