package com.reserve.mailbox.repository;

import com.reserve.mailbox.entity.AdminSentMail;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AdminSentMailRepository extends JpaRepository<AdminSentMail, Long> {
    List<AdminSentMail> findAllByOrderBySentAtDesc();
}
