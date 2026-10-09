package kr.it.reserve.waiting.dto;

public record MyWaitingResponse(WaitingEntryResponse entry, String storeName, String storeImageUrl,
                                Integer storeImageWidth, Integer storeImageHeight, long teamsAhead) {}
