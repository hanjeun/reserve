export { STORE_DATA, RESERVATION_DATA, FAQS } from './Home.data';

export const SECTION_IDS = ['section-0', 'section-1', 'section-2', 'section-3', 'section-4', 'section-faq'];

export const SECTIONS = [
    { id: 'section-0', tag: '가게 탐색', demo: 'explore', title: ['원하는 가게를', '한눈에 찾아보세요'], blue: '한눈에', reverse: false },
    { id: 'section-1', tag: '간편 예약', demo: 'booking', title: ['날짜부터 요청까지', '한 화면에서'], blue: '한 화면', reverse: true },
    { id: 'section-2', tag: '예약 관리', demo: 'reservations', title: ['내 예약을', '한곳에서 관리해요'], blue: '한곳에서', reverse: false },
    { id: 'section-3', tag: '웨이팅', demo: 'waiting', title: ['기다리는 동안에도', '내 순서는 한눈에'], blue: '한눈에', reverse: true },
    { id: 'section-4', tag: 'QR 체크인', demo: 'qr', title: ['가게에 도착하면', 'QR로 간편하게'], blue: 'QR로', reverse: false },
];
