import React from 'react';
import { colors, radius, fontSize, fontWeight } from '../../../../styles/tokens';
import { Button } from '../../../../components/common';
import { RESERVATION_DATA } from '../../Home.data';
// 목업 폭은 Home.styles.js 의 HOME_MOCKUP_WIDTH 하나에서 온다 — 섹션마다 달라지면 간격이 어긋난다.
import { HOME_MOCKUP_WIDTH } from '../../Home.styles';

// 실제 MyReservations 페이지와 동일한 레이아웃
export default function MockMyReservations() {
    return (
        <div style={{ width: '100%', maxWidth: HOME_MOCKUP_WIDTH, background: colors.background.paper, borderRadius: radius['2xl'], padding: 'clamp(14px, 3vw, 20px) clamp(16px, 3vw, 24px)', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: `1px solid ${colors.border.light}`, boxSizing: 'border-box' }}>
            {/* 페이지 타이틀 */}
            <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${colors.border.light}` }}>
                <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, color: colors.text.primary, letterSpacing: '-0.3px' }}>내 예약 확인</div>
                <div style={{ fontSize: fontSize.xs, color: colors.text.tertiary, marginTop: 2 }}>방문 후 리뷰를 남겨보세요</div>
            </div>

            {RESERVATION_DATA.map((r, i) => (
                <React.Fragment key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                        {/* 썸네일 */}
                        <div style={{ width: 52, height: 52, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 }}>
                            <img src={r.img} alt={r.storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>

                        {/* 정보 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: fontWeight.semibold, fontSize: fontSize.sm, color: colors.text.primary, lineHeight: 1.3, marginBottom: 3 }}>{r.storeName}</div>
                            <div style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>{r.date} · {r.time}</div>
                            <div style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>{r.guestCount}명</div>
                        </div>

                        {/* 상태 + 금액 + 버튼 */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
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
