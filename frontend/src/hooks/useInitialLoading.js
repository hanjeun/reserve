import { useState } from 'react';

// 조건을 바꿔 재조회해도 이미 사용 중인 도구줄은 유지한다.
export default function useInitialLoading(loading) {
    const [settled, setSettled] = useState(!loading);
    if (!loading && !settled) setSettled(true);
    return loading && !settled;
}
