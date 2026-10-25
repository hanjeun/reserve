package kr.it.reserve.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Slf4j
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    /** 응답으로 드러나지 않는 비동기 작업 실패를 서비스 로거에 기록한다. */
    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (ex, method, params) ->
                log.error("Async method failed: {}.{} — errorType={}",
                        method.getDeclaringClass().getSimpleName(), method.getName(),
                        ex.getClass().getSimpleName());
    }
    // 비동기 이메일 발송을 위한 설정

    /** 이미지 업로드의 블로킹 I/O를 제한된 크기의 전용 스레드 풀에서 병렬 처리한다. */
    @Bean(name = "imageUploadExecutor")
    public Executor imageUploadExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(20);
        executor.setThreadNamePrefix("image-upload-");
        executor.initialize();
        return executor;
    }
}
