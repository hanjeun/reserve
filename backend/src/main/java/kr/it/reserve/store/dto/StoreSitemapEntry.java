package kr.it.reserve.store.dto;

import java.time.LocalDateTime;

/** Sitemap 생성에 필요한 공개 가게의 최소 필드. */
public record StoreSitemapEntry(
        Long id,
        LocalDateTime updatedAt,
        LocalDateTime createdAt
) {
    public LocalDateTime lastModifiedAt() {
        return updatedAt != null ? updatedAt : createdAt;
    }
}
