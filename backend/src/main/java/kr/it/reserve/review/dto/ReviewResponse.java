package kr.it.reserve.review.dto;

import kr.it.reserve.review.entity.Review;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Getter
@Builder
public class ReviewResponse {

    public static final String FALLBACK_NAME = "리저브 이용자";

    private Long id;
    private Long storeId;
    private String storeName;
    private Long memberId;
    private String memberName;
    private String authorPublicId;
    private String authorAvatarUrl;
    private String authorAlias;
    private Long reservationId;
    private boolean mine;
    private Integer rating;
    private String title;
    private String content;
    private String ownerReply;
    private LocalDateTime ownerRepliedAt;
    private boolean moderationHidden;
    private LocalDateTime createdAt;
    private String createdAtFormatted;
    private List<Photo> photos;
    private ReviewInteractionResponse.Summary interactions;

    public record Photo(Long id, String url, int width, int height, String thumbnailUrl) { }

    public static ReviewResponse fromEntity(Review review) {
        return fromEntity(review, null, false, ReviewInteractionResponse.Summary.EMPTY);
    }

    public static ReviewResponse fromEntity(Review review, PublicReviewAuthor author, boolean mine, ReviewInteractionResponse.Summary interactions) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy.MM.dd");
        String alias = review.getAuthorAlias();
        PublicReviewAuthor visibleProfile = alias == null ? author : null;
        return ReviewResponse.builder()
                .id(review.getId())
                .storeId(review.getStore().getId())
                .storeName(review.getStore().getName())
                .memberId(mine ? review.getMember().getId() : null)
                .memberName(alias != null ? alias : visibleProfile == null ? FALLBACK_NAME : visibleProfile.nickname())
                .authorPublicId(visibleProfile == null ? null : visibleProfile.publicId())
                .authorAvatarUrl(visibleProfile == null ? null : visibleProfile.avatarUrl())
                .authorAlias(alias)
                .reservationId(mine && review.getReservation() != null ? review.getReservation().getId() : null)
                .mine(mine)
                .rating(review.getRating())
                .title(review.getTitle())
                .content(review.getContent())
                .ownerReply(review.getOwnerReply())
                .ownerRepliedAt(review.getOwnerRepliedAt())
                .moderationHidden(review.isModerationHidden())
                .photos(photoList(review))
                .interactions(interactions)
                .createdAt(review.getCreatedAt())
                .createdAtFormatted(review.getCreatedAt() != null ? 
                        review.getCreatedAt().format(formatter) : "")
                .build();
    }

    public static List<Photo> photoList(Review review) {
        return review.isModerationHidden() ? List.of() : review.getPhotos().stream().map(photo -> {
            String url = "/api/reviews/" + review.getId() + "/photos/" + photo.getId();
            return new Photo(photo.getId(), url, photo.getWidth(), photo.getHeight(), url + "?size=thumbnail");
        }).toList();
    }
}
