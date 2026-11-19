import Button from '../../../../frontend/src/components/common/Button';
import { ArrowLeftOutlined, SearchOutlined, UserOutlined, SyncOutlined, MinusOutlined, PlusOutlined } from '../../../../frontend/src/components/common/icons';
import { QRCodeSVG } from 'qrcode.react';
import MarketingStoreCard from './mockups/MarketingStoreCard';
import { STORE_DATA } from '../Home.data';

function DemoHeader({ explore }) {
    return <>
        <div className="marketing-demo-header">
            {!explore && <button type="button" disabled className="marketing-demo-nav" aria-label="시연에서는 뒤로 이동하지 않아요"><ArrowLeftOutlined /></button>}
            <button type="button" disabled className="marketing-demo-brand" aria-label="시연에서는 홈으로 이동하지 않아요">RESERVE</button>
            <button type="button" disabled className="marketing-demo-nav" aria-label="시연에서는 통합 검색으로 이동하지 않아요"><SearchOutlined /></button>
            <button type="button" disabled className="marketing-demo-nav" aria-label="시연에서는 프로필로 이동하지 않아요"><UserOutlined /></button>
        </div>
        {explore && <div className="marketing-demo-tabs" aria-label="시연 페이지">
            {['홈', '탐색', '혜택', '웨이팅', '피드'].map(label => <button type="button" disabled key={label} aria-current={label === '탐색' ? 'page' : undefined}>{label}</button>)}
        </div>}
    </>;
}

function Reset() {
    return <Button variant="ghost-sm" size="md" data-demo-action="reset" aria-label="시연 초기화"><SyncOutlined /></Button>;
}

function ExploreDemo() {
    return <>
        <div className="marketing-demo-tools">
            <label className="marketing-demo-search"><SearchOutlined /><input type="search" data-demo-field="search" aria-label="가게 검색 시연" placeholder="가게 검색" /></label><Reset />
        </div>
        <select className="marketing-demo-select" data-demo-field="category" aria-label="분야 필터 시연" defaultValue="ALL"><option value="ALL">전체 분야</option><option value="필라테스">필라테스</option><option value="헤어">헤어</option></select>
        <div className="marketing-demo-stores">{STORE_DATA.map(store => <div key={store.name} data-demo-store data-name={store.name} data-category={store.category}><MarketingStoreCard store={store} /></div>)}</div>
        <p className="marketing-demo-empty" data-demo-empty hidden>조건에 맞는 가게가 없어요.</p>
    </>;
}

function BookingDemo() {
    return <div role="form" aria-label="예약 입력 시연" className="marketing-demo-booking">
        <div className="marketing-demo-heading"><h3>예약하기</h3><Reset /></div>
        <label className="marketing-demo-field-label">예약 날짜<input className="marketing-demo-input" type="date" data-demo-field="date" required /></label>
        <fieldset className="marketing-demo-times"><legend>예약 시간</legend>{['10:00', '11:00', '14:00', '15:00'].map(time => <label key={time}><input type="radio" name="booking-time" value={time} data-demo-field="time" /><span>{time}</span></label>)}</fieldset>
        <div className="marketing-demo-field-label">인원 수<div className="marketing-demo-guests"><output data-demo-guests>1명</output><button type="button" data-demo-adjust="-1" disabled aria-label="인원 줄이기"><MinusOutlined /></button><button type="button" data-demo-adjust="1" aria-label="인원 늘리기"><PlusOutlined /></button></div></div>
        <label className="marketing-demo-field-label">요청 사항<textarea className="marketing-demo-input" data-demo-field="request" rows="2" maxLength="200" placeholder="요청 사항을 입력하세요." /></label>
        <label className="marketing-demo-consent"><input type="checkbox" data-demo-consent />[필수] 예약·취소·환불 조건을 확인했어요.</label>
        <label className="marketing-demo-consent"><input type="checkbox" data-demo-consent />[필수] 가게에 예약 정보 제공에 동의해요.</label>
        <Button variant="primary" block data-demo-action="booking-submit">예약 시연하기</Button>
    </div>;
}

