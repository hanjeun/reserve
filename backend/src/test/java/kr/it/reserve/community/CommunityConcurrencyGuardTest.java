package kr.it.reserve.community;

import kr.it.reserve.community.dto.CommunityDto;
import kr.it.reserve.community.entity.CommunityPost;
import kr.it.reserve.community.entity.PostLike;
import kr.it.reserve.community.repository.CommunityCommentRepository;
import kr.it.reserve.community.repository.CommunityPostRepository;
import kr.it.reserve.community.repository.PostLikeRepository;
import kr.it.reserve.community.service.CommunityService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CommunityConcurrencyGuardTest {

    @Mock private CommunityPostRepository postRepository;
    @Mock private CommunityCommentRepository commentRepository;
    @Mock private PostLikeRepository postLikeRepository;
    @Mock private MemberRepository memberRepository;

    @InjectMocks
    private CommunityService communityService;

    @Test
    @DisplayName("상세 조회는 조회수를 DB 원자 쿼리로 증가시킨 뒤 새 값을 읽는다")
    void incrementsViewCountAtomically() {
        CommunityPost post = post(11L, 3);
        post.setViewCount(4);
        when(postRepository.incrementViewCount(11L)).thenReturn(1);
        when(postRepository.findByIdWithAuthorAndComments(11L)).thenReturn(Optional.of(post));

        CommunityDto.PostResponse response = communityService.getPost(11L, null);

        assertThat(response.getViewCount()).isEqualTo(4);
        verify(postRepository).incrementViewCount(11L);
        verify(postRepository, never()).save(post);
    }

    @Test
    @DisplayName("좋아요 토글은 회원과 게시글 쓰기 잠금을 거쳐 카운터를 갱신한다")
    void togglesLikeUnderWriteLock() {
        Member member = Member.builder().id(7L).name("회원").email("member@example.com").build();
        CommunityPost post = post(11L, 3);
        when(memberRepository.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(member));
        when(postRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(post));
        when(postLikeRepository.findByPostIdAndMemberId(11L, 7L)).thenReturn(Optional.empty());

        boolean liked = communityService.toggleLike(11L, 7L);

        assertThat(liked).isTrue();
        assertThat(post.getLikeCount()).isEqualTo(4);
        InOrder order = inOrder(memberRepository, postRepository, postLikeRepository);
        order.verify(memberRepository).findActiveByIdForUpdate(7L);
        order.verify(postRepository).findByIdForUpdate(11L);
        order.verify(postLikeRepository).findByPostIdAndMemberId(11L, 7L);
        order.verify(postLikeRepository).save(org.mockito.ArgumentMatchers.any(PostLike.class));
    }

    private CommunityPost post(Long id, int likeCount) {
        LocalDateTime now = LocalDateTime.of(2026, 9, 2, 12, 0);
        return CommunityPost.builder()
                .id(id)
                .author(Member.builder().id(9L).name("작성자").email("author@example.com").build())
                .title("제목")
                .content("내용")
                .category(CommunityPost.PostCategory.FREE)
                .viewCount(3)
                .likeCount(likeCount)
                .createdAt(now)
                .updatedAt(now)
                .build();
    }
}
