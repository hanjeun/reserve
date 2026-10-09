import PropTypes from 'prop-types';
import StateIllustration from '../common/StateIllustration';
import { qrScanErrorPresentation } from './qrScanPresentation';

const localTimestamp = value => value?.substring(0, 16).replace('T', ' ');
const waitingTimestamp = value => value ? new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value)) : null;

/** Only server-confirmed information is displayed. QR payloads and contact details never appear. */
export default function QrScanResult({ result }) {
    if (!result) return null;
    const waiting = result.kind === 'waiting';
    const checking = result.state === 'checking';
    const failed = result.state === 'error';
    const duplicate = result.state === 'duplicate';
    const presentation = failed ? qrScanErrorPresentation(result.error) : {
        icon: checking ? 'qr-ready' : 'qr-success',
        title: checking ? '체크인을 확인하고 있어요…' : duplicate ? waiting ? '이미 입장한 웨이팅이에요.' : '이미 체크인된 예약이에요.' : waiting ? '웨이팅 입장이 완료됐어요.' : '예약 체크인이 완료됐어요.',
        message: checking ? '확인이 끝날 때까지 잠시 기다려주세요.' : duplicate ? '아래에 기존 입장 기록을 보여드려요.' : '아래에 입장 기록을 보여드려요.',
    };
    const data = result.data;
    const details = !checking && !failed && data ? waiting ? [
        ['대기 번호', `${data.entryNumber}번`],
        ['고객', data.displayName || '이름 미입력'],
        ['인원', `${data.partySize}명`],
        ['영업일', data.businessDate],
        ['호출 시각', waitingTimestamp(data.calledAt)],
        ['입장 시각', waitingTimestamp(data.finishedAt)],
    ] : [
        ['가게', data.storeName],
        ['고객', data.memberName || '고객'],
        ['예약 번호', data.reservationCode],
        ['인원', data.guestCount != null ? `${data.guestCount}명` : null],
        ['예약 일시', [data.reservationDate, data.reservationTime?.substring(0, 5)].filter(Boolean).join(' ')],
        ['방문 시각', localTimestamp(data.checkedInAt)],
    ] : [];
    return <section className="reserve-qr-result" role="status" aria-live="polite" aria-busy={checking}
        data-result-state={result.state}>
        <div className="reserve-qr-result__heading">
            <StateIllustration name={presentation.icon} size="sm" />
            <div><p className="reserve-qr-result__title">{presentation.title}</p>
                {presentation.message && <p className="reserve-qr-result__description">{presentation.message}</p>}</div>
        </div>
        {details.length > 0 && <dl className="reserve-qr-result__details">
            {details.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>}
    </section>;
}
QrScanResult.propTypes = { result: PropTypes.shape({ kind: PropTypes.oneOf(['reservation', 'waiting']), state: PropTypes.oneOf(['checking', 'success', 'duplicate', 'error']).isRequired, data: PropTypes.object, error: PropTypes.any }) };