function ReservationsDemo() {
    return <>
        <div className="marketing-demo-heading"><h3>내 예약 확인</h3><Reset /></div>
        <select className="marketing-demo-select" data-demo-field="reservation-status" aria-label="예약 상태 시연" defaultValue="ALL"><option value="ALL">전체 상태</option><option value="CONFIRMED">예약 확정</option><option value="CANCELLED">취소</option></select>
        <article className="marketing-demo-reservation" data-demo-reservation data-status="CONFIRMED">
            <img src="/images/pilates.jpg" alt="" width="400" height="267" />
            <h4>모던 필라테스 스튜디오</h4><strong data-demo-reservation-label>예약 확정</strong>
            <p><span data-demo-reservation-date>다음 방문일</span> · 14:00 · 2명</p>
            <div className="marketing-demo-reservation-actions"><Button variant="ghost-sm" data-demo-action="reservation-cancel">취소</Button></div>
            <div className="marketing-demo-cancel" data-demo-cancel hidden><p>예시 예약을 취소할까요?</p><Button size="sm" variant="danger" data-demo-action="reservation-confirm">취소 확인</Button><Button size="sm" variant="ghost-sm" data-demo-action="reservation-keep">돌아가기</Button></div>
        </article><p className="marketing-demo-empty" data-demo-empty hidden>조건에 맞는 예약이 없어요.</p>
    </>;
}

function DemoQr({ waiting = false }) {
    return <div className="marketing-demo-qr-view" data-demo-view="qr" hidden={waiting}>
        <h3 tabIndex="-1">{waiting ? '웨이팅 입장 QR' : '방문 체크인 QR'}</h3>
        <div className="marketing-demo-qr-plate">{[1, 2].map(version => <div key={version} data-demo-qr={version} hidden={version !== 1}><QRCodeSVG value={`https://app.reserve.it.kr/stores?demo=${version}`} size={260} marginSize={4} level="M" /></div>)}</div>
        <p>호출 후 직원에게 QR을 보여주세요.</p>
        <div className="marketing-demo-qr-actions"><Button variant="ghost-sm" data-demo-action="qr-refresh">새 QR 보기</Button><Button variant="primary" block data-demo-action="qr-checkin">체크인 시연하기</Button>{waiting && <Button variant="ghost-sm" data-demo-action="waiting-back">대기 순서로 돌아가기</Button>}</div>
    </div>;
}

function WaitingDemo() {
    return <>
        <div data-demo-view="queue">
            <div className="marketing-demo-heading"><h3 tabIndex="-1">내 웨이팅</h3><Reset /></div>
            <p>서촌의 작은 카페</p>
            <div className="marketing-demo-ticket"><span>내 대기 번호</span><strong>12</strong><p data-demo-teams>앞에 2팀이 기다리고 있어요.</p></div>
            <div className="marketing-demo-summary"><span>접수 인원</span><strong>2명</strong></div>
            <div className="marketing-demo-summary"><span>현재 상태</span><strong data-demo-waiting-status>대기 중</strong></div>
            <Button variant="primary" block data-demo-action="waiting-call">호출 시연하기</Button>
            <Button variant="primary" block data-demo-action="waiting-qr" hidden>입장 QR 보기</Button>
        </div>
        <DemoQr waiting />
    </>;
}

export default function MarketingDemo({ kind }) {
    return <div className="marketing-phone-demo" data-marketing-demo={kind}>
        <DemoHeader explore={kind === 'explore'} />
        <div className="marketing-demo-content" tabIndex="0" aria-label="시연 화면 스크롤 영역">
            {kind === 'explore' ? <ExploreDemo /> : kind === 'booking' ? <BookingDemo /> : kind === 'reservations' ? <ReservationsDemo /> : kind === 'waiting' ? <WaitingDemo /> : <><div className="marketing-demo-heading"><span /><Reset /></div><DemoQr /></>}
            <p className="marketing-demo-feedback" role="status" aria-live="polite" aria-atomic="true" data-demo-feedback />
        </div>
    </div>;
}
