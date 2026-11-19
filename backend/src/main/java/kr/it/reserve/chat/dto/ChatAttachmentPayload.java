package kr.it.reserve.chat.dto;

public record ChatAttachmentPayload(String key, String contentType, Integer width, Integer height, int bytes, String originalFilename) {}
