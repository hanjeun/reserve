import AccountRecovery from './AccountRecovery';
import ForgotPassword from './ForgotPassword';

export default function RecoveryPage({ accountProtection = false }) {
    return accountProtection ? <AccountRecovery /> : <ForgotPassword />;
}
