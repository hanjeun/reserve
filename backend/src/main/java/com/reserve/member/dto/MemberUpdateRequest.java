package com.reserve.member.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class MemberUpdateRequest {
    private String name;
    private String email;
    private String password;
    private String passwordConfirm;
    private String role;
}
