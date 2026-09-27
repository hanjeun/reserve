package kr.it.reserve.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SendChatImageRequest {
    @Size(max = 2000, message = "2000자까지 입력할 수 있습니다.")
    private String content = "";

    @NotBlank(message = "메시지 식별자가 필요합니다.")
    @Size(max = 64)
    @Pattern(regexp = "[A-Za-z0-9_-]+")
    private String clientMessageId;
}
