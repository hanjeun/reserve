import { CalendarOutlined, ClockCircleOutlined, FileTextOutlined, HeartOutlined, InfoCircleOutlined,
    MessageOutlined, NotificationOutlined, PlusOutlined, SearchOutlined, SettingOutlined, ShopOutlined } from '../components/common/icons';
import { ADMIN_WORKSPACE_GROUPS, BUSINESS_WORKSPACE_GROUPS } from './workspaces';
import { GUIDE_PAGES } from '../pages/legal/GuidePageMetadata';

export const SEARCH_KEYWORD_MAX_LENGTH = 100;
export const SEARCH_GROUP_LIMIT = 5;
export const normalizeSearchKeyword = value => typeof value === 'string' ? value.trim() : '';
const comparable = value => value.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/gu, '');

export const canSearchPersonal = auth => Boolean(auth.isLoggedIn && auth.user?.id != null
    && !auth.authRestoring && !auth.isLoggingOut && auth.user.termsAgreed !== false);

const workspaceEntries = (groups, base, roles) => groups.flatMap(group => group.items.map(item => ({
    id: `${base}-${item.key}`, group: 'menu', title: item.label, path: `/${base}?tab=${item.key}`, roles,
    icon: item.icon,
    description: base === 'business' ? '사업자 패널' : '관리자 패널',
    aliases: item.key === 'ads' ? ['광고관리', '광고 관리', '홍보']
        : item.key === 'qr-checkin' ? ['큐알', 'QR', '체크인', '방문 확인'] : [],
})));

// Only existing destinations belong here. Route guards and server checks remain authoritative.
const entryIcons = { stores: ShopOutlined, benefits: NotificationOutlined, waiting: ClockCircleOutlined,
    feed: NotificationOutlined, reservations: CalendarOutlined, 'my-waiting': ClockCircleOutlined,
    favorites: HeartOutlined, messages: MessageOutlined, 'my-page': SettingOutlined,
    'my-stores': ShopOutlined, register: PlusOutlined, sources: InfoCircleOutlined };
export const SEARCH_CATALOG = [
    { id: 'stores', group: 'menu', title: '가게 탐색', path: '/stores', aliases: ['가게 찾기', '매장', '지역', '서비스'] },
    { id: 'benefits', group: 'menu', title: '혜택', path: '/benefits', aliases: ['이벤트', '프로모션'] },
    { id: 'waiting', group: 'menu', title: '웨이팅 가게', path: '/waiting', aliases: ['대기', '현장 접수'] },
    { id: 'feed', group: 'menu', title: '피드', path: '/feed', aliases: ['게시물', '소식'] },
    { id: 'reservations', group: 'menu', title: '내 예약', path: '/my-reservations', authenticated: true, aliases: ['예약 내역', '예약 확인', 'QR', '예약 변경', '예약 취소', '내가 예약한', '예약한 내역', '내 예약 확인'] },
    { id: 'my-waiting', group: 'menu', title: '내 웨이팅', path: '/my-reservations?tab=waiting', authenticated: true, aliases: ['대기 내역', '대기 번호', '내가 접수한 웨이팅'] },
    { id: 'favorites', group: 'menu', title: '즐겨찾기', path: '/my-favorites', authenticated: true, aliases: ['찜', '좋아하는 가게'] },
    { id: 'messages', group: 'menu', title: '메시지', path: '/messages', authenticated: true, aliases: ['채팅', '문의', '고객지원', '대화', '내 대화'] },
    { id: 'my-page', group: 'menu', title: '마이페이지', path: '/my-page', authenticated: true, aliases: ['내 계정', '프로필', '비밀번호', '로그인 관리'] },
    { id: 'my-stores', group: 'menu', title: '내 가게 관리', path: '/my-stores', roles: ['BUSINESS', 'ADMIN'], aliases: ['가게 수정', '매장 관리'] },
    { id: 'register', group: 'menu', title: '새 가게 등록', path: '/store/register', roles: ['BUSINESS', 'ADMIN'], aliases: ['가게 만들기', '매장 등록'] },
    ...workspaceEntries(BUSINESS_WORKSPACE_GROUPS, 'business', ['BUSINESS', 'ADMIN']),
    ...workspaceEntries(ADMIN_WORKSPACE_GROUPS, 'admin', ['ADMIN']),
    ...Object.entries(GUIDE_PAGES).map(([path, page]) => ({
        id: path, group: 'help', path, title: page.title, description: page.description,
        aliases: page.sections.map(section => section.title),
    })),
    { id: 'terms', group: 'help', title: '이용약관', path: '/terms', aliases: ['약관', '정책'] },
    { id: 'privacy', group: 'help', title: '개인정보처리방침', path: '/privacy', aliases: ['개인정보', '개인 정보', '정책'] },
    { id: 'sources', group: 'help', title: '콘텐츠 출처', path: '/content-sources', aliases: ['사진 출처', '저작권', '라이선스'] },
].map(entry => ({ ...entry, icon: entry.icon ?? entryIcons[entry.id] ?? (entry.group === 'help' ? FileTextOutlined : SearchOutlined) }));

export function searchCatalog(keyword, auth, limit = SEARCH_GROUP_LIMIT) {
    const term = normalizeSearchKeyword(keyword);
    if (!term || term.length > SEARCH_KEYWORD_MAX_LENGTH) return [];
    const needle = comparable(term);
    return SEARCH_CATALOG.filter(entry => (!entry.authenticated && !entry.roles || canSearchPersonal(auth))
        && (!entry.roles || entry.roles.includes(auth.user?.role)))
        .map(entry => {
            const title = comparable(entry.title);
            const aliases = entry.aliases.map(comparable);
            const score = title === needle ? 100 : comparable(entry.path) === needle ? 95 : aliases.includes(needle) ? 90
                : title.startsWith(needle) ? 80 : title.includes(needle) ? 70
                    : aliases.some(alias => alias.includes(needle)) ? 60 : comparable(entry.path).includes(needle) ? 50 : 0;
            return { ...entry, score };
        }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score)
        .filter((entry, index, all) => all.slice(0, index).filter(previous => previous.group === entry.group).length < limit);
}

/** Only one explicit navigation destination can skip server content search; substrings never do. */
export function isLocalNavigationSearch(keyword, auth) {
    const exact = searchCatalog(keyword, auth).filter(entry => entry.score >= 90
        && (entry.authenticated || entry.roles || entry.score === 95 || entry.group === 'help' && entry.score === 100));
    return new Set(exact.map(entry => entry.path)).size === 1;
}
