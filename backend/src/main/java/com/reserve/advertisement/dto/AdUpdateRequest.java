package com.reserve.advertisement.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * 배너 광고 콘텐츠 수정 요청 (PATCH /api/advertisements/{id}).
 *
 * 2026-07 추가 — 배너형 광고는 신청 후 제목/설명/이미지를 고칠 방법이 전혀 없었다(취소하고
 * 새로 신청하는 것만 가능). AdCreateRequest와 필드가 거의 같지만 별도 DTO로 두는 이유:
 * storeId/adType/기간은 여기서 안 바꾼다(가게·유형·노출 기간은 결제 금액과 얽혀 있어 수정
 * 범위 밖으로 뒀다 — 바꾸고 싶으면 취소 후 재신청). 그래서 AdCreateRequest를 그대로 재사용하면
 * "이 필드들은 여기선 무시됨"을 호출부가 알아야 하는데, 별도 DTO가 그 자체로 계약을 명확히 한다.
 *
 * images가 null이면 "이미지는 그대로 유지"를 의미하고, 빈 리스트가 아닌 실제 파일 목록이 오면
 * 기존 이미지를 통째로 교체한다(부분 추가/삭제 없음 — StoreImages처럼 개별 이미지 삭제 UI까지
 * 만들기엔 배너는 최대 5장으로 범위가 작아, "새로 다 올리기"가 충분히 단순하고 안전하다).
 */
@Getter
@Setter
@NoArgsConstructor
public class AdUpdateRequest {

    private String title;
    private String description;

    // null이면 이미지 유지, 값이 있으면 기존 이미지를 통째로 교체
    private List<MultipartFile> images;
}
