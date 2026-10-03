package kr.it.reserve.config;

import org.springframework.boot.autoconfigure.web.servlet.WebMvcRegistrations;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.lang.reflect.Method;

/** 원 요청 URI를 유지하면서 기존 컨트롤러에 실제 v1 매핑을 추가한다. */
@Configuration(proxyBeanMethods = false)
public class ApiVersionConfiguration implements WebMvcRegistrations {
    @Override
    public RequestMappingHandlerMapping getRequestMappingHandlerMapping() {
        return new RequestMappingHandlerMapping() {
            @Override
            protected RequestMappingInfo getMappingForMethod(Method method, Class<?> handlerType) {
                RequestMappingInfo mapping = super.getMappingForMethod(method, handlerType);
                if (mapping == null) return null;
                String[] originalPaths = mapping.getPatternValues().toArray(String[]::new);
                String[] aliases = ApiPaths.withV1Aliases(originalPaths);
                return aliases.length == originalPaths.length ? mapping : mapping.mutate().paths(aliases).build();
            }
        };
    }
}
