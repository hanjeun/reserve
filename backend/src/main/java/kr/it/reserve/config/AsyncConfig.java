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

    /**
     * {@code void @Async} 메서드에서 새어 나온 예외를 <b>우리 로거로</b> 받는다.
     *
     * <p>이걸 등록하지 않으면 Spring 기본 {@code SimpleAsyncUncaughtExceptionHandler} 가
     * {@code "Unexpected exception occurred invoking async method: ..."} 라는 생소한 문구로 남긴다.
     * 2026-08 메일 장애 때 실제로 그 문구 때문에 로그를 grep 해도 안 걸렸고, 원인을 찾는 데
     * 오래 걸렸다. 도메인 이름({@code kr.it.reserve})으로 찍혀야 검색과 알림 규칙에 잡힌다.
     *
     * <p>여기서 삼키지 않고 <b>ERROR 로 크게 남기는 게 목적</b>이다 — 비동기 작업의 실패는
     * 사용자 응답에 영향을 주지 않으므로, 로그가 유일한 발견 경로다.
     */
    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (ex, method, params) ->
                log.error("Async method failed: {}.{} — {}: {}",
                        method.getDeclaringClass().getSimpleName(), method.getName(),
                        ex.getClass().getSimpleName(), ex.getMessage(), ex);
    }
    // 비동기 이메일 발송을 위한 설정

    /**
     * 가게 상세 이미지 병렬 업로드 전용 스레드 풀(2026-07 추가 - "이미지 업로드 비동기 병렬 처리"
     * 블로그 글 참고). 이전엔 StoreService가 detailImages를 for문으로 하나씩 순차 업로드했는데
     * S3 putObject 자체가 블로킹 I/O라서 이미지 개수만큼 응답 시간이 선형으로 늘어났음 -
     * CompletableFuture.supplyAsync로 동시에 여러 장을 올리도록 병렬화.
     *
     * 코어 4개 = 최대 4개(유휴 스레드가 늘었다 줄었다 하지 않게 고정) - 우리 이미지 업로드는
     * 가게 등록/수정 시에만 발생하는 저빈도 작업이라, 병렬 처리 이점과 유휴 스레드가 차지하는
     * 메모리 사이에서 보수적인 값을 택함. 원본 이미지를 WebP 등으로 변환하지 않아 CPU 바운드
     * 작업이 섞여있지 않으므로(순수 I/O 바운드), 이 정도 스레드 수로도 병렬화 이점을 그대로 받음.
     */
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
