import MockStoreList from './sections/mockups/MockStoreList';
import MockStoreListMobile from './sections/mockups/MockStoreListMobile';
import MockBookingForm from './sections/mockups/MockBookingForm';
import MockBookingFormMobile from './sections/mockups/MockBookingFormMobile';
import MockMyReservations from './sections/mockups/MockMyReservations';
import MockMyReservationsMobile from './sections/mockups/MockMyReservationsMobile';

export { STORE_DATA, RESERVATION_DATA, FAQS } from './Home.data';

export const SECTION_IDS = ['section-0', 'section-1', 'section-2', 'section-faq'];

// JSX 대신 컴포넌트 참조 저장 → 렌더 시 동적 생성으로 useState 버그 해결
export const SECTIONS = [
    {
        id: 'section-0', tag: '가게 탐색',
        title: ['원하는 가게를', '한눈에 찾아보세요'], blue: '한눈에',
        desc: ['카테고리, 위치, 날짜별로 검색해', '내 상황에 딱 맞는 가게를 찾아보세요.'],
        points: ['실시간 잔여석 확인', '카테고리 · 별점 필터', '리뷰 기반 추천'],
        Ui: MockStoreList, UiMobile: MockStoreListMobile, reverse: false,
    },
    {
        id: 'section-1', tag: '간편 예약',
        title: ['예약은 딱', '세 번의 클릭으로'], blue: '세 번의 클릭',
        desc: ['날짜, 시간, 인원만 선택하면 끝.', '복잡한 절차 없이 바로 예약할 수 있어요.'],
        points: ['날짜 · 시간 · 인원 선택', '즉시 예약 확정 알림', '카카오페이 간편 결제'],
        Ui: MockBookingForm, UiMobile: MockBookingFormMobile, reverse: true,
    },
    {
        id: 'section-2', tag: '예약 관리',
        title: ['내 예약을', '한 곳에서 관리해요'], blue: '한 곳에서',
        desc: ['예약 현황을 한눈에 확인하고', '변경, 취소도 앱에서 바로 처리하세요.'],
        points: ['예약 현황 한눈에 확인', '간편 취소 · 변경', '방문 후 리뷰 작성'],
        Ui: MockMyReservations, UiMobile: MockMyReservationsMobile, reverse: false,
    },
];
