package kr.it.reserve.notice.dto;

import kr.it.reserve.notice.entity.Notice;
import lombok.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NoticeDTO {
    
    private Long id;
    private String title;
    private String content;
    private Boolean isImportant;
    private Integer viewCount;
    private String authorName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    // 화면 표시용
    private String formattedDate;
    
    public static NoticeDTO fromEntity(Notice notice) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        
        return NoticeDTO.builder()
                .id(notice.getId())
                .title(notice.getTitle())
                .content(notice.getContent())
                .isImportant(notice.getIsImportant())
                .viewCount(notice.getViewCount())
                .authorName(notice.getAuthor().getName())
                .createdAt(notice.getCreatedAt())
                .updatedAt(notice.getUpdatedAt())
                .formattedDate(notice.getCreatedAt() != null ? 
                        notice.getCreatedAt().format(formatter) : "")
                .build();
    }
}
