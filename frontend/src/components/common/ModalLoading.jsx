import React from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import Loading from './Loading';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/**
 * 모달 내부 조회 중 공용 스피너와 안내 문구를 세로 배치한다.
 * text는 안내 문구, minHeight는 영역 최소 높이, size는 스피너 크기를 지정한다.
 * 호출부는 실제 모달 내용에 맞는 높이를 전달해 로딩 전후 위치를 유지한다.
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
