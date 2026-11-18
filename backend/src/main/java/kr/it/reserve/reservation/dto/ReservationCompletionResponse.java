package kr.it.reserve.reservation.dto;

public record ReservationCompletionResponse(boolean canUndo, boolean refundRequested) { }
