package kr.it.reserve.reservation.service;

import kr.it.reserve.global.common.PageRequests;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.StoreBookingRestriction;
import kr.it.reserve.reservation.repository.BusinessCustomerRepository;
import kr.it.reserve.reservation.retention.ReservationPrivacyPolicy;
import kr.it.reserve.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BusinessCustomerService {
    private final BusinessCustomerRepository customers;
    private final StoreRepository stores;
    private final ReservationNoShowRestriction restrictions;

    public Page<Customer> list(Member owner, Long storeId, String search, int page, int size) {
        requireAccess(owner, storeId);
        var now = ServiceTime.now();
        return customers.customers(owner.getId(), storeId, search == null ? "" : search.strip(),
                now.minusDays(ReservationPrivacyPolicy.STORE_DAYS), now, PageRequests.bounded(page, size)).map(Customer::from);
    }

    public Page<BusinessCustomerRepository.ReservationRow> reservations(Member owner, Long storeId, Long memberId, int page, int size) {
        requireAccess(owner, storeId);
        return customers.reservations(owner.getId(), storeId, memberId, ReservationPrivacyPolicy.searchCutoff(), PageRequests.bounded(page, size));
    }

    public Page<CustomerReview> reviews(Member owner, Long storeId, Long memberId, int page, int size) {
        requireVisibleCustomer(owner, storeId, memberId);
        return customers.reviews(storeId, memberId, PageRequests.bounded(page, size))
                .map(review -> new CustomerReview(review.getId(), review.getTitle(), review.getContent(), review.getRating(),
                        review.getCreatedAt(), review.getOwnerReply()));
    }

    public RestrictionDetail restrictions(Member owner, Long storeId, Long memberId, int page, int size) {
        requireVisibleCustomer(owner, storeId, memberId);
        return new RestrictionDetail(restrictions.customerRestriction(storeId, memberId, ServiceTime.now()),
                customers.restrictionHistory(storeId, memberId, PageRequests.bounded(page, size)));
    }

    private void requireVisibleCustomer(Member owner, Long storeId, Long memberId) {
        requireAccess(owner, storeId);
        if (customers.hasVisibleCustomer(owner.getId(), storeId, memberId, ReservationPrivacyPolicy.searchCutoff()) != 1) {
            throw new ReservationException("조회할 수 있는 고객 내역이 없어요.", HttpStatus.NOT_FOUND);
        }
    }

    private void requireAccess(Member owner, Long storeId) {
        if (!(owner.isBusiness() || owner.isAdmin())
                || storeId != null && !stores.existsByIdAndOwnerIdAndDeletedAtIsNull(storeId, owner.getId())) {
            throw new ReservationException("본인 가게의 고객 내역만 관리할 수 있어요.", HttpStatus.FORBIDDEN);
        }
    }

    public record Customer(Long storeId, Long memberId, String storeName, String name, long reservations, long completed,
            long customerCanceled, long storeCanceled, long systemCanceled, long unknownCanceled, long noShows, LocalDate latestVisit,
            long reviewCount, Double averageRating, Integer highestRating, Integer lowestRating, Instant manualUntil, boolean permanent) {
        static Customer from(BusinessCustomerRepository.CustomerRow row) {
            var end = row.getRestrictedUntil();
            boolean permanent = StoreBookingRestriction.PERMANENT_UNTIL.equals(end);
            return new Customer(row.getStoreId(), row.getMemberId(), row.getStoreName(), row.getName(), row.getReservations(), row.getCompleted(),
                    row.getCustomerCanceled(), row.getStoreCanceled(), row.getSystemCanceled(), row.getUnknownCanceled(), row.getNoShows(),
                    row.getLatestVisit(), row.getReviewCount(), row.getAverageRating(), row.getHighestRating(), row.getLowestRating(),
                    end == null || permanent ? null : end.atZone(ServiceTime.ZONE).toInstant(), permanent);
        }
    }

    public record CustomerReview(Long id, String title, String content, int rating, LocalDateTime createdAt, String ownerReply) { }

    public record RestrictionDetail(ReservationNoShowRestriction.CustomerRestriction current,
            Page<BusinessCustomerRepository.RestrictionRow> history) { }
}
