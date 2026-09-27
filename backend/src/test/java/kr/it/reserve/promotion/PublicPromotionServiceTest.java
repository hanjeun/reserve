package kr.it.reserve.promotion;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.PromotionException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.promotion.dto.PromotionDto;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.promotion.service.PromotionService;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PublicPromotionServiceTest {

    @Mock PromotionRepository repository;
    @Mock MemberRepository memberRepository;
    @Mock StoreRepository storeRepository;
    @InjectMocks PromotionService service;

    @Test
    void publicListClampsPaginationAndLimitsUnicodePlainTextWithoutPrivateFields() throws Exception {
        Promotion promotion = promotion("  안내\n\t" + "🎁".repeat(170));
        when(repository.findAllPublic(any(Pageable.class))).thenReturn(new PageImpl<>(List.of(promotion)));

        var response = service.getPublicPromotions(-9, 999).getContent().getFirst();

        verify(repository).findAllPublic(argThat(pageable -> pageable.getPageNumber() == 0 && pageable.getPageSize() == 100));
        assertThat(response.getExcerpt()).startsWith("안내 🎁").endsWith("…");
        assertThat(response.getExcerpt().codePointCount(0, response.getExcerpt().length()))
                .isEqualTo(PromotionDto.PUBLIC_EXCERPT_LENGTH);
        assertThat(response.getMainImageUrl()).isEqualTo("https://cdn.example.test/store-original.png");
        assertThat(response.getCreatedAt()).isNull();
        assertPublicFields(response, "excerpt", "content");
        verifyNoMoreInteractions(repository);
        verifyNoInteractions(memberRepository, storeRepository);
    }

    @Test
    void publicDetailReturnsOriginalTextAndStoreImageWithoutIncrementingOrSaving() throws Exception {
        String raw = "<img src=x onerror=alert(1)>\n가게 안내 원문";
        Promotion promotion = promotion(raw);
        when(repository.findPublicById(7L)).thenReturn(Optional.of(promotion));

        var response = service.getPublicPromotion(7L);

        assertThat(response.getContent()).isEqualTo(raw);
        assertThat(response.getMainImageUrl()).isEqualTo(promotion.getStore().getMainImageUrl());
        assertPublicFields(response, "content", "excerpt");
        assertThat(promotion.getViewCount()).isEqualTo(12);
        verify(repository).findPublicById(7L);
        verifyNoMoreInteractions(repository);
        verifyNoInteractions(memberRepository, storeRepository);
    }

    @Test
    void hiddenOrMissingPublicDetailIsNotFoundWithoutAViewWrite() {
        when(repository.findPublicById(7L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getPublicPromotion(7L)).isInstanceOfSatisfying(PromotionException.class,
                exception -> assertThat(exception.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));

        verify(repository).findPublicById(7L);
        verifyNoMoreInteractions(repository);
    }

    @Test
    void shortExcerptKeepsMarkupAsLiteralTextAndAcceptsAbsentLegacyContent() {
        var literal = PromotionDto.PublicPromotionSummaryResponse.fromEntity(promotion("<b>안내</b>"));
        var absent = PromotionDto.PublicPromotionSummaryResponse.fromEntity(promotion(null));

        assertThat(literal.getExcerpt()).isEqualTo("<b>안내</b>");
        assertThat(absent.getExcerpt()).isEmpty();
    }

    private void assertPublicFields(Object response, String presentBodyField, String absentBodyField) throws Exception {
        var json = new ObjectMapper().findAndRegisterModules().valueToTree(response);
        assertThat(json.has(presentBodyField)).isTrue();
        for (String excluded : List.of(absentBodyField, "memberId", "memberName", "imageUrl", "likeCount", "viewCount",
                "specialMenu", "storyHistory", "tags")) {
            assertThat(json.has(excluded)).as(excluded).isFalse();
        }
        assertThat(json.toString()).doesNotContain("private author", "untrusted-promotion-image");
    }

    private Promotion promotion(String content) {
        Store store = Store.builder().id(3L).name("public store").address("공개 주소").category("카페")
                .mainImageUrl("https://cdn.example.test/store-original.png").build();
        return Promotion.builder().id(7L).store(store).member(Member.builder().id(99L).name("private author").build())
                .title("가게 소식").content(content).category(Promotion.PromotionCategory.CAFE)
                .imageUrl("https://untrusted-promotion-image.example.test/a.png").viewCount(12).build();
    }
}
