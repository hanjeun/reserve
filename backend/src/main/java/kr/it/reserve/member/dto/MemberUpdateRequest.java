package kr.it.reserve.member.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties("role")
public class MemberUpdateRequest {
    private String name;
    private String email;
    private String password;
    private String passwordConfirm;
    private Boolean emailNotificationEnabled;
}
