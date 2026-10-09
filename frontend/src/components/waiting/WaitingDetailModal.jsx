import { useState } from 'react';
import PropTypes from 'prop-types';
import ResponsiveModal from '../common/ResponsiveModal';
import TextLink from '../common/TextLink';

const STATUS_LABELS = { WAITING: '대기 중', CALLED: '호출됨', SEATED: '입장 완료', CANCELLED: '취소됨' };
const KST_DATE_TIME = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const dateTimeLabel = value => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? KST_DATE_TIME.format(date) : '확인할 수 없어요.';
};

/** 조회 권한이 확인된 기존 목록의 접수만 표시한다. 회원 연락처나 QR 토큰은 받지 않는다. */
export default function WaitingDetailModal({ detail, open, onClose }) {
    const [cached, setCached] = useState(detail);
    if (detail && detail !== cached) setCached(detail);
    const displayed = detail ?? cached;
    if (!displayed) return null;
    const { entry, storeName, teamsAhead } = displayed;
    const personal = Number.isFinite(teamsAhead);
    const progress = entry.status === 'WAITING'
        ? personal ? `내 앞에 ${teamsAhead}팀이 있어요.` : '호출을 기다리고 있어요.'
        : entry.status === 'CALLED' ? '호출된 접수예요. 입장 QR을 직원에게 보여주세요.'
            : entry.status === 'SEATED' ? '입장이 완료됐어요.' : '취소한 접수예요.';
    return <ResponsiveModal title="웨이팅 상세" open={open} onCancel={onClose}
        footer={null} centered mobileSize="content">
        <div className="reserve-waiting-detail-heading">
            <strong>{storeName}</strong>
            <span className="reserve-waiting-status" data-status={entry.status}>{STATUS_LABELS[entry.status] || '상태 확인'}</span>
        </div>
        <p className="reserve-waiting-detail-progress">{progress}</p>
        <dl className="reserve-waiting-detail-fields">
            <div><dt>대기번호</dt><dd>{entry.entryNumber}번</dd></div>
            <div><dt>접수일</dt><dd>{entry.businessDate || '확인할 수 없어요.'}</dd></div>
            {entry.displayName && <div><dt>이름</dt><dd>{entry.displayName}</dd></div>}
            <div><dt>인원</dt><dd>{entry.partySize}명</dd></div>
            <div><dt>접수 시각</dt><dd>{dateTimeLabel(entry.createdAt)}</dd></div>
            {entry.calledAt && <div><dt>호출 시각</dt><dd>{dateTimeLabel(entry.calledAt)}</dd></div>}
            {entry.finishedAt && <div><dt>{entry.status === 'SEATED' ? '입장 시각' : '취소 시각'}</dt>
                <dd>{dateTimeLabel(entry.finishedAt)}</dd></div>}
        </dl>
        {entry.storeId != null && <TextLink to={`/store/${entry.storeId}`} onClick={onClose}>가게 상세 보기</TextLink>}
    </ResponsiveModal>;
}
WaitingDetailModal.propTypes = {
    detail: PropTypes.shape({ entry: PropTypes.object.isRequired, storeName: PropTypes.string, teamsAhead: PropTypes.number }),
    open: PropTypes.bool, onClose: PropTypes.func.isRequired,
};
