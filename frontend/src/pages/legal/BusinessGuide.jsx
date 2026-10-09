import GuidePage, { GuideLinks, GuideParagraph } from './GuidePage';

export default function BusinessGuide() {
    return <GuidePage pathname="/guide/business" sections={{
        register: <>
            <GuideParagraph>가게 등록과 파트너 패널은 사업자 권한으로 이용해요. 아직 사업자 계정이 아니라면 마이페이지에서 사업자 인증을 신청하고 승인 상태를 확인해주세요.</GuideParagraph>
            <GuideParagraph>내 가게에서 가게 등록을 시작해 서비스 분야, 이름, 위치와 운영 정보를 입력해요. 예약·웨이팅 중 사용할 방식을 선택하고 화면의 안내에 따라 필요한 항목을 입력한 뒤 미리보기와 최종 내용을 확인해 등록해주세요.</GuideParagraph>
            <GuideParagraph>업종, 접수 방식, 예약 방식, 웨이팅, 영업 일정, 예약 접수 규칙, 노쇼 예약금·결제, 취소·환불 정책, 소개·사진의 9개 영역으로 나누어 설정해요. 선택한 접수 방식에 필요한 질문만 이어져요. 예약금을 받지 않으면 결제·환불 항목을 입력하지 않아도 돼요.</GuideParagraph>
            <GuideLinks links={[{ to: '/my-page', label: '사업자 인증 확인하기' }, { to: '/store/register', label: '가게 등록하기' }, { to: '/my-stores', label: '내 가게 관리하기' }]} />
        </>,
        edit: <>
            <GuideParagraph>내 가게에서 수정할 가게를 선택해 9개 영역 중 바꿀 항목을 고르세요. 해당 질문을 수정한 뒤 미리보기에서 확인하고 수정 완료로 저장해요. 미리보기의 수정 버튼은 그 항목의 질문으로 이동해요. 예약 방식과 웨이팅의 현장 QR·원격 접수 설정도 여기에서 확인할 수 있어요.</GuideParagraph>
            <GuideParagraph>예약 마감의 제한 없음은 등록·수정 모두 사용할 수 있어요. 날짜는 직접 입력하거나 달력에서 고르고, 시간은 00시부터 23시까지의 24시간제로 선택해요. 예약금이 있을 때만 결제 시점을 고르며 나중 결제를 허용할 때 결제 마감을 설정해요.</GuideParagraph>
            <GuideParagraph>가게의 접수 중지 선택은 새 예약과 웨이팅 접수를 끄는 설정이에요. 기존 예약과 대기 내역은 관리 화면에서 계속 확인하고 처리해주세요.</GuideParagraph>
            <GuideLinks links={[{ to: '/my-stores', label: '가게 수정 열기' }]} />
        </>,
        reservation: <>
            <GuideParagraph>파트너 패널의 예약 관리에서 가게와 예약 상태를 고르거나 예약자를 검색해요. 각 예약의 상태에 따라 표시되는 승인·거절·취소·완료 등의 처리 버튼을 이용하고, 결제와 환불 상태도 함께 확인해주세요.</GuideParagraph>
            <GuideLinks links={[{ to: '/business?tab=reservations', label: '예약 관리 열기' }]} />
        </>,
        waiting: <>
            <GuideParagraph>파트너 패널의 웨이팅에서 가게를 선택하고 이름·대기번호·상태로 명단을 확인해요. 직원이 직접 대기 접수를 등록하거나, 대기 중인 팀을 호출하고 호출된 팀을 입장 처리할 수 있어요.</GuideParagraph>
            <GuideParagraph>접수 중지를 선택하면 새 웨이팅 접수를 잠시 멈춰요. 기존 대기는 유지되어 호출·입장 처리가 가능하며, 다시 받을 때는 접수 시작을 선택해요. 취소할 접수는 번호와 상태를 확인해주세요.</GuideParagraph>
            <GuideLinks links={[{ to: '/business?tab=waiting', label: '웨이팅 명단 열기' }]} />
        </>,
        qr: <>
            <GuideParagraph>현장 QR 접수를 사용하는 가게는 웨이팅 화면에서 현장 접수 QR을 열어 도착한 손님에게 안내해요. 손님은 스캔 후 로그인과 접수 절차를 마쳐야 대기 명단에 등록돼요.</GuideParagraph>
            <GuideParagraph>예약의 방문 체크인 QR이나 호출된 웨이팅의 입장 QR은 파트너 패널의 QR 체크인에서 스캔해요. 카메라 사용을 허용하고 처리 결과를 확인해주세요. 현장 접수 QR은 손님이 접수를 시작할 때 쓰는 QR이에요.</GuideParagraph>
            <GuideLinks links={[{ to: '/business?tab=qr-checkin', label: 'QR 체크인 열기' }]} />
        </>,
        promotion: <>
            <GuideParagraph>광고 관리에서 가게별 광고 유형과 노출 기간을 선택해 신청·결제·상태를 관리해요. 현재 금액과 노출·취소 조건은 신청 화면에서 확인해주세요.</GuideParagraph>
            <GuideParagraph>채팅 관리에서 가게별 공지사항·인사말·자주 묻는 질문을 설정하고, 손님과의 대화는 메시지 화면에서 확인해요.</GuideParagraph>
            <GuideLinks links={[{ to: '/business?tab=ads', label: '광고 관리 열기' }, { to: '/business?tab=chat-intro', label: '채팅 관리 열기' }, { to: '/messages', label: '메시지 확인하기' }]} />
        </>,
    }} />;
}
