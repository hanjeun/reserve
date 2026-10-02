package kr.it.reserve.store.controller;

import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.store.service.StorePageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class StorePageController {
    private final StorePageService pages;

    @GetMapping(value = "/api/public/store-pages/{id:\\d+}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> storePage(@PathVariable Long id) {
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(pages.storePage(id));
        } catch (StoreException exception) {
            if (exception.getStatus() != HttpStatus.NOT_FOUND) throw exception;
            return ResponseEntity.status(HttpStatus.NOT_FOUND).cacheControl(CacheControl.noStore())
                    .header("X-Robots-Tag", "noindex, nofollow").body(pages.notFoundPage());
        }
    }
}
