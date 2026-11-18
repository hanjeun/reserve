package kr.it.reserve.store.controller;

import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.store.service.StorePageService;
import kr.it.reserve.store.util.StorePublicAddress;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.function.Supplier;

@RestController
@RequiredArgsConstructor
public class StorePageController {
    private final StorePageService pages;

    @GetMapping(value = StorePublicAddress.PAGE_PREFIX + StorePublicAddress.UUID_SEGMENT, produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> storePageByPublicId(@PathVariable UUID publicId) {
        try {
            return page(() -> pages.storePage(publicId));
        } catch (ResponseStatusException exception) {
            if (!exception.getStatusCode().isSameCodeAs(HttpStatus.SERVICE_UNAVAILABLE)) throw exception;
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).cacheControl(CacheControl.noStore())
                    .header("X-Robots-Tag", "noindex, nofollow")
                    .contentType(new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8))
                    .body("공유 페이지를 준비하고 있어요. 잠시 후 다시 시도해주세요.");
        }
    }

    private ResponseEntity<String> page(Supplier<String> render) {
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(render.get());
        } catch (StoreException exception) {
            if (exception.getStatus() != HttpStatus.NOT_FOUND) throw exception;
            return ResponseEntity.status(HttpStatus.NOT_FOUND).cacheControl(CacheControl.noStore())
                    .header("X-Robots-Tag", "noindex, nofollow").body(pages.notFoundPage());
        }
    }
}
