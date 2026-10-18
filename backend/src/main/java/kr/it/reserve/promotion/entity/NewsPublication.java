package kr.it.reserve.promotion.entity;

import java.time.LocalDateTime;

/** 소식 원문이 사용하는 공개·삭제 계약. 구현 entity의 연결은 META-INF/orm.xml에서 지정한다. */
public interface NewsPublication {
    Long getId();
    PublicProfile getProfile();
    boolean isPublished();
    boolean isDeleted();
    void delete(LocalDateTime now);
    void setVisibility(boolean hidden, LocalDateTime now);

    interface PublicProfile {
        String getNickname();
        boolean isHidden();
    }
}
