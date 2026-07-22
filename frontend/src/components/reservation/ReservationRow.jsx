import React from 'react';
import { Typography, Tooltip } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import ReservationStatusBadge from './ReservationStatusBadge';
import { formatCurrency, getThumbnailUrl } from '../../utils';
import { colors, radius, fontSize, fontWeight } from '../../styles/tokens';
import { useWindowWidth } from '../../hooks';

const { Text } = Typography;

/**
 * 예약 한 줄(행) 공용 셸.
 *
 * 사업자 패널(예약 관리 탭)과 손님(내 예약)이 이 컴포넌트를 공유한다 —
 * 버튼 개수(사업자 2개 / 손님 최대 3개)만 renderActions로 주입받는다.
 *
 * 2026-07 재작업(최종) — PC/모바일 모두 동일한 배치로 통일:
 *   이미지 + 정보(왼쪽) | 오른쪽 컬럼[상태 → 가격 → 액션 버튼] 세로 정렬.
 *   버튼이 예약상태/가격 바로 아래 같은 오른쪽 컬럼에 정렬된다.
 *   - PC:    정보가 한 줄(이름·인원·날짜·시간)
 *   - 모바일: 정보가 2줄(예약번호 / 날짜·시간, 아이콘 없이 텍스트만)이라 세로 공간이
 *            충분해서 버튼을 오른쪽 컬럼 아래에 같이 넣어도 딱 맞는다.
 *            (예전엔 모바일만 버튼을 카드 하단 별도 줄로 뺐는데, 정보 2줄로 바뀌면서
 *             굳이 뺄 이유가 없어졌고 오히려 아래에 붕 떠 보였다.)
 *
 * 메인 줄은 항상 nowrap이라 정보(info)가 상태/가격과 공간을 다투다 제멋대로
 * 줄바꿈되며 왼쪽으로 툭 떨어지는 문제가 없다(예전에 순수 flex-wrap으로 했다가 겪음).
 */
const ReservationRow = ({ reservation, onOpenDetail, renderMeta, renderActions, extraNote }) => {
    const isWide = useWindowWidth() >= 576;
    const { storeName, storeMainImageUrl, depositAmount, status, specialRequest } = reservation;

    const actionsNode = renderActions ? renderActions(isWide) : null;
    const hasActions = actionsNode != null && (!Array.isArray(actionsNode) || actionsNode.length > 0);
    const actionGroup = hasActions ? <div style={styles.actionGroup}>{actionsNode}</div> : null;

    return (
        <div style={styles.row}>
            {/* 메인 줄 — 이미지 + 정보 + 오른쪽 컬럼(상태/가격/버튼). 항상 nowrap. */}
            <div style={styles.mainRow}>
                <div style={isWide ? styles.imgWrapWide : styles.imgWrap} onClick={onOpenDetail}>
                    <img src={getThumbnailUrl(storeMainImageUrl)} alt={storeName} style={styles.img} />
                </div>

                <div style={styles.info} onClick={onOpenDetail}>
                    <Text strong style={isWide ? styles.storeNameWide : styles.storeName}>
                        {storeName}
                        {specialRequest && (
                            <Tooltip title="요청사항 있음 — 눌러서 확인">
                                <FileTextOutlined style={styles.requestIcon} />
                            </Tooltip>
                        )}
                    </Text>
                    {renderMeta(isWide)}
                </div>

                {/* 오른쪽 컬럼 — 상태 → 가격 → 액션 버튼까지 세로 정렬(오른쪽 끝). PC/모바일 동일. */}
                <div style={styles.statusPrice}>
                    <ReservationStatusBadge status={status} />
                    <Text strong style={styles.price}>{formatCurrency(depositAmount)}</Text>
                    {actionGroup}
                </div>
            </div>

            {/* 거절 사유 등 부가 문구 — 항상 맨 아래 오른쪽 정렬 */}
            {extraNote && <div style={styles.noteRow}>{extraNote}</div>}
        </div>
    );
};

const styles = {
    // 바깥 셀 — 세로 스택: 메인 줄 + 부가 문구 줄
    row:    { display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 0' },
    // 메인 줄 — 항상 nowrap 한 줄. 오른쪽 컬럼은 위쪽 정렬(버튼이 아래로 늘어나므로).
    mainRow: { display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'nowrap' },
    imgWrap:      { width: 56, height: 56, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0, cursor: 'pointer' },
    imgWrapWide:  { width: 72, height: 72, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0, cursor: 'pointer' },
    img:          { width: '100%', height: '100%', objectFit: 'cover' },
    // 정보 영역 — 세로 가운데(이미지와 시각적으로 맞도록). alignSelf:center로 오른쪽 컬럼과 독립.
    info:         { flex: 1, minWidth: 0, alignSelf: 'center', display: 'flex', flexDirection: 'column', gap: 5, cursor: 'pointer' },
    storeName:     { fontSize: fontSize.base, color: colors.text.primary, display: 'block', lineHeight: 1.3 },
    storeNameWide: { fontSize: fontSize.lg, color: colors.text.primary, display: 'block', lineHeight: 1.3, fontWeight: fontWeight.semibold },
    requestIcon:   { fontSize: 12, color: colors.text.tertiary, marginLeft: 6 },
    // 오른쪽 컬럼 — 상태/가격/버튼을 오른쪽 끝 정렬로 세로 스택
    statusPrice: { flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 70 },
    price:       { fontSize: fontSize.base, color: colors.text.primary },
    // 액션 그룹 — 오른쪽 컬럼 안에서 오른쪽 정렬. 버튼이 많으면 wrap.
    actionGroup: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
    // 거절 사유 등 부가 문구 — 맨 아래 줄 오른쪽 정렬
    noteRow:     { display: 'flex', justifyContent: 'flex-end' },
};

export default ReservationRow;
