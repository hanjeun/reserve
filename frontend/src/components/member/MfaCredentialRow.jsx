import PropTypes from 'prop-types';
import { Typography } from 'antd';
import IconTool from '../common/IconTool';
import { DisconnectOutlined } from '../common/icons';

export default function MfaCredentialRow({ credential, busy, lastRequired, onRemove }) {
    const name = credential.name || (credential.kind === 'PASSKEY' ? '패스키' : '인증 앱');
    return <div className="reserve-mfa-credential" role="group" aria-label={`${name} 인증 수단`}>
        <div className="reserve-mfa-credential-heading">
            <Typography.Text>{name}</Typography.Text>
            <div className="reserve-mfa-credential-tools">
                <IconTool label={`${name} 해제`} icon={<DisconnectOutlined aria-hidden="true" />} disabled={busy}
                    unavailableReason={lastRequired ? '관리자의 마지막 인증 수단은 유지해야 해요.' : ''} onClick={() => onRemove(credential.id)} />
            </div>
        </div>
    </div>;
}
MfaCredentialRow.propTypes = { credential: PropTypes.object.isRequired, busy: PropTypes.bool, lastRequired: PropTypes.bool,
    onRemove: PropTypes.func.isRequired };
