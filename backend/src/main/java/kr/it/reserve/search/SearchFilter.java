package kr.it.reserve.search;

import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.store.util.StoreRegionNames;
import org.springframework.http.HttpStatus;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Set;

public record SearchFilter(String scope, String term, LocalDate date, String region) {
    private static final Set<String> SCOPES = Set.of("all", "stores", "benefits", "feed", "reservations", "waiting", "messages");
    private static final Set<String> PROVINCES = Set.of("서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주");

    public SearchFilter {
        scope = scope == null || scope.isBlank() ? "all" : scope.strip();
        region = region == null ? "" : region.strip();
        if (!SCOPES.contains(scope) || term != null && (term.length() > 100 || term.codePoints().anyMatch(Character::isISOControl))) throw invalid();
        if (date != null && (!Set.of("reservations", "waiting", "messages").contains(scope) || date.getYear() < 1000 || date.getYear() > 9999)) throw invalid();
        if (!region.isEmpty()) {
            if (!"stores".equals(scope) || region.length() > 60) throw invalid();
            String[] parts = StoreRegionNames.addressParts(region);
            if (parts.length < 1 || parts.length > 2 || !PROVINCES.contains(parts[0])
                    || parts.length == 2 && !parts[1].matches("[가-힣]{1,12}[시군구]")) throw invalid();
            region = String.join(" ", parts);
        }
        if (term != null) term = term.strip();
        if ("all".equals(scope) && term != null && term.isEmpty()) throw invalid();
        if ("messages".equals(scope) && LocalDate.of(9999, 12, 31).equals(date)) throw invalid();
    }

    static SearchFilter parse(String scope, String term, String date, String region) {
        if ((scope == null || scope.equals("all")) && term == null && (date == null || date.isEmpty()) && (region == null || region.isEmpty())) return null;
        try { return new SearchFilter(scope, term, date == null || date.isEmpty() ? null : LocalDate.parse(date), region); }
        catch (DateTimeParseException failure) { throw invalid(); }
    }
    private static BusinessException invalid() { return new BusinessException("검색 대상·날짜·지역을 확인해주세요.", HttpStatus.BAD_REQUEST); }
}
