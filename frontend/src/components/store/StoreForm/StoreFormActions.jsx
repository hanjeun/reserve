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

// 제출 버튼 문구 — 등록/수정 × 진행 중 여부
const submitLabel = (mode, loading) => {
    if (loading) return mode === 'create' ? '등록 중...' : '수정 중...';
    return mode === 'create' ? '등록 완료' : '수정 완료';
};

const draftLabel = draftState => {
    if (draftState?.autoSaveEnabled === false && !['saving', 'saved', 'error'].includes(draftState?.status)) {
        return '자동 임시저장 꺼짐';
    }
    if (draftState?.status === 'pending') return '변경 내용을 자동 저장할게요.';
    if (draftState?.status === 'saving') return '임시저장 중…';
    if (draftState?.status === 'saved') {
        const savedTime = savedTimeLabel(draftState.savedAt);
        const savedSuffix = savedTime ? ' · ' + savedTime : '';
        return `임시저장됨${savedSuffix}`;
    }
    if (draftState?.status === 'error') return draftState.error || '임시저장에 실패했어요.';
    return '';
};

/** 등록·수정 모두 같은 로컬 임시저장 관문과 제출 버튼을 사용한다. */
const StoreFormActions = ({ mode = 'create', loading = false, onSaveDraft, draftState, onNext, nextLabel = '다음', onConfirm }) => {
    const savingDraft = draftState?.status === 'saving';
    const draftError = draftState?.status === 'error';
    const draftStatus = draftLabel(draftState);
    return (
        <div className="reserve-store-form-actions" style={{ marginTop: 32 }}>
            {draftStatus && <Text
                role="status"
                aria-live="polite"
                style={{
                    display: 'block',
                    marginBottom: 10,
                    fontSize: fontSize.xs,
                    color: draftError ? colors.error.main : colors.text.tertiary,
                }}
            >
                {draftStatus}
            </Text>}
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
                    htmlType={onNext || onConfirm ? 'button' : 'submit'}
                    onClick={onNext || onConfirm}
                    loading={loading}
                    disabled={savingDraft}
                    block
                >
                    {onNext ? nextLabel : submitLabel(mode, loading)}
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
        autoSaveEnabled: PropTypes.bool,
    }),
    onNext: PropTypes.func,
    nextLabel: PropTypes.string,
    onConfirm: PropTypes.func,
};

export default StoreFormActions;
