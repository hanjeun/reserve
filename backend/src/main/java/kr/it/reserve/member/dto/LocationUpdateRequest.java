package kr.it.reserve.member.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 주소가 없는 좌표 전용 요청도 허용한다. */
@Getter
@Setter
@NoArgsConstructor
public class LocationUpdateRequest {

    @NotNull(message = "위도를 입력해주세요.")
    @DecimalMin(value = "-90", message = "위도는 -90~90 범위로 입력해주세요.")
    @DecimalMax(value = "90", message = "위도는 -90~90 범위로 입력해주세요.")
    private Double latitude;

    @NotNull(message = "경도를 입력해주세요.")
    @DecimalMin(value = "-180", message = "경도는 -180~180 범위로 입력해주세요.")
    @DecimalMax(value = "180", message = "경도는 -180~180 범위로 입력해주세요.")
    private Double longitude;

    @Size(max = 255, message = "주소는 255자 이내로 입력해주세요.")
    private String address;

    @Size(max = 10, message = "우편번호는 10자 이내로 입력해주세요.")
    private String zipCode;

    @Size(max = 255, message = "상세주소는 255자 이내로 입력해주세요.")
    private String addressDetail;

    @JsonIgnore
    @AssertTrue(message = "좌표는 유한한 숫자로 입력해주세요.")
    public boolean isCoordinatesFinite() {
        return (latitude == null || Double.isFinite(latitude))
                && (longitude == null || Double.isFinite(longitude));
    }
}
