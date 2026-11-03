package kr.it.reserve.email.service;

import kr.it.reserve.global.error.EmailException;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.http.HttpStatus;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

/** 인증 메일의 대기는 호출부의 DB 트랜잭션이 끝난 뒤에만 수행한다. */
public final class EmailDelivery {
    private EmailDelivery() { }
    public static CompletableFuture<Void> submit(Supplier<CompletableFuture<Void>> operation) {
        try { return operation.get(); }
        catch (TaskRejectedException rejected) { throw failed(); }
    }
    public static void await(CompletableFuture<Void> delivery) { await(delivery, 10_000); }
    static void await(CompletableFuture<Void> delivery, long timeoutMillis) {
        if (delivery == null) throw failed();
        try { delivery.get(timeoutMillis, TimeUnit.MILLISECONDS); }
        catch (TimeoutException timeout) { throw pending(); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw pending(); }
        catch (ExecutionException failed) { throw failed(); }
    }
    private static EmailException failed() {
        return new EmailException("인증 메일을 발송하지 못했어요. 잠시 후 다시 요청해주세요.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    private static EmailException pending() {
        return new EmailException("메일 발송 상태를 확인하지 못했어요. 메일함을 확인한 뒤 잠시 후 다시 요청해주세요.", HttpStatus.SERVICE_UNAVAILABLE);
    }
}
