package kr.it.reserve.reservation;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.reservation.repository.BusinessCustomerRepository;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;

import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
class BusinessCustomerReviewQueryTest {
    @Autowired BusinessCustomerRepository customers;
    @Autowired MemberRepository members;
    @Autowired StoreRepository stores;
    @Autowired JdbcTemplate jdbc;

    @Test
    void reviewProjectionKeepsTheStoreMemberVisibilityCountAndStableNewestFirstPagination() {
        var owner = member(Role.BUSINESS);
        var customer = member(Role.USER);
        var otherCustomer = member(Role.USER);
        var store = stores.saveAndFlush(Store.builder().owner(owner).name("합성 가게").build());
        var otherStore = stores.saveAndFlush(Store.builder().owner(owner).name("다른 합성 가게").build());
        LocalDateTime older = LocalDateTime.of(2026, 11, 1, 12, 0);
        LocalDateTime latest = older.plusDays(1);
        long first = review(customer, store, 3, "합성 이전", older, null, false, null);
        long second = review(customer, store, 4, "합성 최근", latest, null, false, null);
        long third = review(customer, store, 5, "합성 최신", latest, "합성 답변", false, null);
        review(customer, store, 1, "합성 숨김", latest.plusDays(1), null, true, null);
        review(customer, store, 2, "합성 삭제", latest.plusDays(1), null, false, latest);
        review(otherCustomer, store, 2, "다른 고객", latest.plusDays(1), null, false, null);
        review(customer, otherStore, 2, "다른 가게", latest.plusDays(1), null, false, null);

        var firstPage = customers.reviews(store.getId(), customer.getId(), PageRequest.of(0, 2));
        var secondPage = customers.reviews(store.getId(), customer.getId(), PageRequest.of(1, 2));

        assertThat(firstPage.getTotalElements()).isEqualTo(3);
        assertThat(firstPage.getTotalPages()).isEqualTo(2);
        assertThat(firstPage.getContent()).extracting(BusinessCustomerRepository.ReviewRow::getId).containsExactly(third, second);
        var detail = firstPage.getContent().getFirst();
        assertThat(detail.getTitle()).isEqualTo("합성 최신");
        assertThat(detail.getContent()).isEqualTo("합성 후기");
        assertThat(detail.getRating()).isEqualTo(5);
        assertThat(detail.getCreatedAt()).isEqualTo(latest);
        assertThat(detail.getOwnerReply()).isEqualTo("합성 답변");
        assertThat(secondPage.getContent()).extracting(BusinessCustomerRepository.ReviewRow::getId).containsExactly(first);
        assertThat(secondPage.getTotalElements()).isEqualTo(3);
        assertThat(secondPage.getContent().getFirst().getOwnerReply()).isNull();
    }

    private Member member(Role role) {
        return members.saveAndFlush(Member.builder().name("합성 회원").role(role).termsAgreed(true)
                .email(UUID.randomUUID() + "@customer-query.example.invalid").build());
    }

    private long review(Member member, Store store, int rating, String title, LocalDateTime createdAt,
                        String reply, boolean hidden, LocalDateTime deletedAt) {
        var keys = new GeneratedKeyHolder();
        Object[] values = {member.getId(), store.getId(), rating, title, "합성 후기", createdAt, createdAt, reply, hidden, deletedAt};
        jdbc.update(connection -> {
            var statement = connection.prepareStatement("""
                    INSERT INTO review(member_id,store_id,rating,title,content,created_at,updated_at,owner_reply,moderation_hidden,deleted_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                    """, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < values.length; i++) statement.setObject(i + 1, values[i]);
            return statement;
        }, keys);
        return keys.getKey().longValue();
    }
}
