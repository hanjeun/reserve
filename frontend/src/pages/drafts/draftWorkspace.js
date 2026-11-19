import { FileTextOutlined, FolderOutlined, MailOutlined, NotificationOutlined, ShopOutlined } from '../../components/common/icons';

export const DRAFTS_TITLE = '임시보관함';

const groups = [
    { key: 'overview', label: '보관함', items: [
        { key: 'all', label: '전체', heading: DRAFTS_TITLE, icon: FolderOutlined },
    ] },
    { key: 'member', label: '사용자', items: [
        { key: 'posts', label: '피드 게시글', icon: FileTextOutlined },
    ] },
    { key: 'owner', label: '사업자', items: [
        { key: 'stores', label: '가게 등록·수정', icon: ShopOutlined },
        { key: 'news', label: '가게 소식·혜택', icon: NotificationOutlined },
    ] },
    { key: 'admin', label: '관리자', items: [
        { key: 'mail', label: '메일 초안', icon: MailOutlined },
    ] },
];

export function draftWorkspace(tab, canManageStores, canManageMail) {
    const visibleGroups = groups.filter(group => (group.key !== 'owner' || canManageStores) && (group.key !== 'admin' || canManageMail));
    const items = visibleGroups.flatMap(group => group.items);
    return { groups: visibleGroups, items, activeKey: items.some(item => item.key === tab) ? tab : 'all' };
}

export function draftPath(tab, page = 1, view = 'list') {
    const params = new URLSearchParams();
    if (tab !== 'all') params.set('tab', tab);
    if (tab !== 'all' && page > 1) params.set('page', String(page));
    if (view === 'cards') params.set('view', view);
    return params.size ? `/drafts?${params}` : '/drafts';
}
