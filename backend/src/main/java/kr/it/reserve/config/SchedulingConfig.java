package kr.it.reserve.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Normal runs schedule workers; an explicitly isolated startup can leave every scheduled job stopped. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "reserve.scheduling.enabled", havingValue = "true", matchIfMissing = true)
public class SchedulingConfig {
}
