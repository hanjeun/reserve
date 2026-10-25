package kr.it.reserve.advertisement.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** 결제 조건인 가게·유형·기간은 수정하지 않는다. 이미지가 없으면 기존 이미지를 유지한다. */
@Getter
@Setter
@NoArgsConstructor
public class AdUpdateRequest {

    private String bannerCopyKey;
    private String bannerMotionKey;
    // 둘 다 입력하면 최종 문구로 저장한다. 비어 있으면 bannerCopyKey의 추천 문구를 사용한다.
    private String title;
    private String description;

    // null이면 이미지 유지, 값이 있으면 기존 이미지를 통째로 교체
    private List<MultipartFile> images;
}
