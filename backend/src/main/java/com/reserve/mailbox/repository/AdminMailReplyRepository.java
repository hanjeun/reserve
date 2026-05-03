package com.reserve.mailbox.repository;

import com.reserve.mailbox.entity.AdminMailReply;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminMailReplyRepository extends JpaRepository<AdminMailReply, Long> {
}
