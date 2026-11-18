import { QRCodeSVG } from 'qrcode.react';
import Button from '../../../../../frontend/src/components/common/Button';
import { CheckCircleOutlined } from '../../../../../frontend/src/components/common/icons';

export default function MockWaiting({ qr = false }) {
    return <div className="marketing-waiting-preview">
        <div className="marketing-demo-store"><span>서촌의 작은 카페</span><strong>{qr ? '방문을 확인해요' : '내 순서를 확인해요'}</strong></div>
        {qr ? <>
            <div className="marketing-demo-qr"><QRCodeSVG value="https://app.reserve.it.kr/stores" size={156} marginSize={2} /></div>
            <p>직원에게 입장 QR을 보여주세요.</p>
            <div className="marketing-demo-check"><CheckCircleOutlined /> 방문 확인</div>
            <div className="marketing-demo-summary"><span>방문 확인</span><strong>QR 체크인</strong></div>
        </> : <>
            <div className="marketing-demo-ticket"><span>내 대기 번호</span><strong>12</strong><p>앞에 <b>2팀</b>이 기다리고 있어요.</p></div>
            <div className="marketing-demo-summary"><span>접수 인원</span><strong>2명</strong></div>
            <div className="marketing-demo-summary"><span>현재 상태</span><strong>대기 중</strong></div>
            <p>호출되면 입장 QR을 확인해요.</p>
            <Button variant="primary" block>내 입장 QR 보기</Button>
        </>}
    </div>;
}

export function MockArrivalQr() { return <MockWaiting qr />; }
