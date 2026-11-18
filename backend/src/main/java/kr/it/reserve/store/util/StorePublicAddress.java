package kr.it.reserve.store.util;

import kr.it.reserve.global.common.PublicStoreAddress;

public final class StorePublicAddress {
    public static final String NUMERIC_SEGMENT = PublicStoreAddress.NUMERIC_SEGMENT;
    public static final String UUID_SEGMENT = PublicStoreAddress.UUID_SEGMENT;
    public static final String PAGE_PREFIX = PublicStoreAddress.PAGE_PREFIX;

    private StorePublicAddress() {}

    public static String path(String publicId) {
        return PublicStoreAddress.path(publicId);
    }
}
