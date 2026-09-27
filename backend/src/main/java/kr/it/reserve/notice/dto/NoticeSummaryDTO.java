package kr.it.reserve.notice.dto;

import kr.it.reserve.notice.entity.Notice;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

/** 홈 운영 안내에 필요한 최소 공개 필드. 긴 본문과 작성자 정보는 목록에서 내려보내지 않는다. */
@Getter
@Builder
public class NoticeSummaryDTO {

    private Long id;
    private String title;
    private Boolean isImportant;
    private LocalDateTime createdAt;

    public static NoticeSummaryDTO fromEntity(Notice notice) {
        return NoticeSummaryDTO.builder()
                .id(notice.getId())
                .title(notice.getTitle())
                .isImportant(notice.getIsImportant())
                .createdAt(notice.getCreatedAt())
                .build();
    }
}
