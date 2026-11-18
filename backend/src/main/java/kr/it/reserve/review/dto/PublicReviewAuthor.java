package kr.it.reserve.review.dto;

/** 공개 범위 검사를 통과한 작성자의 공개 정보만 제공한다. */
public interface PublicReviewAuthor {
    String publicId();
    String nickname();
    String avatarUrl();
}
