package kr.it.reserve.store.entity;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * 공개 탐색용 서비스 분류.
 *
 * <p>사장님이 자유롭게 적는 {@link Store#getCategory() category}와 예약 동작을 결정하는
 * {@link Store.BookingType}을 섞지 않는다. 기존 행은 ddl-auto가 새 컬럼을 {@code null}로
 * 만들기 때문에, 명시값이 없는 동안에만 자유 카테고리에서 보수적으로 추론한다.
 */
public enum ServiceDomain {
    FOOD(
            "한식", "일식", "양식", "중식", "분식", "식당", "음식", "카페", "디저트",
            "베이커리", "치킨", "버거", "피자", "샐러드", "주점", "술집"),
    BEAUTY_CLINIC(
            "미용", "헤어", "네일", "메이크업", "피부", "병원", "의원", "클리닉", "마사지", "스파"),
    SPORTS(
            "헬스", "운동", "필라테스", "요가", "골프", "테니스", "수영", "피트니스", "웰니스"),
    PERFORMANCE(
            "공연", "콘서트", "클래스", "공방", "레슨", "투어", "체험", "전시"),
    POPUP(
            "팝업", "대관", "공간", "회의실", "행사장", "스튜디오"),
    OTHER;

    private static final List<String> ALL_KNOWN_CATEGORY_WORDS = Arrays.stream(values())
            .filter(domain -> domain != OTHER)
            .flatMap(domain -> domain.legacyCategoryWords.stream())
            .toList();

    private final List<String> legacyCategoryWords;

    ServiceDomain(String... legacyCategoryWords) {
        this.legacyCategoryWords = List.of(legacyCategoryWords);
    }

    public static ServiceDomain parseOrNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    /**
     * 과거 가게를 탐색에서 잃지 않기 위한 읽기 호환 계층이다.
     * 이 판정은 예약 방식(SLOT/SESSION/DAY)을 절대 보지 않는다.
     */
    public static ServiceDomain inferFromCategory(String category) {
        String value = category == null ? "" : category.trim().toLowerCase(Locale.KOREAN);
        for (ServiceDomain domain : values()) {
            if (domain != OTHER && containsAny(value, domain.legacyCategoryWords)) {
                return domain;
            }
        }
        return OTHER;
    }

    /** DB 폴백 predicate도 엔티티의 legacy 추론과 같은 단어 정본을 사용한다. */
    public List<String> legacyCategoryWords() {
        return legacyCategoryWords;
    }

    public static List<String> allKnownLegacyCategoryWords() {
        return ALL_KNOWN_CATEGORY_WORDS;
    }

    /**
     * {@link #inferFromCategory(String)}가 이 분야보다 먼저 검사하는 분야의 단어들.
     * DB legacy predicate도 이 목록을 제외해야 중첩 카테고리가 여러 분야에 동시에 잡히지 않는다.
     */
    public List<String> higherPriorityLegacyCategoryWords() {
        return Arrays.stream(values())
                .takeWhile(domain -> domain != this)
                .flatMap(domain -> domain.legacyCategoryWords.stream())
                .toList();
    }

    private static boolean containsAny(String value, List<String> keywords) {
        for (String keyword : keywords) {
            if (value.contains(keyword)) return true;
        }
        return false;
    }
}
