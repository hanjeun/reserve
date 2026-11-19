import { normalizePublicId, publicPath, UUID_V4 } from './publicAddress';

export const STORE_DETAIL_PATH = new RegExp('^/store/(' + UUID_V4 + ')/?$');
export const normalizeStorePublicId = normalizePublicId;

export const isLegacyStoreId = value => /^\d+$/.test(String(value ?? ''))
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;

export const storeDetailPath = store => publicPath('/store/', store?.publicId);
