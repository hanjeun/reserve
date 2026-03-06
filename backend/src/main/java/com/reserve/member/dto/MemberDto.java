package com.reserve.member.dto;

import com.reserve.member.entity.Role;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberDto {

    @NotEmpty(message = "이름은 필수 항목입니다.")
    private String name;

    @NotEmpty(message = "이메일은 필수 항목입니다.")
    @Size(max = 30, message = "이메일은 30자 이내로 작성해주세요.")
    private String email;

    @NotEmpty(message = "비밀번호는 필수 항목입니다.")
    @Size(min = 8, message = "비밀번호는 8자 이상으로 입력해주세요.")
    private String password;

    @NotEmpty(message = "비밀번호 확인은 필수 항목입니다.")
    @Size(min = 8, message = "비밀번호는 8자 이상으로 입력해주세요.")
    private String passwordConfirm;

    @NotNull(message = "사용자 유형을 선택해주세요.")
    @Builder.Default
    private Role role = Role.USER; // 기본값: 일반 사용자
}
