import StateIllustration from '../src/components/common/StateIllustration';

const labels = {
    'access-restricted': '접근 제한',
    'empty-advertisement': '광고 없음',
    'empty-favorite': '관심 가게 없음',
    'empty-generic': '내역 없음',
    'empty-mail': '메일 없음',
    'empty-member': '회원 없음',
    'empty-message': '대화 없음',
    'empty-news': '소식 없음',
    'empty-notification': '알림 없음',
    'empty-payment': '결제 내역 없음',
    'empty-reservation': '예약 없음',
    'empty-review': '리뷰 없음',
    'empty-store': '가게 없음',
    'empty-waiting': '웨이팅 없음',
    'network-offline': '연결 끊김',
    'not-found': '페이지 없음',
    'payment-failure': '결제 실패',
    'payment-pending': '결제 확인 중',
    'payment-success': '결제 완료',
    preparing: '준비 중',
    'qr-expired': 'QR 만료',
    'qr-invalid': 'QR 확인 실패',
    'qr-ready': 'QR 준비',
    'qr-success': 'QR 인증 완료',
    'rate-limited': '잠시 대기',
    retry: '다시 시도',
    'server-unavailable': '서버 연결 실패',
    'unknown-error': '오류',
    'waiting-called': '웨이팅 호출',
};
const iconFiles = import.meta.glob('../src/assets/state-illustrations/*-512.webp', { eager: true, query: '?url&no-inline', import: 'default' });
const names = Object.keys(iconFiles).map(path => path.split('/').pop().replace('-512.webp', '')).sort();

export default function StateIllustrationGallery() {
    return <main style={{ maxWidth: 1152, marginInline: 'auto', padding: '32px 24px' }}>
        <p style={{ margin: '0 0 24px', color: 'var(--c-text-secondary)', fontSize: 16 }}>실제 공통 컴포넌트 · PC 기본 크기</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '20px 12px' }}>
            {names.map(name => <figure key={name} style={{ margin: 0, minWidth: 0, textAlign: 'center' }}>
                <StateIllustration name={name} size="lg" />
                <figcaption style={{ marginTop: 8, fontSize: 14, color: 'var(--c-text-primary)' }}>{labels[name] || name}</figcaption>
            </figure>)}
        </div>
    </main>;
}
