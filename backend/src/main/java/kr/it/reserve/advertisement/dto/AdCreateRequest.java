package kr.it.reserve.advertisement.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
public class AdCreateRequest {

    private Long storeId;

    // BADGE | BANNER (advertisement.entity.AdType)
    private String adType;

    // BANNER 타입만 사용
    // 추천 문구 키. title/description이 비어 있으면 서버가 이 프리셋(또는 기본 프리셋)을 사용한다.
    private String bannerCopyKey;
    private String bannerMotionKey;
    // 둘 다 입력하면 프리셋을 바탕으로 사용자가 다듬은 최종 문구로 저장한다.
    private String title;
    private String description;
    private List<MultipartFile> images;

    private LocalDate startDate;
    private LocalDate endDate;
}
