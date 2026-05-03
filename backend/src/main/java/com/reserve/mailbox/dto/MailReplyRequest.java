package com.reserve.mailbox.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class MailReplyRequest {

    @NotBlank(message = "답장 내용을 입력해주세요.")
    @Size(max = 2000, message = "답장 내용은 2000자 이내로 입력해주세요.")
    private String body;
}
