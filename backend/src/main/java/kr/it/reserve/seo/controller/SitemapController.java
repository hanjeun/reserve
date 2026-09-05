package kr.it.reserve.seo.controller;

import kr.it.reserve.seo.service.SitemapService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

@RestController
@RequiredArgsConstructor
public class SitemapController {

    private static final MediaType XML_UTF_8 = new MediaType(
            MediaType.APPLICATION_XML,
            StandardCharsets.UTF_8
    );

    private final SitemapService sitemapService;

    @GetMapping(value = "/sitemap.xml", produces = "application/xml;charset=UTF-8")
    public ResponseEntity<String> sitemap() {
        return ResponseEntity.ok()
                .contentType(XML_UTF_8)
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .body(sitemapService.build());
    }
}
