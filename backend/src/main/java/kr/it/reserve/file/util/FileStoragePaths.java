package kr.it.reserve.file.util;

/**
 * S3 저장 경로 prefix 생성 유틸
 *
 * FileStorageService.storeFile()에 넘길 prefixPath를 이 클래스에서 조합한다.
 * 경로 문자열을 호출부에서 직접 조합하면 오타/불일치가 생길 수 있으므로
 * 모든 경로는 반드시 이 클래스를 통해 생성한다.
 *
 * 구조:
 *   users/{memberId}/profiles/
 *   users/{memberId}/stores/{storeId}/thumbnails/
 *   users/{memberId}/stores/{storeId}/images/
 *   users/{memberId}/businesses/
 *   notices/{noticeId}/images/       (향후 공지사항 이미지)
 *   system/{category}/               (향후 시스템 기본 이미지)
 */
public final class FileStoragePaths {

    private static final String USER_ROOT = "users/";
    private static final String STORE_SEGMENT = "/stores/";

    private FileStoragePaths() {}

    // ========== 사용자 영역 ==========

    /** 프로필 이미지: users/{memberId}/profiles */
    public static String userProfile(Long memberId) {
        return USER_ROOT + memberId + "/profiles";
    }

    /** 가게 메인(썸네일) 이미지: users/{memberId}/stores/{storeId}/thumbnails */
    public static String storeThumbnail(Long memberId, Long storeId) {
        return USER_ROOT + memberId + STORE_SEGMENT + storeId + "/thumbnails";
    }

    /** 가게 상세 이미지: users/{memberId}/stores/{storeId}/images */
    public static String storeImage(Long memberId, Long storeId) {
        return USER_ROOT + memberId + STORE_SEGMENT + storeId + "/images";
    }

    /** 사업자 인증 이미지: users/{memberId}/businesses */
    public static String business(Long memberId) {
        return USER_ROOT + memberId + "/businesses";
    }

    /** 광고 배너 이미지: users/{memberId}/stores/{storeId}/advertisements */
    public static String advertisement(Long memberId, Long storeId) {
        return USER_ROOT + memberId + STORE_SEGMENT + storeId + "/advertisements";
    }

    /** 비공개 대화 사진. 공개 CDN에 보관되는 바이트도 암호문이며 조회는 인증 API만 사용한다. */
    public static String chatImage(Long memberId, Long roomId) {
        return USER_ROOT + memberId + "/chat/" + roomId;
    }

    public static String supportAvatar() {
        return system("chat/support");
    }

    // ========== 시스템 영역 (향후 확장) ==========

    /** 공지사항 이미지: notices/{noticeId}/images */
    public static String notice(Long noticeId) {
        return "notices/" + noticeId + "/images";
    }

    /** 시스템 기본 이미지: system/{category} (예: "system/defaults/profiles") */
    public static String system(String category) {
        return "system/" + category;
    }
}
