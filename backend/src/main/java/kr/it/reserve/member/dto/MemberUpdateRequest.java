package kr.it.reserve.member.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"role", "email"})
public class MemberUpdateRequest {
    @Size(min = 2, max = 20, message = "이름은 2~20자로 입력해주세요.")
    @Pattern(regexp = "(?U)(?=\\s*\\S)[^\\p{Cc}]+", message = "이름에 공백만 입력하거나 제어 문자를 사용할 수 없어요.")
    private String name;
    private Boolean emailNotificationEnabled;
}
