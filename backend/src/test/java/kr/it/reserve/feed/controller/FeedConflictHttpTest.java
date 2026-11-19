package kr.it.reserve.feed.controller;

import com.jayway.jsonpath.JsonPath;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.feed.FeedInteractionPolicy;
import kr.it.reserve.feed.entity.FeedComment;
import kr.it.reserve.feed.news.controller.StoreNewsController;
import kr.it.reserve.feed.news.service.StoreNewsEvents;
import kr.it.reserve.feed.news.service.StoreNewsService;
import kr.it.reserve.feed.service.ContentLikeService;
import kr.it.reserve.feed.service.FeedCommentService;
import kr.it.reserve.feed.service.FeedMediaService;
import kr.it.reserve.feed.service.FeedNotificationService;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.http.MediaType;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class FeedConflictHttpTest {
    @ParameterizedTest
    @EnumSource(Target.class)
    void staleCommentLikeAndNewsRequestsReturnANonCacheableConflictWithoutInternalDetails(Target target) throws Exception {
        var comments = mock(FeedCommentService.class);
        var likes = mock(ContentLikeService.class);
        var news = mock(StoreNewsService.class);
        var images = mock(FeedMediaService.class);
        var limiter = mock(RateLimiter.class);
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        var conflict = new ObjectOptimisticLockingFailureException(FeedComment.class, 31L);
        when(comments.edit(anyLong(), anyLong(), any())).thenThrow(conflict);
        when(comments.visibility(anyLong(), anyLong(), any())).thenThrow(conflict);
        when(likes.set(anyLong(), anyString(), anyLong(), anyBoolean())).thenThrow(conflict);
        when(news.edit(anyLong(), anyLong(), any())).thenThrow(conflict);
        var http = MockMvcBuilders.standaloneSetup(
                new FeedInteractionController(mock(FeedInteractionPolicy.class), likes, comments, images, mock(FeedNotificationService.class), limiter),
                new AdminFeedCommentController(comments, images),
                new StoreNewsController(news, images, limiter, mock(StoreNewsEvents.class)))
                .setControllerAdvice(new FeedExceptionHandler()).build();

        try (var security = mockStatic(SecurityUtil.class)) {
            security.when(() -> SecurityUtil.getCurrentMember("로그인이 필요해요.")).thenReturn(Member.builder().id(7L).build());
            security.when(SecurityUtil::getCurrentMemberId).thenReturn(7L);
            var response = http.perform(request(target).contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isConflict())
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.success").value(false))
                    .andExpect(jsonPath("$.message").value("게시물이 변경됐어요. 다시 불러온 뒤 수정해주세요."))
                    .andReturn().getResponse();
            var payload = JsonPath.parse(response.getContentAsString(StandardCharsets.UTF_8));
            assertThat((Object) payload.read("$.data")).isNull();
            String timestamp = payload.read("$.timestamp");
            assertThat(LocalDateTime.parse(timestamp)).isNotNull();
            assertThat(payload.delete("$.timestamp").jsonString())
                    .doesNotContain("FeedComment", "31", "org.springframework", "SQL");
        }
    }

    private MockHttpServletRequestBuilder request(Target target) {
        return switch (target) {
            case COMMENT -> put("/api/feed/comments/31").content("{\"content\":\"합성 댓글\",\"revision\":0}");
            case LIKE -> put("/api/feed/likes/COMMENT/31").content("{\"liked\":true}");
            case MODERATION -> patch("/api/admin/feed/comments/31/visibility").content("{\"hidden\":true,\"reason\":\"합성 검토\",\"revision\":0}");
            case NEWS -> put("/api/store-news/31").content("{\"storeId\":1,\"title\":\"합성 제목\",\"content\":\"합성 소식\",\"newsType\":\"NEWS\",\"revision\":0,\"feedEnabled\":false,\"draft\":false,\"benefitRequested\":false,\"mediaIds\":[],\"design\":\"STANDARD\"}");
        };
    }

    private enum Target { COMMENT, LIKE, MODERATION, NEWS }
}
