import { colors, radius, fontSize, fontWeight } from '../../../../styles/tokens';
import { Button } from '../../../../components/common';
import { RESERVATION_DATA } from '../../Home.data';

const r = RESERVATION_DATA[0];

export default function MockMyReservationsMobile() {
    return (
        <div style={{ width: '100%', background: '#fff', borderRadius: radius.xl, padding: '14px 16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: `1px solid ${colors.border.light}` }}>
            {/* 헤더 */}
            <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text.primary, marginBottom: 10 }}>내 예약 확인</div>

            {/* 예약 카드 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 48, height: 48, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 }}>
                    <img src={r.img} alt={r.storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: fontWeight.semibold, fontSize: fontSize.sm, color: colors.text.primary, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{r.storeName}</div>
                    <div style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>{r.date} · {r.time}</div>
                    <div style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>{r.guestCount}명</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: r.statusColor, whiteSpace: 'nowrap' }}>{r.statusLabel}</span>
                    <span style={{ fontWeight: fontWeight.bold, fontSize: fontSize.sm, color: colors.text.primary, whiteSpace: 'nowrap' }}>{r.amount.toLocaleString()}원</span>
                    <Button variant={r.actionVariant}>{r.actionLabel}</Button>
                </div>
            </div>
        </div>
    );
}
