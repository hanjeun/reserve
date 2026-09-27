package kr.it.reserve.advertisement.entity;

/**
 * 배너 광고에서 시작점으로 사용할 수 있는 추천 문구 조합.
 *
 * <p>이 enum은 이전 클라이언트의 고정 문구 계약과 새 작성 화면의 기본값을 함께 제공한다.
 * 최종 사용자 문구의 공백·필수값·길이 검증은 AdvertisementService의 단일 관문이 맡는다.</p>
 */
public enum BannerCopyPreset {
    AVAILABLE_NOW(
            "지금 예약할 수 있어요",
            "원하는 시간을 바로 확인해보세요"),
    DISCOVER_STORE(
            "새로운 가게를 만나보세요",
            "예약 정보와 이용 시간을 둘러보세요"),
    PLAN_VISIT(
            "방문할 곳을 찾고 있나요?",
            "내게 맞는 시간을 RESERVE에서 찾아보세요");

    private final String title;
    private final String description;

    BannerCopyPreset(String title, String description) {
        this.title = title;
        this.description = description;
    }

    public String title() {
        return title;
    }

    public String description() {
        return description;
    }
}
