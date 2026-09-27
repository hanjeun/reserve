import React from 'react';
import PropTypes from 'prop-types';
import { Flex, Typography } from 'antd';
import { Button } from '../../common';
import { colors, fontSize } from '../../../styles/tokens';

const { Text } = Typography;

const savedTimeLabel = savedAt => {
    if (!savedAt) return null;
    return new Intl.DateTimeFormat('ko-KR', {
        hour: '2-digit', minute: '2-digit',
    }).format(savedAt);
};

const draftLabel = draftState => {
    if (draftState?.status === 'pending') return '변경 내용을 자동 저장할게요.';
    if (draftState?.status === 'saving') return '이 브라우저에 저장 중…';
    if (draftState?.status === 'saved') {
        return `이 브라우저에 저장됨${savedTimeLabel(draftState.savedAt) ? ` · ${savedTimeLabel(draftState.savedAt)}` : ''}`;
    }
    if (draftState?.status === 'error') return draftState.error || '임시저장에 실패했습니다.';
    return '입력 내용과 새 이미지는 이 브라우저에만 자동 저장돼요.';
};

/** 등록·수정 모두 같은 로컬 임시저장 관문과 제출 버튼을 사용한다. */
const StoreFormActions = ({ mode = 'create', loading = false, onSaveDraft, draftState }) => {
    const savingDraft = draftState?.status === 'saving';
    const draftError = draftState?.status === 'error';
    return (
        <div className="reserve-store-form-actions" style={{ marginTop: 32 }}>
            <Text
                role="status"
                aria-live="polite"
                style={{
                    display: 'block',
                    marginBottom: 10,
                    fontSize: fontSize.xs,
                    color: draftError ? colors.error.main : colors.text.tertiary,
                }}
            >
                {draftLabel(draftState)}
            </Text>
            <Flex gap={12}>
                <Button
                    variant="secondary"
                    loading={savingDraft}
                    disabled={loading}
                    onClick={onSaveDraft}
                    block
                >
                    {savingDraft ? '저장 중…' : '임시저장'}
                </Button>
                <Button
                    variant="primary"
                    htmlType="submit"
                    loading={loading}
                    disabled={savingDraft}
                    block
                >
                    {loading
                        ? (mode === 'create' ? '등록 중...' : '수정 중...')
                        : (mode === 'create' ? '등록 완료' : '수정 완료')}
                </Button>
            </Flex>
        </div>
    );
};

StoreFormActions.propTypes = {
    mode: PropTypes.oneOf(['create', 'edit']),
    loading: PropTypes.bool,
    onSaveDraft: PropTypes.func,
    draftState: PropTypes.shape({
        status: PropTypes.oneOf(['idle', 'pending', 'saving', 'saved', 'error']),
        savedAt: PropTypes.number,
        error: PropTypes.string,
    }),
};

export default StoreFormActions;
