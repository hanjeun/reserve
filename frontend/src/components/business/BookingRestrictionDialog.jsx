import PropTypes from 'prop-types';
import { FormField, FormModal, FormSelect, FormTextArea } from '../common';
import DetailInfoRows from '../common/DetailInfoRows';
import { ShopOutlined, UserOutlined } from '../common/icons';

const PERIODS = [{ value: 7, label: '7일' }, { value: 30, label: '30일' }, { value: 'permanent', label: '영구 제한' }];

export default function BookingRestrictionDialog({ dialog, open, onClose, afterClose, onChange, onSubmit, submitting }) {
    const release = dialog?.member.restrictionId != null;
    const permanent = dialog?.period === 'permanent';
    return <FormModal title={release ? '수동 예약 제한 해제' : '새 예약 제한'} open={open} onClose={onClose}
        afterClose={afterClose} onSubmit={onSubmit} submitText={release ? '제한 해제' : permanent ? '영구 제한' : '예약 제한'}
        submitting={submitting} submitDisabled={!release && !dialog?.reason.trim()}>
        {dialog && <>
            <DetailInfoRows rows={[
                { Icon: ShopOutlined, label: '가게', value: dialog.storeName },
                { Icon: UserOutlined, label: '사용자', value: dialog.member.name ?? '조회 기간이 지난 사용자' },
            ]} />
            {release ? <p>이 가게의 수동 예약 제한을 해제해요. 반복 노쇼에 따른 자동 제한은 적용 기간을 따라요.</p> : <>
                <p>{permanent ? '해제할 때까지 이 가게의 새 예약을 제한해요.' : '이 가게의 새 예약만 제한해요.'}</p>
                <FormField label="제한 기간"><FormSelect aria-label="제한 기간" options={PERIODS} value={dialog.period}
                    onChange={period => onChange({ period })} /></FormField>
                <FormField label="제한 사유"><FormTextArea aria-label="제한 사유" rows={3} maxLength={200} showCount value={dialog.reason}
                    onChange={event => onChange({ reason: event.target.value })} /></FormField>
            </>}
        </>}
    </FormModal>;
}

BookingRestrictionDialog.propTypes = {
    dialog: PropTypes.shape({ member: PropTypes.object.isRequired, storeName: PropTypes.string, period: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), reason: PropTypes.string.isRequired }),
    open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, afterClose: PropTypes.func,
    onChange: PropTypes.func.isRequired, onSubmit: PropTypes.func.isRequired, submitting: PropTypes.bool,
};
