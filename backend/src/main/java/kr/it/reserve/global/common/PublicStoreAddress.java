package kr.it.reserve.global.common;

/** 보안 경로와 공개 가게 조회가 같은 주소 계약을 사용한다. */
public final class PublicStoreAddress {
    public static final String NUMERIC_SEGMENT = "/{id:\\d+}";
    public static final String UUID_SEGMENT = PublicId.SEGMENT;
    public static final String PAGE_PREFIX = "/api/public/store-pages";

    private PublicStoreAddress() {}

    public static String path(String publicId) {
        return PublicId.path("/store/", publicId);
    }
}
