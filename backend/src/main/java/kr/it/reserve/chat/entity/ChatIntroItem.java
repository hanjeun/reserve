package kr.it.reserve.chat.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 자동 문답 한 쌍 — 손님이 질문 버튼을 누르면 이 답변이 바로 보인다.
 * 서버 메시지로 저장되지 않는 안내라 사장님·관리자를 호출하지 않는다.
 */
@Embeddable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class ChatIntroItem {

    @Column(name = "question", length = 40, nullable = false)
    private String question;

    @Column(name = "answer", length = 300, nullable = false)
    private String answer;
}
