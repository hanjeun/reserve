import React from 'react';
import { Form, Flex } from 'antd';
import { Button } from '../../common';

/**
 * 가게 폼 액션 버튼 섹션
 * 
 * @param {Object} props
 * @param {'create' | 'edit'} props.mode - 등록 또는 수정 모드
 * @param {boolean} props.loading - 로딩 상태
 * @param {Function} props.onCancel - 취소 버튼 핸들러 (수정 모드만)
 */
const StoreFormActions = ({ mode = 'create', loading = false, onCancel }) => {
    // 등록 모드
    if (mode === 'create') {
        return (
            <Form.Item style={{ marginTop: 32 }}>
                <Button
                    variant="primary"
                    htmlType="submit"
                    loading={loading}
                    block
                >
                    {loading ? "등록 중..." : "등록 완료"}
                </Button>
            </Form.Item>
        );
    }

    // 수정 모드
    return (
        <Flex gap={12} style={{ marginTop: 32 }}>
            <Button
                variant="secondary"
                onClick={onCancel}
                block
            >
                취소
            </Button>
            <Button
                variant="primary"
                htmlType="submit"
                loading={loading}
                block
            >
                {loading ? "수정 중..." : "수정 완료"}
            </Button>
        </Flex>
    );
};

export default StoreFormActions;
