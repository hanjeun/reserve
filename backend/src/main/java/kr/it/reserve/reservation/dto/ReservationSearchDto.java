package kr.it.reserve.reservation.dto;

import lombok.*;

import java.time.LocalDate;

/**
 * 예약 검색 조건 DTO
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReservationSearchDto {
    
    private String keyword;         // 검색어 (이름, 이메일)
    private String status;          // 예약 상태 (PENDING, CONFIRMED, COMPLETED, REJECTED, CANCELLED, NO_SHOW)
    private LocalDate startDate;    // 시작 날짜
    private LocalDate endDate;      // 종료 날짜
    private String searchType;      // 검색 타입 (name, email, all)
    private int page;               // 페이지 번호 (0부터 시작)
    private int size;               // 페이지 크기
    
    // 기본값 설정
    public int getPage() {
        return page < 0 ? 0 : page;
    }
    
    public int getSize() {
        return size <= 0 ? 10 : Math.min(size, 100);
    }
}
