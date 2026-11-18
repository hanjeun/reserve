import PropTypes from 'prop-types';
import { Typography } from 'antd';
import Button from '../common/Button';
import IconTool from '../common/IconTool';
import LoginSecurityPanelHeading from './LoginSecurityPanelHeading';
import { LockOutlined, LogoutOutlined, MailOutlined, MinusOutlined, MobileOutlined, SafetyCertificateOutlined } from '../common/icons';
import { LoginMethodPasswordProof, LoginMethodSocialProof } from './LoginMethodForms';
import styles from './myPageStyles';

const BROWSERS = { edge: 'Edge', firefox: 'Firefox', chrome: 'Chrome', safari: 'Safari' };
const SESSION_STATES = { ACTIVE: '로그인 중', SIGNED_OUT: '로그아웃', UNKNOWN: '확인 필요' };
const { Text } = Typography;

function deviceName({ os, browser, current, registered }) {
    if (registered === false) return current ? '현재 브라우저' : '다른 브라우저';
    const type = ['android', 'ios'].includes(os) ? '모바일' : ['windows', 'mac', 'linux'].includes(os) ? 'PC' : '등록된 브라우저';
    return BROWSERS[browser] ? `${type} · ${BROWSERS[browser]}` : type;
}

export default function RegisteredDevicesPanel({ devices, busy, status, providerName, directProof, factors,
    codesRequirePrimary, passwordSelected, onUsePassword, onBackToChoices, onProof, onSocialProof, onRegister, onForget, onSignOut, onClose }) {
    if (!devices) {
        const provider = providerName ? status.socialProvider.toLowerCase() : undefined;
        if (status.passwordEnabled && (passwordSelected || (!provider && !directProof))) {
            return <LoginMethodPasswordProof busy={busy} submitText="기기 관리 본인 확인" actionText="확인"
                description="기기를 관리하기 전에 본인 확인을 해주세요." onSubmit={onProof}
                onCancel={passwordSelected ? onBackToChoices : onClose} />;
        }
        const codeHint = codesRequirePrimary ? '연결한 로그인 수단으로 먼저 본인 확인해주세요.' : '';
        const actions = (directProof || status.passwordEnabled) && <>
            {directProof && factors?.passkey && <IconTool label="패스키로 확인" icon={<LockOutlined aria-hidden="true" />}
                disabled={busy} onClick={() => onProof(undefined, 'PASSKEY')} />}
            {directProof && factors?.totp && <IconTool label="인증 앱 코드로 확인" icon={<MobileOutlined aria-hidden="true" />}
                disabled={busy} unavailableReason={codeHint} onClick={() => onProof(undefined, 'TOTP')} />}
            {directProof && factors?.backup && <IconTool label="복구코드로 확인" icon={<SafetyCertificateOutlined aria-hidden="true" />}
                disabled={busy} unavailableReason={codeHint} onClick={() => onProof(undefined, 'BACKUP')} />}
            {directProof && !factors?.passkey && !factors?.totp && !factors?.backup && <IconTool label="등록한 인증 수단으로 확인"
                icon={<SafetyCertificateOutlined aria-hidden="true" />} disabled={busy} onClick={() => onProof()} />}
            {status.passwordEnabled && <IconTool label="비밀번호로 확인" icon={<MailOutlined aria-hidden="true" />}
                disabled={busy} onClick={onUsePassword} />}
        </>;
        const description = actions ? '기기를 관리할 인증 수단을 선택해주세요.'
            : provider ? `${providerName}로 본인 확인 후 로그인 기기를 관리할 수 있어요.` : '로그인한 방법을 확인한 뒤 다시 시도해주세요.';
        return <LoginMethodSocialProof title="로그인 기기" description={description}
            provider={provider} buttonLabel={provider ? `${providerName}로 본인 확인` : ''} actions={actions}
            disabled={busy} onConfirm={onSocialProof} onClose={onClose} />;
    }

    const canRegister = ['REMEMBERED', 'NOT_REMEMBERED'].includes(status.browserTrust);
    return <>
        <LoginSecurityPanelHeading onClose={onClose} disabled={busy}><Text strong>로그인 기기</Text></LoginSecurityPanelHeading>
        <Text style={styles.loginMethodHint}>로그인 중인 브라우저를 확인하고 다른 기기에서 로그아웃할 수 있어요.</Text>
        {canRegister && <Text style={styles.loginMethodHint}>기기 등록 해제와 로그아웃은 별도로 할 수 있어요. 만료 전에 같은 환경에서 다시 로그인하면 등록 기간이 그날부터 30일로 갱신돼요.</Text>}
        {status.browserTrust === 'DISABLED' && <Text style={styles.loginMethodHint}>접속 환경 보호를 켜면 자주 사용하는 기기도 등록할 수 있어요.</Text>}
        {devices.length === 0 && <Text style={styles.loginMethodHint}>표시할 로그인 기기가 없어요.</Text>}
        {devices.length > 0 && <ul className="reserve-registered-devices">
            {devices.map(device => {
                const name = deviceName(device);
                const registered = device.registered !== false;
                const signedIn = device.signedInAt && new Date(device.signedInAt).toLocaleString('ko-KR');
                return <li key={device.id} className="reserve-mfa-credential reserve-mfa-credential-heading">
                    <span><Text strong>{name}</Text>
                        <span className="reserve-device-session-state" data-state={device.sessionState} style={styles.loginMethodHint}>
                            {registered && device.current ? '이 기기 · ' : ''}{SESSION_STATES[device.sessionState]}{registered && ' · 등록됨'}
                            {signedIn && <> · <time dateTime={device.signedInAt}>{signedIn}</time></>}
                        </span>
                    </span>
                    <span className="reserve-mfa-credential-tools">
                        {!device.current && device.sessionState === 'ACTIVE' && <IconTool label={`${name} 로그아웃`}
                            icon={<LogoutOutlined aria-hidden="true" />} disabled={busy} onClick={() => onSignOut(device)} />}
                        {registered && <IconTool label={`${name} 등록 해제`} icon={<MinusOutlined aria-hidden="true" />}
                            disabled={busy} onClick={() => onForget(device)} />}
                    </span>
                </li>;
            })}
        </ul>}
        {canRegister && !devices.some(device => device.current && device.registered !== false)
            && <div className="reserve-mfa-management-actions reserve-mfa-management-actions--secondary">
            <Button size="sm" loading={busy} onClick={onRegister}>이 기기 등록</Button>
        </div>}
    </>;
}
RegisteredDevicesPanel.propTypes = {
    devices: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired, os: PropTypes.string, browser: PropTypes.string,
        sessionState: PropTypes.oneOf(Object.keys(SESSION_STATES)).isRequired, current: PropTypes.bool,
        registered: PropTypes.bool, signedInAt: PropTypes.string,
    })),
    busy: PropTypes.bool, status: PropTypes.object.isRequired, providerName: PropTypes.string, directProof: PropTypes.bool,
    factors: PropTypes.shape({ passkey: PropTypes.bool, totp: PropTypes.bool, backup: PropTypes.bool }),
    codesRequirePrimary: PropTypes.bool, passwordSelected: PropTypes.bool, onUsePassword: PropTypes.func.isRequired, onBackToChoices: PropTypes.func.isRequired,
    onProof: PropTypes.func.isRequired, onSocialProof: PropTypes.func.isRequired, onRegister: PropTypes.func.isRequired,
    onForget: PropTypes.func.isRequired, onSignOut: PropTypes.func.isRequired, onClose: PropTypes.func.isRequired,
};
