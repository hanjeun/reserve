package com.reserve.member.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 마이페이지 위치 등록 요청 (PATCH /api/member/me/location)
 *
 * 2026-07 전수조사로 신설. 예전엔 컨트롤러가 Map&lt;String, Double&gt;로 body를 받았는데,
 * 주소 문자열(String)을 함께 받도록 바뀌면서 Map&lt;String, Double&gt;로는 타입이 맞지 않게 됐다.
 * Map&lt;String, Object&gt;로 넓히고 캐스팅하는 대신 명시적 DTO로 교체 — 다른 요청 DTO들과도
 * 컨벤션이 일치한다.
 *
 * address는 nullable: 좌표만 넘기는 호출(브라우저 Geolocation 기반 등)도 여전히 유효하다.
 */
@Getter
@Setter
@NoArgsConstructor
public class LocationUpdateRequest {

    private Double latitude;

    private Double longitude;

    /**
     * AddressSearch에서 고른 주소 3종 (화면 프리필용).
     * AddressSearch는 도로명 + 우편번호 + 상세주소를 한 세트로 다루므로 셋 다 받아야
     * 나중에 화면을 원래대로 복원할 수 있다 (Store 엔티티와 동일한 구조).
     * 전부 nullable — 좌표만 넘기는 호출도 여전히 유효하다.
     */
    private String address;

    private String zipCode;

    private String addressDetail;
}
