FROM amazoncorretto:21-alpine-jdk

# 기반 이미지와 별개로 보안 패치가 적용된 Corretto 패키지 버전을 고정한다.
# https://github.com/corretto/corretto-21/releases/tag/21.0.13.0.11
RUN apk add --no-cache amazon-corretto-21=21.0.13.0.11-r0 && \
    apk upgrade --no-cache

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /var/log/reserve && chown -R appuser:appgroup /var/log/reserve

USER appuser

ARG JAR_FILE=build/libs/*.jar
COPY ${JAR_FILE} app.jar
# 호환 표시에 필요한 클래스와 스키마가 JAR에 포함됐는지 검사한다.
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
    BOOT-INF/classes/kr/it/reserve/config/jwt/TokenProvider\$VerifiedAuthentication.class \
    BOOT-INF/classes/kr/it/reserve/config/jwt/TokenProvider\$IssuedSession.class \
    BOOT-INF/classes/kr/it/reserve/config/jwt/repository/LoginSessionAuthentication.class \
    BOOT-INF/classes/kr/it/reserve/reservation/admission/ReservationCreationGuard.class \
    BOOT-INF/classes/kr/it/reserve/reservation/admission/ReservationRequest.class \
    BOOT-INF/classes/kr/it/reserve/reservation/admission/AdmissionService.class \
    BOOT-INF/classes/kr/it/reserve/reservation/controller/ReservationEditApiController.class \
    BOOT-INF/classes/kr/it/reserve/reservation/service/ReservationEditQueryService.class \
    BOOT-INF/classes/kr/it/reserve/global/admission/ServiceAdmissionService.class \
    BOOT-INF/classes/kr/it/reserve/global/admission/ServiceAdmissionAutomaticPolicy.class \
    BOOT-INF/classes/kr/it/reserve/global/admission/ServiceAdmissionLoadSampler.class \
    BOOT-INF/classes/kr/it/reserve/config/ServiceAdmissionHttpFilter.class \
    BOOT-INF/classes/redis/service-admission.lua \
    BOOT-INF/classes/redis/reservation-admission.lua \
    BOOT-INF/classes/db/manual/jwt-session.sql \
    BOOT-INF/classes/db/manual/login-methods.sql \
    BOOT-INF/classes/db/manual/reservation-admission.sql \
    BOOT-INF/classes/kr/it/reserve/search/SearchController.class \
    BOOT-INF/classes/kr/it/reserve/search/SearchService.class \
    BOOT-INF/classes/kr/it/reserve/search/SearchQueries.class \
    BOOT-INF/classes/kr/it/reserve/search/SearchQuery.class \
    BOOT-INF/classes/kr/it/reserve/search/SearchResponse.class \
    BOOT-INF/classes/kr/it/reserve/search/SearchResponse\$Item.class \
    BOOT-INF/classes/kr/it/reserve/search/SearchResponse\$Group.class \
    BOOT-INF/classes/kr/it/reserve/search/SearchResponse\$GroupError.class \
    BOOT-INF/classes/kr/it/reserve/store/search/StoreFulltextSearch.class \
    BOOT-INF/classes/kr/it/reserve/store/search/StoreFulltextSearch\$Preview.class \
    BOOT-INF/classes/kr/it/reserve/member/service/MemberWithdrawalService.class \
    BOOT-INF/classes/kr/it/reserve/member/mfa/MfaService.class \
    BOOT-INF/classes/kr/it/reserve/member/mfa/MfaPasskeys.class \
    BOOT-INF/classes/kr/it/reserve/member/mfa/MfaPolicy.class \
    BOOT-INF/classes/kr/it/reserve/member/mfa/MfaController.class \
    BOOT-INF/classes/kr/it/reserve/member/mfa/MfaCredential.class \
    BOOT-INF/classes/kr/it/reserve/reservation/service/ReservationAutoCompletion.class \
    BOOT-INF/classes/kr/it/reserve/payment/service/TestSettlementService.class \
    BOOT-INF/classes/kr/it/reserve/payment/entity/TestSettlementPayout.class \
    BOOT-INF/classes/db/manual/mfa-completion-settlement.sql \
    BOOT-INF/classes/kr/it/reserve/member/controller/LoginMethodController.class \
    BOOT-INF/classes/kr/it/reserve/member/service/LoginMethodService.class \
    BOOT-INF/classes/kr/it/reserve/member/entity/LoginMethodChallenge.class \
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
