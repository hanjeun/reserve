package kr.it.reserve.business.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.web.multipart.MultipartFile;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class BusinessVerificationRequest {

    // 사업자 등록증 이미지
    private MultipartFile licenseImage;

    // 상호명
    private String businessName;

    // 사업자 등록번호 (선택)
    private String businessNumber;

    // 추가 메모 (선택)
    private String memo;
}
