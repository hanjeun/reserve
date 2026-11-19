package kr.it.reserve.feed.service;

import kr.it.reserve.feed.dto.FeedDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;

/** 프로필 공개 범위를 확인한 호출자에게 공개 목적지가 있는 리뷰만 제공한다. */
public interface ProfileReviewReader {
    Page<FeedDto.ProfileReview> findPublished(Long memberId, boolean mine, LocalDateTime now, Pageable page);
}
