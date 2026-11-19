package kr.it.reserve.review.service;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.review.dto.PublicReviewAuthor;

import java.util.Collection;
import java.util.Map;

public interface ReviewAuthorReader {
    Map<Long, ? extends PublicReviewAuthor> reviewAuthors(Collection<Long> ids, Member viewer);
}
