package kr.it.reserve.search;

import kr.it.reserve.global.error.BusinessException;
import org.springframework.http.HttpStatus;
import java.util.Locale;

record SearchQuery(String keyword, int limit) {
    static SearchQuery from(String raw, int limit) {
        if (raw != null && (raw.length() > 100 || raw.codePoints().anyMatch(Character::isISOControl)))
            throw new BusinessException("검색어는 제어 문자 없이 100자까지 입력해주세요.", HttpStatus.BAD_REQUEST);
        if (limit < 1 || limit > 5)
            throw new BusinessException("검색 결과는 1개부터 5개까지 조회할 수 있어요.", HttpStatus.BAD_REQUEST);
        return new SearchQuery(raw == null ? "" : raw.strip(), limit);
    }
    String pattern() {
        return "%" + keyword.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }
    static String text(String value, int length) {
        if (value == null) return "";
        String normalized = value.replaceAll("[\\p{Cntrl}\\p{Z}]+", " ").strip();
        int count = Math.min(length, normalized.codePointCount(0, normalized.length()));
        return normalized.substring(0, normalized.offsetByCodePoints(0, count));
    }
}
