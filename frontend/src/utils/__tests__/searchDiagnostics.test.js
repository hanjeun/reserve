import { expect, it } from 'vitest';
import { recordSearchMetric, searchDiagnostics } from '../searchDiagnostics';
it('고정 집계 키만 사용하고 검색 원문이나 식별자를 저장하지 않는다', () => {
    const initial = searchDiagnostics();
    recordSearchMetric('submitted'); recordSearchMetric('selected'); recordSearchMetric('private-query-99'); recordSearchMetric('__proto__');
    const result = searchDiagnostics();
    expect(result.submitted).toBe(initial.submitted + 1); expect(result.selected).toBe(initial.selected + 1);
    expect(Object.keys(result)).toEqual(Object.keys(initial)); expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-query-99');
});
