import { describe, expect, it } from 'vitest';
import { canonicalApiPath, versionedApiUrl } from './apiVersion';

describe('API version compatibility', () => {
    it('opts in at one client boundary and preserves queries and already versioned URLs', () => {
        expect(versionedApiUrl('/api/stores?keyword=카페', 'v1')).toBe('/api/v1/stores?keyword=카페');
        expect(versionedApiUrl('/api/v1/auth/refresh', 'v1')).toBe('/api/v1/auth/refresh');
        expect(versionedApiUrl('/api/v2/stores', 'v1')).toBe('/api/v2/stores');
        expect(versionedApiUrl('/api/stores', 'legacy')).toBe('/api/stores');
        expect(versionedApiUrl('https://cdn.example.com/api/photo', 'v1')).toBe('https://cdn.example.com/api/photo');
    });

    it('recognizes v1 authentication paths without matching query strings or other versions', () => {
        expect(canonicalApiPath('/api/v1/auth/refresh?ignored=true')).toBe('/api/auth/refresh');
        expect(canonicalApiPath('/api/v1/member/me')).toBe('/api/member/me');
        expect(canonicalApiPath('/api/v2/auth/refresh')).toBe('/api/v2/auth/refresh');
        expect(canonicalApiPath('/api/stores?next=/api/auth/login')).toBe('/api/stores');
    });
});
