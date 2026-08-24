package kr.it.reserve.chat.repository;

import kr.it.reserve.chat.entity.ChatMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    /**
     * 방의 메시지를 <b>최신부터</b> 페이지 단위로. 화면이 뒤집어서 그린다.
     *
     * <p>오래된 것부터 주면 "마지막 페이지"를 먼저 계산해야 대화 끝을 보여줄 수 있다.
     * 채팅은 항상 끝에서 시작하므로 최신부터가 자연스럽다.
     */
    Page<ChatMessage> findByRoomIdOrderByIdDesc(Long roomId, Pageable pageable);

    /** 폴링용 — 이 ID 보다 뒤에 온 메시지만. 전체를 다시 받지 않기 위한 것이다. */
    java.util.List<ChatMessage> findByRoomIdAndIdGreaterThanOrderByIdAsc(Long roomId, Long afterId);
}
