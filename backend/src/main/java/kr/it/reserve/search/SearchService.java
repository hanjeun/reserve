package kr.it.reserve.search;

import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.function.Supplier;

/** Each source owns its read transaction, so an unavailable group cannot roll back another group's reads. */
@Service
@RequiredArgsConstructor
public class SearchService {
    private final SearchQueries sources;
    private final FeedPolicy feedPolicy;

    public SearchResponse publicSearch(String keyword, int limit) {
        SearchQuery query = SearchQuery.from(keyword, limit);
        return new SearchResponse(query.keyword(), List.of(
                group("stores", "가게", query, () -> sources.stores(query)),
                group("benefits", "혜택", query, () -> sources.benefits(query)),
                query.keyword().isEmpty() || feedPolicy.isEnabled()
                        ? group("feed", "공개 피드", query, () -> sources.feed(query))
                        : unavailable("feed", "공개 피드", "피드를 준비 중이에요.")));
    }

    public SearchResponse personalSearch(String keyword, int limit, Member member) {
        if (member == null || member.getId() == null || member.isDeleted() || member.isSuspended())
            throw new MemberException("로그인 상태를 확인해주세요.", HttpStatus.FORBIDDEN);
        SearchQuery query = SearchQuery.from(keyword, limit);
        return new SearchResponse(query.keyword(), List.of(
                group("reservations", "내 예약", query, () -> sources.reservations(query, member.getId())),
                group("waiting", "내 웨이팅", query, () -> sources.waiting(query, member.getId())),
                group("messages", "내 메시지 · 최근 90일", query,
                        () -> sources.messages(query, member.getId(), member.isBusiness()))));
    }

    private SearchResponse.Group group(String key, String title, SearchQuery query, Supplier<List<SearchResponse.Item>> source) {
        if (query.keyword().isEmpty()) return SearchResponse.Group.empty(key, title);
        try {
            List<SearchResponse.Item> rows = source.get();
            return new SearchResponse.Group(key, title, List.copyOf(rows.subList(0, Math.min(query.limit(), rows.size()))),
                    null, rows.size() > query.limit());
        } catch (DataAccessException unavailable) {
            return unavailable(key, title, "검색 결과를 잠시 불러올 수 없어요. 다시 시도해주세요.");
        }
    }
    private SearchResponse.Group unavailable(String key, String title, String message) {
        return new SearchResponse.Group(key, title, List.of(), new SearchResponse.GroupError(503, message), false);
    }
}
