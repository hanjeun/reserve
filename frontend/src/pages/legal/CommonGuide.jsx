import GuidePage, { GuideLinks, GuideParagraph } from './GuidePage';

export default function CommonGuide() {
    return <GuidePage pathname="/guide/common" sections={{
        account: <>
            <GuideParagraph>가게 탐색과 이용안내는 로그인하지 않아도 볼 수 있어요. 예약·웨이팅 접수와 내역, 메시지 등 계정에 연결되는 기능을 이용할 때는 로그인해주세요.</GuideParagraph>
            <GuideParagraph>이메일로 가입할 때는 이메일 인증과 필수 약관 동의를 진행해요. 비밀번호를 잊었다면 비밀번호 찾기를 이용하고, 로그인한 뒤 마이페이지에서 계정과 앱 설정을 확인할 수 있어요.</GuideParagraph>
            <GuideLinks links={[{ to: '/login', label: '로그인하기' }, { to: '/signup', label: '회원가입하기' }, { to: '/forgot-password', label: '비밀번호 찾기' }, { to: '/my-page', label: '마이페이지 열기' }]} />
        </>,
        search: <>
            <GuideParagraph>홈과 가게 탐색에서 고른 지역은 같은 브라우저 탭의 이동·새로고침 동안 유지돼요. 주소에 유효한 지역 선택이 있으면 이를 먼저 적용하며, 전체 지역 선택도 기억해요.</GuideParagraph>
            <GuideParagraph>검색 화면에는 이 브라우저에서 실행한 최근 검색이 표시돼요. 검색어를 눌러 다시 검색하거나 개별 삭제·전체 삭제를 이용할 수 있어요. 로그인·로그아웃이나 계정 전환 시 최근 검색은 삭제돼요.</GuideParagraph>
            <GuideLinks links={[{ to: '/search', label: '검색 화면 열기' }, { to: '/stores', label: '가게 탐색하기' }]} />
        </>,
        help: <>
            <GuideParagraph>목록이나 일정이 보이지 않으면 화면의 다시 불러오기 또는 새로고침 버튼으로 같은 조회를 다시 요청해요. 인터넷 연결과 로그인 계정, 이용 권한을 확인해주세요.</GuideParagraph>
            <GuideParagraph>가게 이용에 관한 질문은 가게 상세의 채팅으로 문의해요. 서비스 이용 중 문제가 계속되면 페이지 아래의 문의하기에서 문의 유형과 내용을 입력해주세요.</GuideParagraph>
            <GuideLinks links={[{ to: '/stores', label: '문의할 가게 찾기' }, { to: '/messages', label: '메시지 확인하기' }]} />
        </>,
        policy: <>
            <GuideParagraph>예약·결제·취소 조건은 해당 가게와 신청 화면의 안내, 서비스 이용약관에서 확인해요. 개인정보 제공·처리 기준은 접수 화면과 개인정보 처리방침에서, 외부 콘텐츠의 출처와 권리는 콘텐츠 출처·권리 안내에서 확인해주세요.</GuideParagraph>
            <GuideLinks links={[{ to: '/terms', label: '서비스 이용약관' }, { to: '/privacy', label: '개인정보 처리방침' }, { to: '/content-sources', label: '콘텐츠 출처·권리 안내' }]} />
        </>,
    }} />;
}
