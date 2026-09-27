import MessengerAvatar from './MessengerAvatar';
import { useSupportIdentity } from './messengerIdentity';

/** 고객지원 표시 이름 — 채팅 관리 설정을 따른다(없으면 RESERVE 고객지원). */
export function SupportName() {
    return useSupportIdentity().name;
}

/** 고객지원 사진 — 채팅 관리에서 올린 사진, 없으면 R 로고. */
export function SupportAvatar(props) {
    const { avatarUrl } = useSupportIdentity();
    return <MessengerAvatar {...props} imageSrc={avatarUrl || undefined} />;
}
