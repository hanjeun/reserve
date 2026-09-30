// 준비 중 탐색 화면의 고정 문구. 실제 화면(pages/discovery/ComingSoon)과 청크 로딩 뼈대가 같은 문구로
// 줄바꿈·높이를 계산하도록 한 곳에 둔다(2026-09-29). 아이콘은 화면 쪽에서 붙인다.
export const DISCOVERY_COMING_SOON_SCREENS = Object.freeze({
    '/waiting': { title: '웨이팅', heading: '웨이팅은 아직 준비 중이에요', description: '현재는 가게를 둘러보고 예약할 수 있어요.' },
    '/feed': { title: '피드', heading: '새로운 이야기를 준비하고 있어요', description: '가게와 서비스의 이야기를 한곳에서 만날 수 있도록 준비하고 있어요.' },
});

export const discoveryComingSoonScreen = pathname => DISCOVERY_COMING_SOON_SCREENS[pathname.replace(/\/$/, '')] ?? null;
