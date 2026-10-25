package kr.it.reserve.search;

import kr.it.reserve.global.error.BusinessException;
import org.springframework.http.HttpStatus;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import kr.it.reserve.global.common.ServiceTime;

record SearchQuery(String keyword, int limit, String term, String scope, LocalDate date, String region) {
    private static final Map<String, List<String>> RELATED = Map.of("도예", List.of("도자기"),
            "공유오피스", List.of("코워킹"), "사진관", List.of("사진스튜디오", "촬영스튜디오"));
    static SearchQuery from(String raw, int limit) { return from(raw, limit, null); }
    static SearchQuery from(String raw, int limit, SearchFilter filter) {
        if (raw != null && (raw.length() > 100 || raw.codePoints().anyMatch(Character::isISOControl)))
            throw new BusinessException("검색어는 제어 문자 없이 100자까지 입력해주세요.", HttpStatus.BAD_REQUEST);
        if (limit < 1 || limit > 5)
            throw new BusinessException("검색 결과는 1개부터 5개까지 조회할 수 있어요.", HttpStatus.BAD_REQUEST);
        String keyword = raw == null ? "" : raw.strip();
        return new SearchQuery(keyword, limit, filter == null || filter.term() == null ? keyword : filter.term(),
                filter == null ? "all" : filter.scope(), filter == null ? null : filter.date(), filter == null ? "" : filter.region());
    }
    String pattern() {
        return "%" + term.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }
    boolean includes(String group) { return scope.equals("all") || scope.equals(group); }
    String exact() { return term.toLowerCase(Locale.ROOT); }
    String prefix() { return pattern().substring(1); }
    List<String> related() { return RELATED.getOrDefault(term, List.of()); }
    LocalDateTime dayStart() { return date == null ? null : date.atStartOfDay(ServiceTime.ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime(); }
    LocalDateTime dayEnd() { return date == null ? null : date.plusDays(1).atStartOfDay(ServiceTime.ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime(); }
    static String text(String value, int length) {
        if (value == null) return "";
        String normalized = value.replaceAll("[\\p{Cntrl}\\p{Z}]+", " ").strip();
        int count = Math.min(length, normalized.codePointCount(0, normalized.length()));
        return normalized.substring(0, normalized.offsetByCodePoints(0, count));
    }
}
