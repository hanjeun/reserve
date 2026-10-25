import PropTypes from 'prop-types';
import ResponsiveModal from '../common/ResponsiveModal';
import Button from '../common/Button';
import DataState from '../common/DataState';
import LoadingStatus from '../common/LoadingStatus';
import { SpinIndicator } from '../common/Loading';
import { ModalActionGroup } from '../common/ModalActions';
import AnimatedContent from '../common/AnimatedContent';
import AdmissionWaitingStatus from '../common/AdmissionWaitingStatus';
import { colors, fontSize, fontWeight, spacing } from '../../styles/tokens';
import { listRequestErrorKind } from '../../utils/listErrorMessage';

const stateCopy = {
    CLAIMED: ['예약을 처리하고 있어요.', '예약 내역에서 결과를 확인해주세요.'],
    CONSUMED: ['예약 결과를 확인해주세요.', '예약 내역에서 예약을 확인할 수 있어요.'],
    EXPIRED: ['입장 시간이 지났어요.', '다시 대기한 뒤 예약을 계속할 수 있어요.'],
    CANCELLED: ['입장 대기가 취소됐어요.', '원하시면 다시 대기할 수 있어요.'],
    CLOSED: ['입장 대기가 마감됐어요.', '다른 예약 날짜나 시간을 확인해주세요.'],
    FULL: ['현재 입장 대기가 가득 찼어요.', '잠시 후 다시 대기해주세요.'],
};
const opensAtLabel = value => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export default function AdmissionModal({ open = false, busy = false, campaign, status, error, errorStep, hasTicket = false,
    remainingSeconds, canContinue = false, onClose, onCancel, onRetry, onContinue }) {
    const state = status?.state;
    const cancellable = hasTicket && !['CLAIMED', 'CONSUMED', 'CLOSED', 'EXPIRED', 'CANCELLED'].includes(state);
    const canRejoin = ['EXPIRED', 'CANCELLED', 'FULL', 'CONSUMED'].includes(state);
    // 폴링 메타데이터·남은 시간 갱신으로 상태 전환을 재생하지 않는다.
    const contentKey = error
        ? `error:${error.admissionStorageError ? error.message : listRequestErrorKind(error)}:${errorStep || ''}:${hasTicket}`
        : state || 'LOADING';
    let content;
    if (error) {
        content = <DataState state="error" kind="reservation" subject="예약 입장" error={error}
            title={error.admissionStorageError ? error.message : undefined}
            description={hasTicket ? '입장 정보는 유지돼요. 다시 확인한 뒤 예약을 계속해주세요.' : '입장 상태를 확인하기 전에는 예약을 진행하지 않아요.'}
            onRetry={onRetry} retrying={busy} retryLabel={errorStep === 'cancel' ? '대기 취소 다시 시도' : '다시 확인'} />;
    } else if (state === 'WAITING') {
        content = <AdmissionWaitingStatus position={Number(status.position)} caption="내 대기 순번"
            description="차례가 되면 예약을 계속할 수 있어요."
            appearance={{ container: styles.status, caption: styles.caption, position: styles.position, description: styles.description }} />;
    } else if (state === 'ADMITTED') {
        content = <div style={styles.status}>
            <strong role="status" style={styles.heading}>예약할 차례예요.</strong>
            <p aria-live="off" style={styles.description}>{remainingSeconds > 0 ? `${remainingSeconds}초 안에 예약을 계속해주세요.` : '입장 가능 시간을 다시 확인하고 있어요.'}</p>
            <p style={styles.description}>예약 내용을 확인한 뒤 신청해주세요.</p>
        </div>;
    } else if (state === 'NOT_OPEN') {
        content = <DataState state="empty" kind="reservation" title="입장 시작을 기다리고 있어요."
            description={campaign?.opensAt ? `${opensAtLabel(campaign.opensAt)}부터 순서대로 입장할 수 있어요.` : undefined} />;
    } else if (stateCopy[state]) {
        content = <DataState state="empty" kind="reservation" title={stateCopy[state][0]} description={stateCopy[state][1]}
            action={canRejoin ? <Button variant="ghost" size="sm" onClick={onRetry} loading={busy}>
                {state === 'CONSUMED' ? '새 예약 대기' : '다시 대기하기'}
            </Button> : undefined} />;
    } else {
        content = <LoadingStatus aria-label="예약 입장 상태를 확인하는 중" aria-busy="true">
            <div style={styles.loading}><SpinIndicator /><span>입장 상태를 확인하고 있어요.</span></div>
        </LoadingStatus>;
    }
    return <ResponsiveModal title="예약 입장 대기" open={Boolean(open)} onCancel={onClose} centered width={480} mobileSize="content"
        closable={false} mask={{ closable: false }} keyboard={false}
        footer={<ModalActionGroup>
            <Button variant="outline" size="sm" onClick={cancellable ? onCancel : onClose} disabled={busy && cancellable}>
                {cancellable ? '대기 취소' : '닫기'}
            </Button>
            {['WAITING', 'ADMITTED'].includes(state) && <Button size="sm" onClick={onContinue} disabled={!canContinue}>예약 계속하기</Button>}
        </ModalActionGroup>}>
        <AnimatedContent motionKey={contentKey} direction="down">{content}</AnimatedContent>
        {cancellable
            && <p className="reserve-admission-note" style={styles.note}>취소해도 작성한 내용은 유지돼요.</p>}
    </ResponsiveModal>;
}

const styles = {
    status: { textAlign: 'center', padding: `${spacing[6]} 0` },
    caption: { color: colors.text.secondary, fontSize: fontSize.base, margin: 0 },
    position: { display: 'block', color: colors.primary.main, fontSize: fontSize['5xl'], fontWeight: fontWeight.bold, margin: `${spacing[3]} 0` },
    heading: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold },
    description: { color: colors.text.secondary, fontSize: fontSize.sm, margin: `${spacing[3]} 0 0`, lineHeight: 1.6 },
    note: { color: colors.text.tertiary, fontSize: fontSize.xs, lineHeight: 1.6, margin: `${spacing[4]} 0 0`, whiteSpace: 'nowrap' },
    loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing[3], padding: `${spacing[7]} 0` },
};
AdmissionModal.propTypes = { open: PropTypes.bool, busy: PropTypes.bool,
    campaign: PropTypes.shape({ opensAt: PropTypes.string }), status: PropTypes.shape({ state: PropTypes.string, position: PropTypes.number }),
    error: PropTypes.object, errorStep: PropTypes.string, hasTicket: PropTypes.bool, remainingSeconds: PropTypes.number,
    canContinue: PropTypes.bool, onClose: PropTypes.func, onCancel: PropTypes.func, onRetry: PropTypes.func, onContinue: PropTypes.func };
