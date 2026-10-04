package kr.it.reserve.waiting.entity;

import java.util.Set;

public enum WaitingStatus {
    WAITING, CALLED, SEATED, CANCELLED;

    public static final Set<WaitingStatus> ACTIVE = Set.of(WAITING, CALLED);
    public static final Set<WaitingStatus> TERMINAL = Set.of(SEATED, CANCELLED);

    public boolean isTerminal() {
        return this == SEATED || this == CANCELLED;
    }
}
