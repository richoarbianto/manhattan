package com.manhattan.interceptor;

import com.manhattan.service.SessionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;

import java.net.InetSocketAddress;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IpGuardInterceptorTest {

    @Mock
    private SessionService sessionService;

    @Mock
    private ServerHttpRequest request;

    @Mock
    private ServerHttpResponse response;

    @Mock
    private WebSocketHandler wsHandler;

    private IpGuardInterceptor interceptor;
    private Map<String, Object> attributes;

    @BeforeEach
    void setUp() {
        interceptor = new IpGuardInterceptor(sessionService);
        attributes = new HashMap<>();
    }

    @Test
    void beforeHandshake_allowsNewIpWithNoActiveSession() {
        HttpHeaders headers = new HttpHeaders();
        when(request.getHeaders()).thenReturn(headers);
        when(request.getRemoteAddress()).thenReturn(new InetSocketAddress("192.168.1.100", 12345));
        when(sessionService.hasActiveSession("192.168.1.100")).thenReturn(false);

        boolean result = interceptor.beforeHandshake(request, response, wsHandler, attributes);

        assertThat(result).isTrue();
        assertThat(attributes).containsEntry("clientIp", "192.168.1.100");
    }

    @Test
    void beforeHandshake_rejectsIpWithActiveSession() {
        HttpHeaders headers = new HttpHeaders();
        when(request.getHeaders()).thenReturn(headers);
        when(request.getRemoteAddress()).thenReturn(new InetSocketAddress("192.168.1.100", 12345));
        when(sessionService.hasActiveSession("192.168.1.100")).thenReturn(true);

        boolean result = interceptor.beforeHandshake(request, response, wsHandler, attributes);

        assertThat(result).isFalse();
        assertThat(attributes).doesNotContainKey("clientIp");
    }

    @Test
    void beforeHandshake_extractsIpFromXForwardedForHeader() {
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Forwarded-For", "10.0.0.1, 172.16.0.1, 192.168.1.1");
        when(request.getHeaders()).thenReturn(headers);
        when(sessionService.hasActiveSession("10.0.0.1")).thenReturn(false);

        boolean result = interceptor.beforeHandshake(request, response, wsHandler, attributes);

        assertThat(result).isTrue();
        assertThat(attributes).containsEntry("clientIp", "10.0.0.1");
    }

    @Test
    void beforeHandshake_prefersXForwardedForOverRemoteAddress() {
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Forwarded-For", "203.0.113.50");
        when(request.getHeaders()).thenReturn(headers);
        when(sessionService.hasActiveSession("203.0.113.50")).thenReturn(false);

        boolean result = interceptor.beforeHandshake(request, response, wsHandler, attributes);

        assertThat(result).isTrue();
        assertThat(attributes).containsEntry("clientIp", "203.0.113.50");
        // Remote address should not be checked since X-Forwarded-For is present
        verify(request, never()).getRemoteAddress();
    }

    @Test
    void beforeHandshake_fallsBackToRemoteAddressWhenXForwardedForIsEmpty() {
        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Forwarded-For", "   ");
        when(request.getHeaders()).thenReturn(headers);
        when(request.getRemoteAddress()).thenReturn(new InetSocketAddress("127.0.0.1", 8080));
        when(sessionService.hasActiveSession("127.0.0.1")).thenReturn(false);

        boolean result = interceptor.beforeHandshake(request, response, wsHandler, attributes);

        assertThat(result).isTrue();
        assertThat(attributes).containsEntry("clientIp", "127.0.0.1");
    }

    @Test
    void beforeHandshake_rejectsWhenNoIpCanBeDetermined() {
        HttpHeaders headers = new HttpHeaders();
        when(request.getHeaders()).thenReturn(headers);
        when(request.getRemoteAddress()).thenReturn(null);

        boolean result = interceptor.beforeHandshake(request, response, wsHandler, attributes);

        assertThat(result).isFalse();
        assertThat(attributes).doesNotContainKey("clientIp");
    }

    @Test
    void afterHandshake_doesNothing() {
        // afterHandshake is a no-op, just verify it doesn't throw
        interceptor.afterHandshake(request, response, wsHandler, null);
    }
}
