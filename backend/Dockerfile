FROM amazoncorretto:21-alpine-jdk

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /var/log/reserve && chown -R appuser:appgroup /var/log/reserve

USER appuser

ARG JAR_FILE=build/libs/*.jar
COPY ${JAR_FILE} app.jar
# A compatibility label is only useful when the packaged JAR contains the new boundary.
RUN for REQUIRED_CLASS in \
    META-INF/orm.xml \
    BOOT-INF/classes/kr/it/reserve/chat/entity/ChatMessageHidden.class \
    BOOT-INF/classes/kr/it/reserve/chat/repository/ChatMessageHiddenRepository.class \
    BOOT-INF/classes/kr/it/reserve/chat/service/ChatMessageVisibilityService.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/FeedPost.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/FeedMedia.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/FeedProfile.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/FeedReport.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/FeedReportImage.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/FeedAuditRecord.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/ContentLike.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/FeedComment.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/FeedCommentReport.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/FeedCommentReportImage.class \
    BOOT-INF/classes/kr/it/reserve/feed/entity/FeedNotification.class \
    BOOT-INF/classes/kr/it/reserve/feed/service/FeedNotificationService.class \
    BOOT-INF/classes/kr/it/reserve/feed/FeedInteractionPolicy.class \
    BOOT-INF/classes/kr/it/reserve/feed/service/ContentLikeService.class \
    BOOT-INF/classes/kr/it/reserve/feed/service/FeedCommentService.class \
    BOOT-INF/classes/kr/it/reserve/feed/service/FeedCommentRetentionService.class \
    BOOT-INF/classes/kr/it/reserve/feed/controller/FeedInteractionController.class \
    BOOT-INF/classes/kr/it/reserve/feed/controller/AdminFeedCommentController.class \
    BOOT-INF/classes/kr/it/reserve/feed/service/FeedMediaService.class \
    BOOT-INF/classes/kr/it/reserve/feed/service/FeedRetentionService.class \
    BOOT-INF/classes/kr/it/reserve/feed/service/FeedModerationService.class \
    BOOT-INF/classes/kr/it/reserve/promotion/entity/Promotion\$BenefitState.class \
    BOOT-INF/classes/kr/it/reserve/feed/news/dto/StoreNewsDto\$BenefitReview.class \
    BOOT-INF/classes/kr/it/reserve/feed/news/controller/AdminStoreNewsController.class \
    BOOT-INF/classes/kr/it/reserve/feed/news/service/StoreNewsService.class \
    BOOT-INF/classes/kr/it/reserve/config/updates/RedisEntityUpdateRelay.class \
    BOOT-INF/classes/kr/it/reserve/config/util/SecurityUtil\$OAuthAuthenticationDetails.class \
    BOOT-INF/classes/kr/it/reserve/member/service/MemberWithdrawalService.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/OAuthProviderTokenCipher.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/OAuthProviderTokenConverter.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/OAuthSessionIssuer.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/CustomOAuth2User\$OAuthAuthentication.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/subject/OAuthSubjectSecurity.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/subject/OAuthSubjectSecurityRepository.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/subject/OAuthSubjectSecurityService.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/events/NaverUnlinkEventVerifier.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/events/NaverUnlinkEventController.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/events/OAuthSecurityEventController.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/events/OAuthSecurityEventKeys.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/events/OAuthSecurityEventMetadataClient.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/events/OAuthSecurityEventVerifier.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/events/OAuthSecurityEventRecord.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/events/OAuthSecurityEventRepository.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/events/OAuthSecurityEventService.class \
    BOOT-INF/classes/kr/it/reserve/config/oauth2/events/OAuthSecurityEventTransaction.class; \
    do jar tf app.jar | grep -F -x "$REQUIRED_CLASS" > /dev/null || exit 1; done
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
