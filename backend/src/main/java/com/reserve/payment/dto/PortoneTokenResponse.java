package com.reserve.payment.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.*;

/**
 * 포트원 Access Token 응답 DTO
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PortoneTokenResponse {
    
    private int code;
    private String message;
    private Response response;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Response {
        @JsonProperty("access_token")
        private String accessToken;
        
        @JsonProperty("expired_at")
        private long expiredAt;
        
        private long now;
    }
}
