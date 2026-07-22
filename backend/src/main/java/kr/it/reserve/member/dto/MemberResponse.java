package kr.it.reserve.member.dto;

import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.MemberStatus;
import kr.it.reserve.member.entity.Role;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@AllArgsConstructor
public class MemberResponse {
    private Long id;
    private String name;
    private String email;
    private Role role;
    private AuthProvider provider;
    private String profileImage;
    private boolean emailNotificationEnabled;
    private boolean termsAgreed;
    private boolean marketingAgreed;
    private MemberStatus status;
    private LocalDateTime suspendedUntil;
    private String suspendReason;
    private Double latitude;
    private Double longitude;
    // 위치 등록 시 사용자가 고른 주소 3종 (도로명 / 우편번호 / 상세주소).
    // 좌표만으로는 주소를 역산할 수 없고, AddressSearch는 이 3개를 한 세트로 다루므로
    // 마이페이지 위치 탭을 원래대로 복원하려면 셋 다 필요하다 (2026-07 전수조사).
    private String locationAddress;
    private String locationZipCode;
    private String locationAddressDetail;

    public static MemberResponse fromEntity(Member member) {
        return new MemberResponse(
                member.getId(),
                member.getName(),
                member.getEmail(),
                member.getRole(),
                member.getProvider(),
                member.getProfileImage(),
                member.isEmailNotificationEnabled(),
                member.isTermsAgreed(),
                member.isMarketingAgreed(),
                member.getStatus(),
                member.getSuspendedUntil(),
                member.getSuspendReason(),
                member.getLatitude(),
                member.getLongitude(),
                member.getLocationAddress(),
                member.getLocationZipCode(),
                member.getLocationAddressDetail()
        );
    }
}
