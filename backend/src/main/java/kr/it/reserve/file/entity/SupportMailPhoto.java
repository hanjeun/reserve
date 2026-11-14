package kr.it.reserve.file.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "support_mail_photo")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SupportMailPhoto {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "inquiry_id")
    private Long inquiryId;

    @Column(name = "sent_mail_id")
    private Long sentMailId;

    @Column(nullable = false, length = 40)
    private String filename;

    @Column(name = "content_type", nullable = false, length = 24)
    private String contentType;

    @Lob
    @Column(nullable = false, columnDefinition = "MEDIUMBLOB")
    private byte[] content;

    public SupportMailPhoto(Long inquiryId, Long sentMailId, String filename, String contentType, byte[] content) {
        if ((inquiryId == null) == (sentMailId == null)) {
            throw new IllegalArgumentException("A mail photo requires exactly one parent");
        }
        this.inquiryId = inquiryId;
        this.sentMailId = sentMailId;
        this.filename = filename;
        this.contentType = contentType;
        this.content = content;
    }
}
