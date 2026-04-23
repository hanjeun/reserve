import React from 'react';
import { colors, radius, fontSize, fontWeight } from '../../../../styles/tokens';
import { Button } from '../../../../components/common';
import { RESERVATION_DATA } from '../../Home.data';

export default function MockMyReservationsMobile() {
    return (
        <div style={{
            width: '100%',
            background: '#fff',
            borderRadius: radius['2xl'],
            padding: '16px 18px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            border: `1px solid ${colors.border.light}`,
        }}>
            <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${colors.border.light}` }}>
                <div style={{ fontSize: fontSize.base, fontWeight: fontWeight.extrabold, color: colors.text.primary, letterSpacing: '-0.3px' }}>내 예약 확인</div>
                <div style={{ fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 2 }}>방문 후 리뷰를 남겨보세요</div>
            </div>
            {RESERVATION_DATA.map((r, i) => (
                <React.Fragment key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                        <div style={{ width: 46, height: 46, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 }}>
                            <img src={r.img} alt={r.storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: fontWeight.semibold, fontSize: fontSize.sm, color: colors.text.primary, lineHeight: 1.3, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.storeName}</div>
                            <div style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>{r.date} · {r.time}</div>
                            <div style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>{r.guestCount}명</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                            <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: r.statusColor }}>{r.statusLabel}</span>
                            <span style={{ fontWeight: fontWeight.bold, fontSize: fontSize.sm, color: colors.text.primary }}>{r.amount.toLocaleString()}원</span>
                            <Button variant={r.actionVariant}>{r.actionLabel}</Button>
                        </div>
                    </div>
                    {i < RESERVATION_DATA.length - 1 && <div style={{ height: 1, background: colors.border.light }} />}
                </React.Fragment>
            ))}
        </div>
    );
}
