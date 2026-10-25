import { useLocation } from 'react-router-dom';
import useServiceAdmission from '../../hooks/useServiceAdmission';
import ResponsiveModal from './ResponsiveModal';
import Button from './Button';
import DataState from './DataState';
import LoadingStatus from './LoadingStatus';
import { SpinIndicator } from './Loading';
import { ModalActionGroup } from './ModalActions';
import AdmissionWaitingStatus from './AdmissionWaitingStatus';
import AnimatedContent from './AnimatedContent';
import { listRequestErrorKind } from '../../utils/listErrorMessage';
import { colors, spacing, fontSize, fontWeight } from '../../styles/tokens';

const preservedPage = path => /^\/(?:oauth2\/callback|payment(?:\/|$)|my-reservations(?:\/|$)|my-page(?:\/|$)|login(?:\/|$)|signup(?:\/|$)|forgot-password(?:\/|$)|admin(?:\/|$))/.test(path);
const coreWorkPage = path => /^\/store\/(?:[0-9]+|register)\/?$/.test(path) || /^\/waiting\/?$/.test(path);
const terminal = {
    EXPIRED: ['입장 시간이 지났어요.', '작성한 내용은 그대로예요. 다시 대기한 뒤 계속해주세요.'],
    CANCELLED: ['입장 대기를 취소했어요.', '원하시면 다시 대기할 수 있어요.'],
    FULL: ['현재 입장 대기가 가득 찼어요.', '잠시 후 다시 대기해주세요.'],
    NOT_JOINED: ['서비스 입장을 기다려주세요.', '다시 확인하면 입장 대기를 시작해요.'],
};

export default function ServiceAdmissionController() {
    const { pathname, search } = useLocation();
    const editingReservation = /^\/store\/[0-9]+\/?$/.test(pathname) && new URLSearchParams(search).has('edit');
    const entryAllowed = !preservedPage(pathname) && !editingReservation;
    const admission = useServiceAdmission({ workActive: coreWorkPage(pathname) && !editingReservation, entryAllowed });
    const { status, error, busy } = admission;
    const state = status?.state;
    const cancellable = ['WAITING', 'ADMITTED'].includes(state);
    let content;
    if (error) content = <DataState state="error" subject="서비스 입장" error={error}
        description="작성한 내용과 입장 정보는 유지돼요. 잠시 후 다시 확인해주세요." onRetry={admission.retry} retrying={busy} />;
    else if (state === 'WAITING') content = <AdmissionWaitingStatus position={status.position} caption="내 입장 순번"
        description={status.mode === 'CORE' ? '예약·신청을 순서대로 도와드리고 있어요. 다른 페이지는 계속 이용할 수 있어요.' : '접속자가 많아 순서대로 입장하고 있어요.'}
        appearance={{ container: styles.status, caption: styles.description, position: styles.position, description: styles.description }} />;
    else if (state === 'ADMITTED' || state === 'BYPASS') content = <div style={styles.status}>
        <strong role="status" style={styles.heading}>이어서 이용할 수 있어요.</strong>
        <p style={styles.description}>작성한 내용을 확인한 뒤 예약·신청 버튼을 다시 눌러주세요.</p>
    </div>;
    else if (terminal[state]) content = <DataState state="empty" title={terminal[state][0]} description={terminal[state][1]}
        action={<Button variant="ghost" size="sm" onClick={admission.retry} loading={busy}>다시 대기하기</Button>} />;
    else content = <LoadingStatus aria-label="서비스 입장 상태를 확인하는 중" aria-busy="true">
        <div style={styles.loading}><SpinIndicator /><span>입장 상태를 확인하고 있어요.</span></div>
    </LoadingStatus>;
    return <ResponsiveModal title="서비스 입장 대기" open={Boolean(admission.open && entryAllowed)} onCancel={admission.close}
        centered width={480} mobileSize="content" closable={false} mask={{ closable: false }} keyboard={false} footer={<ModalActionGroup>
            <Button variant="outline" size="sm" onClick={cancellable ? admission.cancel : admission.close} disabled={busy}>
                {cancellable ? '대기 취소' : '닫기'}
            </Button>
            {['ADMITTED', 'BYPASS'].includes(state) && <Button size="sm" onClick={admission.close}>계속 이용하기</Button>}
        </ModalActionGroup>}>
        <AnimatedContent motionKey={error ? `error:${listRequestErrorKind(error)}` : state || 'LOADING'} direction="down">{content}</AnimatedContent>
        {cancellable && <p className="reserve-admission-note" style={styles.note}>취소해도 작성한 내용은 유지돼요.</p>}
    </ResponsiveModal>;
}
const styles = {
    status: { textAlign: 'center', padding: `${spacing[6]} 0` },
    position: { display: 'block', color: colors.primary.main, fontSize: fontSize['5xl'], fontWeight: fontWeight.bold, margin: `${spacing[3]} 0` },
    heading: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold },
    description: { color: colors.text.secondary, fontSize: fontSize.sm, margin: `${spacing[3]} 0`, lineHeight: 1.6 },
    note: { color: colors.text.tertiary, fontSize: fontSize.xs, margin: `${spacing[4]} 0 0`, lineHeight: 1.6, whiteSpace: 'nowrap' },
    loading: { display: 'flex', justifyContent: 'center', gap: spacing[3], padding: `${spacing[7]} 0` },
};
