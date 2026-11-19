export const UUID_V4 = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const PUBLIC_ID = new RegExp('^' + UUID_V4 + '$');

export const normalizePublicId = value => typeof value === 'string' && PUBLIC_ID.test(value) ? value.toLowerCase() : null;

export function publicPath(prefix, value) {
    const publicId = normalizePublicId(value);
    return publicId ? prefix + publicId : null;
}

export const benefitPath = value => publicPath('/benefits/', value);
export const RETIRED_DETAIL_PATH = /^\/(?:store|benefits|feed\/posts)\/[0-9]+\/?$/;
