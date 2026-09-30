package kr.it.reserve.store;

import jakarta.persistence.EntityManager;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(showSql = false, properties = "spring.datasource.driver-class-name=org.h2.Driver")
@ActiveProfiles("test")
class StoreImageAutoplayPersistenceTest {
    @Autowired EntityManager em;

    @Test
    void persistsAnExplicitlyDisabledSetting() {
        Store store = Store.builder().name("autoplay fixture").imageAutoplayEnabled(false).build();
        em.persist(store);
        em.flush();
        Long id = store.getId();
        em.clear();

        assertThat(em.find(Store.class, id).getImageAutoplayEnabled()).isFalse();
    }

    @Test
    void legacyInsertWithoutTheNewColumnUsesTheDatabaseDefault() {
        em.createNativeQuery("INSERT INTO store (store_name, status) VALUES (:name, 'ACTIVE')")
                .setParameter("name", "legacy autoplay fixture").executeUpdate();
        em.clear();

        Store store = em.createQuery("SELECT s FROM Store s WHERE s.name = :name", Store.class)
                .setParameter("name", "legacy autoplay fixture").getSingleResult();
        assertThat(store.getImageAutoplayEnabled()).isTrue();
    }
}
