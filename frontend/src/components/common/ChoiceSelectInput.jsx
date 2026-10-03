import { forwardRef } from 'react';

// rc-select의 읽기 전용 combobox는 포커스/방향키를 유지하되 가상 키보드 입력은 요청하지 않는다.
// 검색·tags·multiple의 실제 편집 input에는 원래 입력 모드를 그대로 전달한다.
const ChoiceSelectInput = forwardRef(function ChoiceSelectInput({ readOnly, inputMode, ...props }, ref) {
    return <input {...props} ref={ref} readOnly={readOnly} inputMode={readOnly ? 'none' : inputMode} />;
});

export default ChoiceSelectInput;
