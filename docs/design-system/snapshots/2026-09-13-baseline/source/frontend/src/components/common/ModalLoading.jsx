import React from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import Loading from './Loading';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/**
 * RESERVE Design System - ModalLoading
 *
 * "모달을 먼저 열고 그 안에서 데이터를 기다리는" 상황의 로딩 표시를 한 곳에서 관리한다.
 * (예: 가게 삭제 전 예약 수 조회, 사업자 인증 상세 조회, 예약 QR 토큰 발급, 예약 취소 전 환불 미리보기)
 *
 * 2026-07 전수조사 — 이런 로딩 표시가 화면마다 제각각이었다:
 *   - QrCodeModal / BusinessVerificationTab 상세 → 스피너만
 *   - DeleteStoreModal → 스피너 + "예약 현황 확인 중..." (가로 배치)
 *   - MyReservations 환불 → 텍스트만("환불 정보를 확인하는 중...")
 * 같은 성격(모달 안에서 잠깐 기다림)인데 모양이 다 달라서, 스피너 + 그 아래 안내 텍스트를
 * 세로로 놓는 하나의 컴포넌트로 통일한다. 네 곳이 이걸 재사용한다.
 *
 * props:
 *   text      {string} - 스피너 아래 안내 문구 (기본 "불러오는 중...")
 *   minHeight {string} - 로딩 영역 최소 높이 (기본 '120px'. QR처럼 큰 자리는 '220px' 지정)
 *   size      {number} - 스피너 링 크기 (기본 32)
 */
const ModalLoading = ({ text = '불러오는 중...', minHeight = '120px', size = 32 }) => (
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            minHeight,
            width: '100%',
        }}
    >
        <Loading minHeight="0" size={size} />
        {text && (
            <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>
                {text}
            </Text>
        )}
    </div>
);

ModalLoading.propTypes = {
    text: PropTypes.string,
    minHeight: PropTypes.string,
    size: PropTypes.number,
};

export default ModalLoading;
