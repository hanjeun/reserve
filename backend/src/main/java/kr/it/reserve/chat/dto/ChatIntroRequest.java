package kr.it.reserve.chat.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 채팅 첫 안내 저장 요청. 항상 전체를 보낸다(부분 수정 없음).
 * 길이·개수는 화면에서 먼저 칸별로 막고, 여기서는 직접 호출을 막는다.
 */
public record ChatIntroRequest(
        @Size(max = 100, message = "공지사항은 100자까지 입력할 수 있어요.")
        String notice,

        @Size(max = 200, message = "인사말은 200자까지 입력할 수 있어요.")
        String greeting,

        @Size(max = 30, message = "표시 이름은 30자까지 입력할 수 있어요.")
        String displayName,

        @Size(max = 500)
        String avatarUrl,

        @Size(max = 5, message = "자주 묻는 질문은 5개까지 등록할 수 있어요.")
        List<@Valid Item> items
) {
    public record Item(
            @NotBlank(message = "질문을 입력해주세요.")
            @Size(max = 40, message = "질문은 40자까지 입력할 수 있어요.")
            String question,

            @NotBlank(message = "답변을 입력해주세요.")
            @Size(max = 300, message = "답변은 300자까지 입력할 수 있어요.")
            String answer
    ) {
    }
}
