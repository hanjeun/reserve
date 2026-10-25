package kr.it.reserve.member.service;

import kr.it.reserve.email.service.EmailService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class LoginMethodNotifications {
    public record Changed(String email) { }
    private final EmailService emails;

    @TransactionalEventListener
    public void changed(Changed event) {
        if (event.email() != null && !event.email().endsWith(".local")) emails.sendLoginMethodChangedEmail(event.email());
    }
}
