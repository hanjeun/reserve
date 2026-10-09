import GuidePage, { GuideLinks, GuideParagraph } from './GuidePage';

export default function UserGuide() {
    return <GuidePage pathname="/guide/user" sections={{
        find: <>
            <GuideParagraph>가게 탐색에서 서비스 분야와 지역을 고르거나 가게·지역·서비스를 검색해요. 가게 상세 화면에서 주소, 운영 정보와 이용할 수 있는 예약·웨이팅 방식을 확인해주세요.</GuideParagraph>
            <GuideLinks links={[{ to: '/stores', label: '가게 탐색하기' }, { to: '/search', label: '검색하기' }]} />
        </>,
        reservation: <>
            <GuideParagraph>로그인한 뒤 예약을 받는 가게에서 가능한 날짜와 시간을 선택해 예약을 신청해요. 날짜만 고르는 가게와 정해진 회차를 고르는 가게도 있으므로 화면에 표시되는 방식을 따라주세요.</GuideParagraph>
            <GuideParagraph>신청 결과와 예약 상태는 내 예약에서 확인해요. 예약금이 있는 경우 결제 안내와 마감, 변경·취소 조건을 확인해주세요. 신청 후에는 내 예약의 현재 상태에서 예약 확정과 결제 여부를 확인해요.</GuideParagraph>
            <GuideParagraph>예약금이 없는 가게에서는 결제하지 않아요. 예약금을 받는 가게는 신청할 때 결제하거나, 나중 결제를 허용한 경우 내 예약에서 결제할 수 있어요. 나중 결제에 마감이 설정되어 있으면 시간 안에 결제해주세요.</GuideParagraph>
            <GuideLinks links={[{ to: '/my-reservations', label: '내 예약 확인하기' }]} />
        </>,
        waiting: <>
            <GuideParagraph>웨이팅을 제공하는 가게에서 이용할 수 있어요. 현장 접수는 가게에 도착해 안내된 QR을 휴대폰 카메라로 스캔하고, 원격 접수는 가게 상세 화면의 버튼으로 시작해요.</GuideParagraph>
            <ol style={{ paddingLeft: 24, margin: '0 0 12px' }}>
                <li>앱에서 접수하려면 로그인해주세요. 계정이 없다면 먼저 회원가입해요.</li>
                <li>회원가입 후 홈 등 다른 화면으로 이동했다면 가게의 현장 접수 QR을 다시 스캔해주세요.</li>
                <li>함께 입장할 인원과 화면의 접수 안내를 확인하고 개인정보 제공에 동의한 뒤 접수하기를 눌러요.</li>
                <li>접수가 완료되면 내 예약의 웨이팅에서 대기 번호와 호출 상태를 확인해요.</li>
            </ol>
            <GuideParagraph>QR을 스캔하거나 회원가입하는 것만으로 접수되지 않아요. 접수가 중지됐거나 접수 안내를 확인할 수 없는 경우 화면의 안내를 따라주세요.</GuideParagraph>
            <GuideLinks links={[{ to: '/waiting', label: '웨이팅 가게 찾기' }, { to: '/login', label: '로그인하기' }, { to: '/signup', label: '회원가입하기' }]} />
        </>,
        qr: <>
            <GuideParagraph>예약이 확정되면 내 예약에 표시되는 QR 버튼에서 방문 체크인 QR을 열어 가게 직원에게 보여주세요.</GuideParagraph>
            <GuideParagraph>웨이팅은 호출된 뒤 내 웨이팅의 입장 QR을 직원에게 보여줘요. 현장 접수 QR과 입장 QR은 쓰는 단계가 달라요. QR을 확인할 수 없다면 다시 열거나 새 QR 보기를 선택해 현재 QR을 불러와주세요.</GuideParagraph>
            <GuideLinks links={[{ to: '/my-reservations?tab=waiting', label: '내 웨이팅 확인하기' }]} />
        </>,
        history: <>
            <GuideParagraph>내 예약에서 예약과 웨이팅 탭을 나누어 확인해요. 현재 상태에 따라 표시되는 결제·변경·취소·QR 버튼을 이용해주세요. 가게 이용에 관한 문의는 가게 상세의 채팅에서 시작하고 메시지 화면에서 이어서 확인할 수 있어요.</GuideParagraph>
            <GuideLinks links={[{ to: '/my-reservations', label: '내 예약 열기' }, { to: '/messages', label: '메시지 확인하기' }]} />
        </>,
    }} />;
}
