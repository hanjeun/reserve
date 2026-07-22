import React from 'react';
import { UserOutlined, CalendarOutlined, ClockCircleOutlined, TeamOutlined, NumberOutlined } from '@ant-design/icons';
import { formatTime } from '../../utils';
import { colors, fontSize } from '../../styles/tokens';

/**
 * 예약 카드의 메타 정보(이름·인원·날짜·시간) 공용 렌더러.
 *
 * ReservationCard.jsx(사업자)와 MyReservations.jsx(고객)가 원래 거의 동일한 코드를
 * 각자 따로 들고 있었다(PC: 한 줄 flat, 모바일: 두 줄 stacked). 2026-07 ReservationRow
 * 통합 리팩토링에서 여기로 뺐다.
 *
 * `mobileCodeMode`: 고객 쪽(내 예약)은 이름(=본인이라 의미 없음)·인원 대신 예약번호를
 * 보여주고 싶어한다. 이 모드에서는 PC/모바일 모두 예약번호를 별도 줄로 얹어서, 가게이름(줄1) +
 * 예약번호(줄2) + 이름·인원·날짜·시간(줄3)의 3줄 구성이 되게 한다 — 그래야 오른쪽 컬럼
 * (예약확정 / 가격 / 버튼)의 3줄과 줄 수가 맞아 세로 정렬이 자연스럽다.
 *   - PC:    예약번호 한 줄 + 이름·인원·날짜·시간 한 줄(아이콘 포함, flat)
 *   - 모바일: 예약번호 한 줄 + 날짜·시간 한 줄(아이콘 없이 텍스트만, 폭이 좁으므로 이름·인원 생략)
 * mobileCodeMode가 아니면(사업자 쪽) 기존대로 이름·인원·날짜·시간만 보여준다.
 */
const ReservationMeta = ({
    memberName, guestCount, reservationDate, reservationTime, isWide,
    mobileCodeMode = false, reservationCode,
}) => {
    // 예약번호 줄 — mobileCodeMode일 때만. PC는 아이콘 포함, 모바일은 아이콘 없이 텍스트만.
    const codeRow = mobileCodeMode ? (
        <div style={styles.metaRow}>
            <span style={{ ...styles.metaItem, minWidth: 0 }}>
                {isWide && <NumberOutlined style={styles.metaIcon} />}
                <span style={styles.codeText}>{reservationCode || '눌러서 상세 보기'}</span>
            </span>
        </div>
    ) : null;

    if (isWide) {
        // PC: (예약번호 줄) + 이름·인원·날짜·시간 한 줄(아이콘 포함)
        return (
            <>
                {codeRow}
                <div style={styles.metaRowFlat}>
                    <span style={styles.metaItem}><UserOutlined style={styles.metaIcon} />{memberName}</span>
                    <span style={styles.dot}>·</span>
                    <span style={styles.metaItem}><TeamOutlined style={styles.metaIcon} />{guestCount}명</span>
                    <span style={styles.dot}>·</span>
                    <span style={styles.metaItem}><CalendarOutlined style={styles.metaIcon} />{reservationDate}</span>
                    <span style={styles.dot}>·</span>
                    <span style={styles.metaItem}><ClockCircleOutlined style={styles.metaIcon} />{formatTime(reservationTime)}</span>
                </div>
            </>
        );
    }

    if (mobileCodeMode) {
        // 모바일 손님: 예약번호 한 줄 + 날짜·시간 한 줄(아이콘 없이 텍스트만)
        return (
            <>
                {codeRow}
                <div style={styles.metaRow}>
                    <span style={styles.metaItem}>{reservationDate}</span>
                    <span style={styles.dot}>·</span>
                    <span style={styles.metaItem}>{formatTime(reservationTime)}</span>
                </div>
            </>
        );
    }

    // 모바일 사업자: 이름·인원 / 날짜·시간 2줄(아이콘 포함)
    return (
        <>
            <div style={styles.metaRow}>
                <span style={styles.metaItem}><UserOutlined style={styles.metaIcon} />{memberName}</span>
                <span style={styles.dot}>·</span>
                <span style={styles.metaItem}><TeamOutlined style={styles.metaIcon} />{guestCount}명</span>
            </div>
            <div style={styles.metaRow}>
                <span style={styles.metaItem}><CalendarOutlined style={styles.metaIcon} />{reservationDate}</span>
                <span style={styles.dot}>·</span>
                <span style={styles.metaItem}><ClockCircleOutlined style={styles.metaIcon} />{formatTime(reservationTime)}</span>
            </div>
        </>
    );
};

const styles = {
    metaRow:     { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' },
    metaRowFlat: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    metaItem:    { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: fontSize.sm, color: colors.text.secondary, whiteSpace: 'nowrap' },
    metaIcon:    { fontSize: 12, color: colors.text.tertiary },
    dot:         { color: colors.text.tertiary, fontSize: fontSize.xs },
    // 예약번호 — 정말 좁은 폰에선 말줄임표로 잘리게(nowrap 줄 안에서 overflow 방지)
    codeText:    { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};

export default ReservationMeta;
