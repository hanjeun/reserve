import { useState, useCallback } from 'react';

/**
 * FormField의 필드별 오류 상태를 관리한다. validate는 모든 오류를 수집한 뒤 통과 여부를 반환한다.
 * 수정한 칸은 clearError, 폼을 닫거나 다시 열 때는 resetErrors로 정리한다.
 * AntD Form 안에서는 이 훅 대신 Form.Item rules / form.setFields를 사용해 오류 렌더러를 하나만 둔다.
 * 선택 이유와 사용 기준: docs/technical/design-system.md, docs/technical/ui-decisions.md.
 */
export default function useFormErrors(initial = {}) {
    const [errors, setErrors] = useState(initial);

    /**
     * 사용자가 고치기 시작하면 그 칸의 에러를 즉시 지운다.
     * 다 고쳤는데 빨간 글씨가 남아 있으면 "아직 틀렸나?" 하고 헷갈린다.
     *
     * <p>이미 비어 있으면 <b>같은 객체를 그대로 반환</b>한다 — 새 객체를 만들면
     * 타이핑 한 글자마다 리렌더가 돈다.
     */
    const clearError = useCallback((field) => {
        setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    }, []);

    const resetErrors = useCallback(() => setErrors({}), []);

    /**
     * 검증을 돌리고 결과를 상태에 반영한다.
     *
     * @param collect 빈 객체를 받아 <b>틀린 칸을 전부</b> 채우는 함수.
     *                early return 하지 말 것 — 하나만 채우면 두더지 잡기가 된다.
     * @returns 통과하면 true. 호출부는 `if (!validate(...)) return;` 형태로 쓴다.
     */
    const validate = useCallback((collect) => {
        const next = {};
        collect(next);
        setErrors(next);
        return Object.keys(next).length === 0;
    }, []);

    return { errors, setErrors, validate, clearError, resetErrors };
}
