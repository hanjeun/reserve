package kr.it.reserve.store.util;

import java.util.List;

/** 주소 기반 지역 선택기의 시도 약칭과 공식명 호환 정본. */
public final class StoreRegionNames {

    private StoreRegionNames() {
    }

    public static String[] addressParts(String address) {
        if (address == null || address.isBlank()) return new String[0];
        String[] parts = address.trim().split("\\s+");
        parts[0] = normalize(parts[0]);
        return parts;
    }

    public static String normalize(String token) {
        return switch (token) {
            case "서울시", "서울특별시" -> "서울";
            case "부산시", "부산광역시" -> "부산";
            case "대구시", "대구광역시" -> "대구";
            case "인천시", "인천광역시" -> "인천";
            case "광주시", "광주광역시" -> "광주";
            case "대전시", "대전광역시" -> "대전";
            case "울산시", "울산광역시" -> "울산";
            case "세종시", "세종특별자치시" -> "세종";
            case "경기도" -> "경기";
            case "강원도", "강원특별자치도" -> "강원";
            case "충청북도" -> "충북";
            case "충청남도" -> "충남";
            case "전라북도", "전북특별자치도" -> "전북";
            case "전라남도" -> "전남";
            case "경상북도" -> "경북";
            case "경상남도" -> "경남";
            case "제주도", "제주특별자치도" -> "제주";
            default -> token;
        };
    }

    public static List<String> variants(String normalized) {
        return switch (normalized) {
            case "서울" -> List.of("서울", "서울시", "서울특별시");
            case "부산" -> List.of("부산", "부산시", "부산광역시");
            case "대구" -> List.of("대구", "대구시", "대구광역시");
            case "인천" -> List.of("인천", "인천시", "인천광역시");
            case "광주" -> List.of("광주", "광주시", "광주광역시");
            case "대전" -> List.of("대전", "대전시", "대전광역시");
            case "울산" -> List.of("울산", "울산시", "울산광역시");
            case "세종" -> List.of("세종", "세종시", "세종특별자치시");
            case "경기" -> List.of("경기", "경기도");
            case "강원" -> List.of("강원", "강원도", "강원특별자치도");
            case "충북" -> List.of("충북", "충청북도");
            case "충남" -> List.of("충남", "충청남도");
            case "전북" -> List.of("전북", "전라북도", "전북특별자치도");
            case "전남" -> List.of("전남", "전라남도");
            case "경북" -> List.of("경북", "경상북도");
            case "경남" -> List.of("경남", "경상남도");
            case "제주" -> List.of("제주", "제주도", "제주특별자치도");
            default -> List.of(normalized);
        };
    }
}
