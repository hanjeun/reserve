import { useLayoutEffect } from 'react';
import PropTypes from 'prop-types';
import { Checkbox, Form, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigationType } from 'react-router-dom';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import Button from '../common/Button';
import TextLink from '../common/TextLink';

let pendingReturn;

function ConsentChoice({ value, onChange, notice, pending, failed, retry, storeId, onViewNotice }) {
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
                    [필수] <TextLink to={`/reservation-notice/${storeId}#conditions`} onClick={onViewNotice}>예약·취소·환불 조건</TextLink>을 확인했어요.
                </Checkbox>
                <Checkbox checked={matches && Boolean(value?.privacyAccepted)} disabled={!ready} onChange={choice('privacyAccepted')}>
                    [필수] <TextLink to={`/reservation-notice/${storeId}#sharing`} onClick={onViewNotice}>가게에 예약 정보를 제공</TextLink>하는 데 동의해요.
                </Checkbox>
            </div>
        </>}
    </>;
}
ConsentChoice.propTypes = { value: PropTypes.object, onChange: PropTypes.func, notice: PropTypes.object,
    pending: PropTypes.bool, failed: PropTypes.bool, retry: PropTypes.func, storeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), onViewNotice: PropTypes.func };

function ConsentQueryField({ storeId, member, revision }) {
    const form = Form.useFormInstance();
    const location = useLocation();
    const navigationType = useNavigationType();
    useLayoutEffect(() => {
        const saved = pendingReturn;
        if (!saved || saved.member !== member || saved.revision !== revision || Date.now() - saved.createdAt > 600_000) { pendingReturn = null; return undefined; }
        if (navigationType !== 'POP' || saved.key !== location.key) return undefined;
        const frame = requestAnimationFrame(() => {
            if (pendingReturn !== saved) return;
            pendingReturn = null;
            form.setFieldsValue(saved.values);
        });
        return () => cancelAnimationFrame(frame);
    }, [form, location.key, member, navigationType, revision]);
    const viewNotice = event => {
        event.stopPropagation();
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // 약관 왕복 동안만 입력을 메모리에 두고 다른 계정·기록에는 복원하지 않아요.
        pendingReturn = { member, revision, key: location.key, createdAt: Date.now(), values: form.getFieldsValue(true) };
    };
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
        <ConsentChoice notice={query.data} pending={query.isPending} failed={query.isError} retry={() => query.refetch()} storeId={storeId} onViewNotice={viewNotice} />
    </Form.Item>;
}
ConsentQueryField.propTypes = { storeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired, member: PropTypes.number.isRequired, revision: PropTypes.number };
export default function ReservationConsentField({ storeId, disabled = false }) {
    const member = useAuthStore(state => state.user?.id);
    const revision = useAuthStore(state => state.sessionRevision);
    return disabled || !member || !storeId ? null : <ConsentQueryField storeId={storeId} member={member} revision={revision} />;
}
ReservationConsentField.propTypes = { storeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), disabled: PropTypes.bool };
