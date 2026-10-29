const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function performPasskey(json, registration, signal) {
    if (!window.isSecureContext || !window.PublicKeyCredential
        || typeof navigator.credentials?.[registration ? 'create' : 'get'] !== 'function') throw new Error('이 브라우저에서 패스키를 사용할 수 없어요.');
    const options = JSON.parse(json);
    const publicKey = options.publicKey;
    if (!publicKey) throw new Error('패스키 요청을 확인하지 못했어요.');
    publicKey.challenge = decode(publicKey.challenge);
    if (registration) publicKey.user.id = decode(publicKey.user.id);
    for (const name of ['allowCredentials', 'excludeCredentials']) {
        if (publicKey[name]) publicKey[name] = publicKey[name].map(value => ({ ...value, id: decode(value.id) }));
    }
    const credential = registration
        ? await navigator.credentials.create({ publicKey, signal })
        : await navigator.credentials.get({ publicKey, signal });
    if (!credential) throw new Error('패스키 인증을 취소했어요.');
    const response = { clientDataJSON: encode(credential.response.clientDataJSON) };
    if (registration) {
        response.attestationObject = encode(credential.response.attestationObject);
        response.transports = credential.response.getTransports?.() || [];
    } else {
        response.authenticatorData = encode(credential.response.authenticatorData);
        response.signature = encode(credential.response.signature);
        response.userHandle = credential.response.userHandle ? encode(credential.response.userHandle) : null;
    }
    return JSON.stringify({ id: credential.id, rawId: encode(credential.rawId), type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment, response, clientExtensionResults: credential.getClientExtensionResults() });
}
