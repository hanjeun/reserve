package kr.it.reserve.search;

import kr.it.reserve.feed.FeedPolicy;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SearchServiceTest {
    private final SearchQueries sources = mock(SearchQueries.class);
    private SearchService service;
    @BeforeEach void setup() { service = new SearchService(sources, new FeedPolicy(true)); }
    @Test void anEmptyTermDoesNotReadAnyDomainOrCreateAnything() {
        assertThat(service.publicSearch(" ", 5).groups()).hasSize(3).allMatch(group -> group.items().isEmpty());
        assertThat(service.personalSearch("", 5, actor()).groups()).hasSize(3).allMatch(group -> group.items().isEmpty());
        verifyNoInteractions(sources);
    }
    @Test void returnsOnlyTheBoundedWindowAndSignalsMoreWithoutReturningTotals() {
        var rows = IntStream.range(1, 7).mapToObj(id ->
                new SearchResponse.Item((long) id, "STORE", "가게", "설명", "/store/" + id)).toList();
        when(sources.stores(any())).thenReturn(rows);
        var group = service.publicSearch("가게", 5).groups().getFirst();
        assertThat(group.items()).hasSize(5); assertThat(group.hasMore()).isTrue(); assertThat(group.error()).isNull();
    }
    @Test void anInfrastructureFailureIsLocalToItsGroupAndHasNoRawErrorDetails() {
        when(sources.stores(any())).thenThrow(new DataAccessResourceFailureException("private JDBC credentials and host"));
        var benefit = new SearchResponse.Item(1L, "BENEFIT", "혜택", "공개", "/benefits/1");
        when(sources.benefits(any())).thenReturn(List.of(benefit));
        var groups = service.publicSearch("혜택", 5).groups();
        assertThat(groups.getFirst().error().status()).isEqualTo(503);
        assertThat(groups.getFirst().error().message()).doesNotContain("JDBC", "credentials", "host");
        assertThat(groups.get(1).items()).containsExactly(benefit); assertThat(groups.get(1).error()).isNull();
    }
    @Test void ownershipAndAuthenticationFailuresAreNeverConvertedIntoEmptyResults() {
        var denied = new MemberException("접근 권한이 없어요.", HttpStatus.FORBIDDEN);
        when(sources.reservations(any(), eq(7L))).thenThrow(denied);
        assertThatThrownBy(() -> service.personalSearch("예약", 5, actor())).isSameAs(denied);
    }
    @Test void unavailableFeedDoesNotReadTheFeedOrDisableOtherGroups() {
        service = new SearchService(sources, new FeedPolicy(false));
        var groups = service.publicSearch("가게", 5).groups();
        assertThat(groups.get(2).error().status()).isEqualTo(503);
        verify(sources, never()).feed(any()); verify(sources).stores(any()); verify(sources).benefits(any());
    }
    @Test void deletedOrSuspendedPrincipalsCannotReadPersonalSources() {
        Member member = actor(); member.setDeletedAt(LocalDateTime.now());
        assertThatThrownBy(() -> service.personalSearch("내역", 5, member)).isInstanceOf(MemberException.class);
        member.setDeletedAt(null); member.ban("synthetic");
        assertThatThrownBy(() -> service.personalSearch("내역", 5, member)).isInstanceOf(MemberException.class);
        verifyNoInteractions(sources);
    }
    private Member actor() { return Member.builder().id(7L).role(Role.USER).build(); }
}
