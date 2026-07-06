package com.reserve.advertisement.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
public class AdCreateRequest {

    private Long storeId;

    // BADGE | BANNER (com.reserve.advertisement.entity.AdType)
    private String adType;

    // BANNER 타입만 사용
    private String title;
    private String description;
    private MultipartFile image;

    private LocalDate startDate;
    private LocalDate endDate;
}
