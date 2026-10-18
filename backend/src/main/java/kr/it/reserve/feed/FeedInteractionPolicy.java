package kr.it.reserve.feed;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import kr.it.reserve.feed.news.StoreNewsAvailability;

@Component @RequiredArgsConstructor
public class FeedInteractionPolicy {
    private final FeedPolicy feed;
    private final StoreNewsAvailability news;
    @Value("${FEED_INTERACTIONS_ENABLED:false}") private boolean enabled;
    public boolean isEnabled() { return feed.isEnabled() && enabled; }
    public boolean isNewsEnabled() { return news.isEnabled() && enabled; }
    public void requireNewsEnabled() {
        news.requireEnabled();
        if (!enabled) throw new FeedException("좋아요를 준비하고 있어요.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    public void requireAnyEnabled() {
        if (!isEnabled() && !isNewsEnabled()) throw new FeedException("좋아요를 준비하고 있어요.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    public void requireEnabled() {
        feed.requireEnabled();
        if (!enabled) throw new FeedException("좋아요·댓글을 준비하고 있어요.", HttpStatus.SERVICE_UNAVAILABLE);
    }
}
