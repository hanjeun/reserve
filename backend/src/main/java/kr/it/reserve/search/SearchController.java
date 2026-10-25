package kr.it.reserve.search;

import jakarta.servlet.http.HttpServletRequest;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/search")
public class SearchController {
    private final SearchService searches;
    private final RateLimiter limiter;

    @GetMapping
    public ResponseEntity<ApiResponse<SearchResponse>> publicSearch(@RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "5") int limit, @RequestParam(defaultValue = "all") String scope,
            @RequestParam(required = false) String term, @RequestParam(defaultValue = "") String date,
            @RequestParam(defaultValue = "") String region, HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        limited("search-public:ip:" + IpExtractor.extract(request));
        SearchFilter filter = SearchFilter.parse(scope, term, date, region);
        return response(filter == null ? searches.publicSearch(keyword, limit) : searches.publicSearch(keyword, limit, filter));
    }
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<SearchResponse>> personalSearch(@RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "5") int limit, @RequestParam(defaultValue = "all") String scope,
            @RequestParam(required = false) String term, @RequestParam(defaultValue = "") String date,
            @RequestParam(defaultValue = "") String region, HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        var member = SecurityUtil.getCurrentMember();
        limited("search-personal:member:" + member.getId());
        limited("search-personal:ip:" + IpExtractor.extract(request));
        SearchFilter filter = SearchFilter.parse(scope, term, date, region);
        return response(filter == null ? searches.personalSearch(keyword, limit, member) : searches.personalSearch(keyword, limit, member, filter));
    }
    private void limited(String key) {
        if (!limiter.tryConsume(key, RateLimiter.Policy.PROFILE_READ))
            throw new BusinessException("검색 요청이 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
    }
    private ResponseEntity<ApiResponse<SearchResponse>> response(SearchResponse result) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(result, "검색 결과를 불러왔어요."));
    }
}
