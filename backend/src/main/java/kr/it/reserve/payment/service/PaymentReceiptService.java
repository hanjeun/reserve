package kr.it.reserve.payment.service;

import kr.it.reserve.advertisement.repository.AdPaymentAttemptRepository;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.payment.dto.PaymentReceiptResponse;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.Objects;
import java.util.Set;
import java.util.function.LongConsumer;

@Service
@RequiredArgsConstructor
public class PaymentReceiptService {
    private static final Set<String> CAPTURED_STATUSES = Set.of("PAID", "PARTIAL_CANCELLED", "CANCELLED");
    private final PaymentRepository payments;
    private final AdPaymentAttemptRepository ads;
    private final PortoneService portone;

    public record AdminLookup(long paymentId, String type, long inquiryId, long adminId) {}

    private record ReceiptOrder(long id, String merchantUid, int amount, String storeId, String channelId, String channelType) {}

    public PaymentReceiptResponse lookup(String type, String merchantUid, long ownerId) {
        return lookup(type, merchantUid, ownerId, id -> {});
    }

    /** 원장의 소유자를 먼저 확인하고 트랜잭션 없이 PG를 조회한다. */
    public PaymentReceiptResponse lookup(String type, String merchantUid, long ownerId, LongConsumer onAuthorized) {
        if (merchantUid == null || merchantUid.isBlank() || merchantUid.length() > 255) {
            throw new PaymentException("주문번호를 확인해주세요.");
        }
        String orderNumber = merchantUid.strip();
        ReceiptOrder order = ownedOrder(type, orderNumber, ownerId);
        onAuthorized.accept(order.id());

        PortoneV2PaymentResponse upstream;
        try {
            upstream = portone.getPaymentInfo(order.merchantUid());
        } catch (PaymentException failure) {
            if (failure.getStatus() != HttpStatus.NOT_FOUND) throw failure;
            return new PaymentReceiptResponse(type, orderNumber, null, null, null);
        }
        if (!matches(order, upstream)) {
            throw new PaymentException("결제 기록과 영수증 정보를 대조하지 못했어요.", HttpStatus.CONFLICT);
        }
        if (!order.equals(ownedOrder(type, orderNumber, ownerId))) throw PaymentException.notFound();
        String url = safeUrl(upstream.getReceiptUrl());
        var cashReceipt = upstream.getCashReceipt();
        if (url == null && cashReceipt != null && "ISSUED".equals(cashReceipt.getStatus())) url = safeUrl(cashReceipt.getUrl());
        return new PaymentReceiptResponse(type, orderNumber, url, upstream.getPayMethod(), upstream.getPgProvider());
    }

    private ReceiptOrder ownedOrder(String type, String uid, long ownerId) {
        var order = switch (Objects.toString(type, "")) {
            case "reservation" -> payments.findReceiptOrder(uid, ownerId).map(payment -> new ReceiptOrder(payment.getId(),
                    payment.getMerchantUid(), payment.getAmount(), payment.getVerifiedStoreId(), payment.getVerifiedChannelId(),
                    payment.getVerifiedChannelType()));
            case "ad" -> ads.findReceiptOrder(uid, ownerId).map(attempt -> new ReceiptOrder(attempt.getId(), attempt.getMerchantUid(),
                    attempt.getAmount(), null, null, null));
            default -> throw new PaymentException("결제 유형을 확인해주세요.");
        };
        return order.filter(value -> value.amount() > 0 && uid.equals(value.merchantUid())).orElseThrow(PaymentException::notFound);
    }

    private boolean matches(ReceiptOrder order, PortoneV2PaymentResponse upstream) {
        if (!CAPTURED_STATUSES.contains(Objects.toString(upstream.getStatus(), "")) || upstream.getAmount() != order.amount()
                || (order.storeId() != null && !order.storeId().equals(upstream.getStoreId()))) return false;
        var channel = upstream.getChannel();
        return (order.channelId() == null && order.channelType() == null) || channel != null
                && (order.channelId() == null || order.channelId().equals(channel.getId()))
                && (order.channelType() == null || order.channelType().equals(channel.getType()));
    }

    private String safeUrl(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            URI url = URI.create(value.strip());
            String host = url.getHost();
            return "https".equalsIgnoreCase(url.getScheme()) && url.getRawUserInfo() == null && host != null
                    && host.matches("(?i)([a-z0-9-]+\\.)+[a-z][a-z0-9-]*") && !host.toLowerCase(java.util.Locale.ROOT).endsWith(".localhost")
                    ? url.toASCIIString() : null;
        } catch (IllegalArgumentException invalidUrl) {
            return null;
        }
    }
}
