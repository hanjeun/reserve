package kr.it.reserve.community;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.community.dto.CommunityDto;
import kr.it.reserve.community.entity.CommunityComment;
import kr.it.reserve.community.entity.CommunityPost;
import kr.it.reserve.member.entity.Member;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.spy;

class CommunityDtoContractTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void listProjectionUsesProvidedCountWithoutLoadingComments() {
        CommunityPost post = spy(post());
        doThrow(new IllegalStateException("comments must remain lazy")).when(post).getComments();

        CommunityDto.PostResponse response = CommunityDto.PostResponse.fromEntity(post, 7);

        assertThat(response.getCommentCount()).isEqualTo(7);
        assertThat(response.getCategory()).isEqualTo("QNA");
        assertThat(response.getCategoryDisplayName()).isEqualTo("질문");
        assertThat(response.getAuthorName()).isEqualTo("작성자");
        assertThat(response.getViewCount()).isEqualTo(3);
        assertThat(response.getLikeCount()).isEqualTo(2);
        assertPostWireContract(response, false, false);
    }

    @Test
    void anonymousDetailKeepsCountAndDefaultFlags() {
        CommunityDto.PostResponse response = CommunityDto.PostResponse.fromEntity(post());

        assertThat(response.getCommentCount()).isEqualTo(1);
        assertPostWireContract(response, false, false);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(longs = {7, 8})
    void viewerDetailRetainsIdentityAndLikeFlags(Long viewerId) {
        CommunityDto.PostResponse response = CommunityDto.PostResponse.fromEntity(post(), viewerId, true);

        assertThat(response.getCommentCount()).isEqualTo(1);
        assertPostWireContract(response, Long.valueOf(7).equals(viewerId), true);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(longs = {7, 8})
    void commentResponseRetainsMinuteFormatAndOwnerFlag(Long viewerId) {
        CommunityComment comment = post().getComments().getFirst();

        JsonNode json = objectMapper.valueToTree(CommunityDto.CommentResponse.fromEntity(comment, viewerId));

        assertThat(json.path("id").asLong()).isEqualTo(12);
        assertThat(json.path("content").asText()).isEqualTo("답변");
        assertThat(json.path("createdAt").asText()).isEqualTo("2026-10-03 09:05");
        assertThat(json.path("updatedAt").asText()).isEqualTo("2026-10-04 18:07");
        assertThat(json.path("isAuthor").asBoolean()).isEqualTo(Long.valueOf(7).equals(viewerId));
        assertThat(json.has("email")).isFalse();
        assertThat(json.has("password")).isFalse();
    }

    private void assertPostWireContract(CommunityDto.PostResponse response, boolean author, boolean liked) {
        JsonNode json = objectMapper.valueToTree(response);
        assertThat(json.path("id").asLong()).isEqualTo(11);
        assertThat(json.path("title").asText()).isEqualTo("예약 질문");
        assertThat(json.path("content").asText()).isEqualTo("문의 내용");
        assertThat(json.path("authorId").asLong()).isEqualTo(7);
        assertThat(json.path("createdAt").asText()).isEqualTo("2026-10-03 09:05");
        assertThat(json.path("updatedAt").asText()).isEqualTo("2026-10-04 18:07");
        assertThat(json.path("isAuthor").asBoolean()).isEqualTo(author);
        assertThat(json.path("isLiked").asBoolean()).isEqualTo(liked);
        assertThat(json.has("email")).isFalse();
        assertThat(json.has("password")).isFalse();
        assertThat(json.has("authVersion")).isFalse();
    }

    private CommunityPost post() {
        Member author = Member.builder().id(7L).name("작성자")
                .email("author@example.invalid").password("unused-test-password").authVersion(4).build();
        LocalDateTime createdAt = LocalDateTime.of(2026, 10, 3, 9, 5, 59);
        LocalDateTime updatedAt = LocalDateTime.of(2026, 10, 4, 18, 7, 42);
        CommunityComment comment = CommunityComment.builder().id(12L).author(author).content("답변")
                .createdAt(createdAt).updatedAt(updatedAt).build();
        return CommunityPost.builder().id(11L).author(author).title("예약 질문").content("문의 내용")
                .category(CommunityPost.PostCategory.QNA).viewCount(3).likeCount(2)
                .comments(List.of(comment)).createdAt(createdAt).updatedAt(updatedAt).build();
    }
}
