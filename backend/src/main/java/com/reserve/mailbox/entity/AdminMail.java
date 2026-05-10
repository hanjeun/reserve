package com.reserve.mailbox.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "admin_mail")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class AdminMail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "from_email", nullable = false, length = 255)
    private String fromEmail;

    @Column(name = "from_name", length = 255)
    private String fromName;

    @Column(name = "subject", length = 500)
    private String subject;

    @Column(name = "body", columnDefinition = "TEXT")
    private String body;

    @Column(name = "is_read", nullable = false)
    @Builder.Default
    private boolean isRead = false;

    @CreatedDate
    @Column(name = "received_at", updatable = false)
    private LocalDateTime receivedAt;

    @OneToMany(mappedBy = "adminMail", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sentAt ASC")
    @Builder.Default
    private List<AdminMailReply> replies = new ArrayList<>();

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    public void markAsRead() {
        this.isRead = true;
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now();
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }
}
