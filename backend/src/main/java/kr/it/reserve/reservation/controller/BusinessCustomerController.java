package kr.it.reserve.reservation.controller;

import jakarta.validation.constraints.Size;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.ApiResponse;
import kr.it.reserve.reservation.repository.BusinessCustomerRepository;
import kr.it.reserve.reservation.service.BusinessCustomerService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/reservations/store/customers")
@RequiredArgsConstructor
public class BusinessCustomerController {
    private final BusinessCustomerService customers;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<BusinessCustomerService.Customer>>> list(@RequestParam(required = false) Long storeId,
            @RequestParam(required = false) @Size(max = 100) String search,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return privateData(customers.list(SecurityUtil.getCurrentMember(), storeId, search, page, size));
    }

    @GetMapping("/{storeId}/{memberId}/reservations")
    public ResponseEntity<ApiResponse<Page<BusinessCustomerRepository.ReservationRow>>> reservations(@PathVariable Long storeId,
            @PathVariable Long memberId, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return privateData(customers.reservations(SecurityUtil.getCurrentMember(), storeId, memberId, page, size));
    }

    @GetMapping("/{storeId}/{memberId}/reviews")
    public ResponseEntity<ApiResponse<Page<BusinessCustomerService.CustomerReview>>> reviews(@PathVariable Long storeId,
            @PathVariable Long memberId, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return privateData(customers.reviews(SecurityUtil.getCurrentMember(), storeId, memberId, page, size));
    }

    @GetMapping("/{storeId}/{memberId}/restrictions")
    public ResponseEntity<ApiResponse<BusinessCustomerService.RestrictionDetail>> restrictions(@PathVariable Long storeId,
            @PathVariable Long memberId, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return privateData(customers.restrictions(SecurityUtil.getCurrentMember(), storeId, memberId, page, size));
    }

    private <T> ResponseEntity<ApiResponse<T>> privateData(T data) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(data, "가게 고객 내역 조회 성공"));
    }
}
