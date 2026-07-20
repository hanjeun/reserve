package com.reserve.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
@EnableAsync
public class AsyncConfig {
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
