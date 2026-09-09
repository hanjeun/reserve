package kr.it.reserve.global.common;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import kr.it.reserve.global.error.BusinessException;

/** 사용자 입력으로 만드는 페이지 요청의 공통 상한. 서버 내부 배치 크기와는 구분한다. */
public final class PageRequests {
    public static final int MAX_SIZE = 100;

    private PageRequests() {
    }

    public static PageRequest bounded(int page, int size) {
        PageRequest request = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, MAX_SIZE)));
        // JPA의 offset은 int 범위다. 큰 페이지 입력이 서버 오류로 번지지 않게 경계에서 거부한다.
        if (request.getOffset() > Integer.MAX_VALUE) {
            throw new BusinessException("조회 가능한 페이지 범위를 초과했습니다.", HttpStatus.BAD_REQUEST);
        }
        return request;
    }
}
