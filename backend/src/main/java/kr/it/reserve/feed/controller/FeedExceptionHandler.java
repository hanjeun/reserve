package kr.it.reserve.feed.controller;

import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.feed.FeedException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import jakarta.persistence.OptimisticLockException;
import org.springframework.http.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.bind.annotation.*;

/** 피드의 unique/version 충돌만 안전한 409로 변환한다. SQL·회원 정보는 응답하지 않는다. */
@RestControllerAdvice(assignableTypes = {FeedController.class, AdminFeedController.class,
        kr.it.reserve.feed.news.controller.StoreNewsController.class, kr.it.reserve.feed.news.controller.PromotionApiController.class,
        kr.it.reserve.feed.news.controller.AdminStoreNewsController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class FeedExceptionHandler {
    @ExceptionHandler(FeedException.class)
    public ResponseEntity<ApiResponse<Void>> domain(FeedException exception) {
        return ResponseEntity.status(exception.getStatus()).cacheControl(CacheControl.noStore()).body(ApiResponse.error(exception.getMessage()));
    }
    @ExceptionHandler({DataIntegrityViolationException.class, ObjectOptimisticLockingFailureException.class, OptimisticLockException.class})
    public ResponseEntity<ApiResponse<Void>> conflict(RuntimeException exception) {
        String message = exception instanceof DataIntegrityViolationException
                ? "이미 사용 중인 닉네임이거나 처리된 요청이에요. 다시 확인해주세요."
                : "게시물이 변경됐어요. 다시 불러온 뒤 수정해주세요.";
        return ResponseEntity.status(HttpStatus.CONFLICT).cacheControl(CacheControl.noStore()).body(ApiResponse.error(message));
    }
}
