package kr.it.reserve.seo.service;

import kr.it.reserve.store.dto.StoreSitemapEntry;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SitemapService {

    private static final String ORIGIN = "https://reserve.it.kr";
    private static final int MAX_STORE_URLS = 49_996;

    private final StoreRepository storeRepository;

    /**
     * sitemap 프로토콜의 파일당 50,000 URL 제한을 지키며 공개 URL만 만든다.
     * 로그인·회원가입·마이페이지 같은 기능 경로는 검색 결과로서 가치가 없어 제외한다.
     */
    @Transactional(readOnly = true)
    public String build() {
        List<StoreSitemapEntry> stores = storeRepository.findPublicSitemapEntries(
                PageRequest.of(0, MAX_STORE_URLS, Sort.by(Sort.Direction.ASC, "id"))
        );

        LocalDate storesLastModified = stores.stream()
                .map(StoreSitemapEntry::lastModifiedAt)
                .filter(value -> value != null)
                .max(Comparator.naturalOrder())
                .map(value -> value.toLocalDate())
                .orElse(null);

        StringBuilder xml = new StringBuilder(512 + stores.size() * 140);
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
                .append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");

        appendUrl(xml, ORIGIN + "/", null, "weekly", "1.0");
        appendUrl(xml, ORIGIN + "/stores", storesLastModified, "daily", "0.9");
        appendUrl(xml, ORIGIN + "/terms", null, "monthly", "0.3");
        appendUrl(xml, ORIGIN + "/privacy", null, "monthly", "0.3");

        for (StoreSitemapEntry store : stores) {
            LocalDate lastModified = store.lastModifiedAt() == null
                    ? null
                    : store.lastModifiedAt().toLocalDate();
            appendUrl(xml, ORIGIN + "/store/" + store.id(), lastModified, "weekly", "0.8");
        }

        return xml.append("</urlset>\n").toString();
    }

    private void appendUrl(
            StringBuilder xml,
            String location,
            LocalDate lastModified,
            String changeFrequency,
            String priority
    ) {
        xml.append("  <url>\n")
                .append("    <loc>").append(location).append("</loc>\n");
        if (lastModified != null) {
            xml.append("    <lastmod>").append(lastModified).append("</lastmod>\n");
        }
        xml.append("    <changefreq>").append(changeFrequency).append("</changefreq>\n")
                .append("    <priority>").append(priority).append("</priority>\n")
                .append("  </url>\n");
    }
}
