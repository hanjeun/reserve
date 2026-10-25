package kr.it.reserve.search;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class SearchMetricsTest {
    @Test void onlyFiniteGroupsAndOutcomesBecomeTagsWithoutQueryOrMemberContent() {
        var registry = new SimpleMeterRegistry(); var metrics = new SearchMetrics(registry);
        metrics.completed("stores", System.nanoTime(), 2, true);
        metrics.completed("messages", System.nanoTime(), 0, true);
        metrics.completed("messages", System.nanoTime(), 0, false);
        metrics.completed("private-query-member-99", System.nanoTime(), 1, true);
        assertThat(registry.find("reserve.search.duration").tag("group", "stores").timer().count()).isEqualTo(1);
        assertThat(registry.find("reserve.search.queries").tag("group", "messages").tag("outcome", "empty").counter().count()).isEqualTo(1);
        assertThat(registry.find("reserve.search.queries").tag("outcome", "error").counter().count()).isEqualTo(1);
        assertThat(registry.getMeters()).allSatisfy(meter -> assertThat(meter.getId().getTags().toString()).doesNotContain("private-query", "member-99"));
    }
    @Test void responseMetricsDistinguishPartialAndTotalFailuresWithoutChangingHttpSemantics() {
        var registry = new SimpleMeterRegistry(); var metrics = new SearchMetrics(registry);
        var ok = SearchResponse.Group.empty("stores", "가게");
        var failed = new SearchResponse.Group("benefits", "혜택", java.util.List.of(), new SearchResponse.GroupError(503, "일시 오류"), false);
        metrics.response("public", java.util.List.of(ok, failed));
        metrics.response("personal", java.util.List.of(failed));
        metrics.response("public", java.util.List.of(ok));
        metrics.response("query-with-private-content", java.util.List.of(failed));
        assertThat(registry.find("reserve.search.responses").tag("outcome", "partial").counter().count()).isEqualTo(1);
        assertThat(registry.find("reserve.search.responses").tag("outcome", "error").counter().count()).isEqualTo(1);
        assertThat(registry.find("reserve.search.responses").tag("outcome", "complete").counter().count()).isEqualTo(1);
        assertThat(registry.getMeters()).allSatisfy(meter -> assertThat(meter.getId().getTags().toString()).doesNotContain("private-content"));
    }

}
