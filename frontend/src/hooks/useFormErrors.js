import { useState, useCallback } from 'react';

/**
 * 폼 검증 오류를 <b>칸에 귀속시켜</b> 들고 있는 훅. `FormField` 의 `error` prop 과 짝이다.
 *
 * <h2>왜 훅으로 빼는가 — 규칙을 주석이 아니라 코드에 둔다</h2>
 * `FormField` 는 진작에 `error` 를 받고 있었고, 왜 토스트가 아니라 인라인이어야 하는지도
 * `FormModal.jsx` 주석에 적혀 있었다. 그런데 실제로 `error=` 를 쓰는 파일은
 * `InquiryModal` <b>하나뿐</b>이었다. 나머지 폼은 전부 `message.warning` 을 이어 붙였다.
 *
 * 이 프로젝트에서 반복된 회귀와 같은 모양이다(필터 Select 색, 카드 hover 그림자) —
 * <b>규칙은 있는데 강제 장치가 없으면 새로 만드는 사람이 매번 놓친다.</b>
 * `errors` state + `clearError` + "틀린 칸을 전부 모으는 validate" 를 매번 손으로 쓰게 두면
 * 그게 귀찮아서 `message.warning` 한 줄로 돌아간다. 그래서 관문을 하나 만든다.
 *
 * <h2>왜 토스트가 아니라 인라인인가</h2>
 * 토스트는 몇 초 뒤 사라져서 "어느 칸이 잘못됐는지"를 다시 확인할 방법이 없고,
 * 여러 칸이 동시에 틀리면 겹쳐 쌓인다. 게다가 `if (...) { warning(); return; }` 를 이어 붙이면
 * <b>첫 번째 오류만</b> 알려주게 되어, 고치면 다음 오류가 또 나오는 두더지 잡기가 된다.
 *
 * <h2>쓰는 법</h2>
 * ```jsx
 * const { errors, validate, clearError, resetErrors } = useFormErrors();
 *
 * const handleSubmit = () => {
 *     // 틀린 칸을 전부 모은다. 하나라도 있으면 false.
 *     if (!validate((e) => {
 *         if (!storeId)   e.storeId   = '가게를 선택해주세요.';
 *         if (!dateRange) e.dateRange = '노출 기간을 선택해주세요.';
 *     })) return;
 *     ...
 * };
 *
 * <FormField label="가게" error={errors.storeId}>
 *     <FormSelect value={storeId}
 *                 onChange={(v) => { setStoreId(v); clearError('storeId'); }} />
 * </FormField>
 * ```
 *
 * <p>⚠️ AntD `Form` 을 쓰는 화면에서는 이 훅이 아니라 `Form.Item` 의 `rules` 와
 * `form.setFields([{ name, errors: [...] }])` 를 쓴다. 두 기계를 한 폼에 섞으면
 * 에러가 두 군데에서 렌더된다. 판단 기준은 "이 폼이 `<Form>` 안에 있는가" 하나다.
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
