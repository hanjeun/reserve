import PropTypes from 'prop-types';
import { BellOutlined } from '@ant-design/icons';
import { Button } from '../common';

const NOTES = {
    denied: '브라우저 알림 권한이 차단되어 있어요. 사이트 설정에서 변경할 수 있어요.',
    unsupported: '이 브라우저에서는 PC 세션 알림을 지원하지 않아요.',
    insecure: '보안 연결에서만 알림을 사용할 수 있어요.',
    error: '알림을 켜지 못했어요. 브라우저 설정을 확인해주세요.',
};

export default function ChatNotificationControl({ state, onEnable, onDisable }) {
    const unavailable = ['denied', 'unsupported', 'insecure', 'disposed'].includes(state.status);
    let toggleLabel = 'PC 알림 켜기';
    if (state.enabled) toggleLabel = 'PC 알림 끄기';
    else if (state.status === 'requesting') toggleLabel = '권한 확인 중';
    return (
        <section className="reserve-messenger-notification-control" aria-label="PC 세션 알림">
            <Button
                variant="ghost-sm"
                size="sm"
                icon={<BellOutlined aria-hidden="true" />}
                aria-pressed={state.enabled}
                disabled={unavailable || state.status === 'requesting'}
                onClick={state.enabled ? onDisable : onEnable}
            >{toggleLabel}</Button>
            <p><output>{NOTES[state.status] || '대화를 열어둔 동안만 알림 · 이름과 메시지 내용은 표시하지 않아요.'}</output></p>
        </section>
    );
}

ChatNotificationControl.propTypes = {
    state: PropTypes.shape({ status: PropTypes.string.isRequired, enabled: PropTypes.bool.isRequired }).isRequired,
    onEnable: PropTypes.func.isRequired,
    onDisable: PropTypes.func.isRequired,
};
