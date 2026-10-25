package kr.it.reserve.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 일반 실행은 스케줄러를 켜고 명시적인 격리 실행만 끌 수 있다. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "reserve.scheduling.enabled", havingValue = "true", matchIfMissing = true)
public class SchedulingConfig {
}
