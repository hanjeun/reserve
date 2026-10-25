package kr.it.reserve.member.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 주소가 없는 좌표 전용 요청도 허용한다. */
@Getter
@Setter
@NoArgsConstructor
public class LocationUpdateRequest {

    private Double latitude;

    private Double longitude;

    private String address;

    private String zipCode;

    private String addressDetail;
}
