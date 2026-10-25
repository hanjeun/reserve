package kr.it.reserve.file.util;

/** 저장 경로는 이 클래스에서 조합해 호출부의 경로 불일치를 막는다. */
public final class FileStoragePaths {

    private static final String USER_ROOT = "users/";
    private static final String STORE_SEGMENT = "/stores/";

    private FileStoragePaths() {}

    // 사용자 영역

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

    /** 피드 사진은 공개 CDN에도 암호문만 저장하고 전용 API에서 가시성을 확인한다. */
    public static String feedImage(Long memberId) {
        return USER_ROOT + memberId + "/feed/images";
    }

    /** 계정 사진과 별도로 선택한 공개 피드 프로필 이미지. */
    public static String feedProfile(Long memberId) {
        return USER_ROOT + memberId + "/feed/profiles";
    }

    public static String supportAvatar() {
        return system("chat/support");
    }

    /** 공지사항 이미지: notices/{noticeId}/images */
    public static String notice(Long noticeId) {
        return "notices/" + noticeId + "/images";
    }

    /** 시스템 기본 이미지: system/{category} (예: "system/defaults/profiles") */
    public static String system(String category) {
        return "system/" + category;
    }
}
