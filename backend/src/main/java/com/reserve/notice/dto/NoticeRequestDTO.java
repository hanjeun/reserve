package com.reserve.notice.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NoticeRequestDTO {
    
    private String title;
    private String content;
    private Boolean isImportant;
}
