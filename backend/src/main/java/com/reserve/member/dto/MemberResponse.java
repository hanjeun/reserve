package com.reserve.member.dto;

import com.reserve.member.entity.AuthProvider;
import com.reserve.member.entity.Member;
import com.reserve.member.entity.Role;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class MemberResponse {
    private Long id;
    private String name;
    private String email;
    private Role role;
    private AuthProvider provider;   // LOCAL / GOOGLE / NAVER / KAKAO
    private String profileImage;

    public static MemberResponse fromEntity(Member member) {
        return new MemberResponse(
                member.getId(),
                member.getName(),
                member.getEmail(),
                member.getRole(),
                member.getProvider(),
                member.getProfileImage()
        );
    }
}
