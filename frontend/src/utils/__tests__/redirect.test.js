import { afterEach, describe, expect, it } from 'vitest';
import { clearRedirect, consumeLoginRedirect, consumeRedirect, pathFromLocation, peekRedirect, safeRedirectPath, saveRedirect } from '../redirect';

afterEach(clearRedirect);

describe('login return destinations', () => {
    it.each([
        '/oauth2/callback#waiting-token=example', '/oauth2/callback?newUser=true#example',
        '/store/../oauth2/callback#example', '/%6fauth2/callback', '/LOGIN#example',
        '/signup/social#example', '/forgot-password#example',
        'https://external.example/store/31', '//external.example/store/31',
        '/\\external.example', '/%5cexternal.example', '/%2f%2fexternal.example', '/store/31\n',
    ])('never returns to an auth screen or external destination: %s', path => {
        expect(safeRedirectPath(path)).toBeNull();
        saveRedirect(path);
        expect(peekRedirect()).toBeNull();
    });

    it('retains an onsite fragment through login and consumes it once', () => {
        const path = pathFromLocation({ pathname: '/store/31', search: '', hash: '#waiting-token=rw1.j.example' });
        saveRedirect(path);
        expect(peekRedirect()).toBe(path);
        expect(consumeRedirect()).toBe(path);
        expect(peekRedirect()).toBeNull();
    });

    it('discards a legacy callback destination instead of staying on the callback', () => {
        sessionStorage.setItem('reserve:redirectAfterLogin', '/oauth2/callback#example');
        expect(consumeLoginRedirect()).toBe('/');
        expect(sessionStorage.getItem('reserve:redirectAfterLogin')).toBeNull();
    });

    it('consumes stale storage even when the current router destination takes precedence', () => {
        saveRedirect('/my-reservations');
        expect(consumeLoginRedirect('/store/31#waiting-token=rw1.j.example')).toBe('/store/31#waiting-token=rw1.j.example');
        expect(consumeLoginRedirect()).toBe('/');
    });

    it('uses the safe saved destination when router state points back to OAuth', () => {
        saveRedirect('/store/31#waiting-token=rw1.j.example');
        expect(consumeLoginRedirect('/oauth2/callback#example')).toBe('/store/31#waiting-token=rw1.j.example');
    });
});
