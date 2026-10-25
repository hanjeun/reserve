import { useState, useCallback } from 'react';

/*
 * 필드 오류를 모아 검증 결과를 반환한다. AntD Form에서는 자체 rules·setFields를 사용해 오류 렌더러를 중복하지 않는다.
 */
export default function useFormErrors(initial = {}) {
    const [errors, setErrors] = useState(initial);

    /*
     * 수정한 필드의 오류만 지운다. 이미 비어 있으면 같은 객체를 유지한다.
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
