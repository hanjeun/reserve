package kr.it.reserve.chat.service;

import kr.it.reserve.global.error.ChatException;
import org.springframework.http.HttpStatus;

/** 신고 상태와 보존 설정은 같은 행의 버전을 확인해 서로의 변경을 보호한다. */
final class ChatReportEditPolicy {
    private ChatReportEditPolicy() {}

    static void requireRevision(Long expected, long current) {
        if (expected == null || expected < 0) throw new ChatException("확인한 신고 버전이 필요해요. 다시 불러와주세요.", HttpStatus.BAD_REQUEST);
        if (expected != current) throw new ChatException("다른 관리자가 신고를 변경했어요. 다시 불러와 검토해주세요.", HttpStatus.CONFLICT);
    }
}
