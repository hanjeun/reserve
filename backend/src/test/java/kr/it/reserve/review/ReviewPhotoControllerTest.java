package kr.it.reserve.review;

import kr.it.reserve.global.error.GlobalExceptionHandler;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.review.controller.ReviewApiController;
import kr.it.reserve.review.dto.ReviewCreateRequest;
import kr.it.reserve.review.dto.ReviewUpdateRequest;
import kr.it.reserve.review.service.ReviewService;
import kr.it.reserve.review.service.ReviewPhotos;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class ReviewPhotoControllerTest {
    private final ReviewService service = mock(ReviewService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final MockMvc mvc = standaloneSetup(new ReviewApiController(service, limiter))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
    private final Member member = Member.builder().id(7L).build();

    @BeforeEach
    void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(member, null, List.of()));
        when(limiter.tryConsume(any(), any())).thenReturn(true);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void browserCanRevalidateAPhotoWithoutDownloadingItsBytesAgain() throws Exception {
        String url = "/api/reviews/19/photos/23?size=thumbnail";
        String etag = "\"synthetic-version-thumbnail\"";
        when(service.getPhoto(eq(19L), eq(23L), eq(true), any())).thenAnswer(call -> {
            Predicate<String> conditional = call.getArgument(3);
            return new ReviewService.PhotoRead(etag, conditional.test(etag) ? null
                    : new ReviewPhotos.ImageContent(new byte[]{1, 2}, "image/png"));
        });

        mvc.perform(get(url)).andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ETAG, etag))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-cache, private"))
                .andExpect(content().bytes(new byte[]{1, 2}));
        mvc.perform(get(url).header(HttpHeaders.IF_NONE_MATCH, etag)).andExpect(status().isNotModified())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-cache, private"))
                .andExpect(content().bytes(new byte[0]));
    }

    @Test
    void multipartCreateBindsTheSelectedReservationAndOrderedFiles() throws Exception {
        MockMultipartFile portrait = new MockMultipartFile("photos", "portrait.png", "image/png", new byte[] {1});
        MockMultipartFile landscape = new MockMultipartFile("photos", "landscape.jpg", "image/jpeg", new byte[] {2});
        mvc.perform(multipart("/api/reviews")
                        .file(json("review", """
                                {"reservationId":41,"rating":5,"title":"방문 후기","content":"자세한 이용 후기입니다."}
                                """))
                        .file(portrait).file(landscape))
                .andExpect(status().isCreated());
        var request = ArgumentCaptor.forClass(ReviewCreateRequest.class);
        verify(service).createReview(request.capture(), eq(member), eq(List.of(portrait, landscape)));
        assertThat(request.getValue().getReservationId()).isEqualTo(41L);
    }

    @Test
    void multipartUpdateBindsOnlyTheExplicitPhotoRemovals() throws Exception {
        mvc.perform(multipart(HttpMethod.PUT, "/api/reviews/19")
                        .file(json("review", """
                                {"rating":4,"title":"방문 후기","content":"수정한 방문 후기입니다."}
                                """))
                        .file(json("removedPhotoIds", "[23]")))
                .andExpect(status().isOk());
        verify(service).updateReview(eq(19L), any(ReviewUpdateRequest.class), eq(member), eq(List.of(23L)), eq(List.of()));
    }

    @Test
    void exhaustedMemberBudgetStopsReviewWritesBeforePhotoProcessing() throws Exception {
        when(limiter.tryConsume("review-write-member:7", RateLimiter.Policy.CHAT_MEMBER_SEND)).thenReturn(false);

        mvc.perform(multipart(HttpMethod.PUT, "/api/reviews/19")
                        .file(json("review", """
                                {"rating":4,"title":"방문 후기","content":"수정한 방문 후기입니다."}
                                """)))
                .andExpect(status().isTooManyRequests());
        verifyNoInteractions(service);
    }

    private static MockMultipartFile json(String name, String contents) {
        return new MockMultipartFile(name, "blob", "application/json", contents.getBytes(StandardCharsets.UTF_8));
    }
}
