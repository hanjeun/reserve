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
    // 사용자가 선택한 도로명·우편번호·상세주소를 함께 반환한다.
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
