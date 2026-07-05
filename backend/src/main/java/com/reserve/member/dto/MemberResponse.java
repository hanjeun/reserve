package com.reserve.member.dto;

import com.reserve.member.entity.AuthProvider;
import com.reserve.member.entity.Member;
import com.reserve.member.entity.MemberStatus;
import com.reserve.member.entity.Role;
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
                member.getLongitude()
        );
    }
}
