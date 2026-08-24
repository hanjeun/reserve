package kr.it.reserve.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SendMessageRequest {

    /**
     * 본문. 2000자 상한 — 채팅에 장문을 붙여넣는 건 대개 실수다.
     * 공백만 있는 메시지는 거절한다({@code @NotBlank}) — 화면에서도 막지만 API 는 직접 호출될 수 있다.
     */
    @NotBlank(message = "내용을 입력해주세요.")
    @Size(max = 2000, message = "2000자까지 입력할 수 있습니다.")
    private String content;
}
