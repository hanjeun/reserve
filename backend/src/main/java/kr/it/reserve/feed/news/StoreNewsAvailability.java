package kr.it.reserve.feed.news;

import kr.it.reserve.feed.FeedException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** 혜택 작성·심사는 SNS 피드의 활성화 설정과 독립이다. */
@Component
public class StoreNewsAvailability {
    private final boolean enabled;
    public StoreNewsAvailability(@Value("${STORE_NEWS_ENABLED:false}") boolean enabled) { this.enabled = enabled; }
    public boolean isEnabled() { return enabled; }
    public void requireEnabled() {
        if (!enabled) throw new FeedException("가게 혜택을 준비 중이에요.", HttpStatus.SERVICE_UNAVAILABLE);
    }
}
