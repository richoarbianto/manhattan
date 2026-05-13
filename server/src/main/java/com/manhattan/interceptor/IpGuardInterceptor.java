package com.manhattan.interceptor;

import com.manhattan.service.SessionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/**
 * Enforces one-session-per-IP at the WebSocket handshake level.
 * Extracts the client IP from the request (supporting X-Forwarded-For for proxied environments)
 * and rejects the handshake if the IP already has an active session.
 * Stores the extracted IP in WebSocket session attributes for downstream use.
 */
@Component
public class IpGuardInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(IpGuardInterceptor.class);
    private static final String CLIENT_IP_ATTRIBUTE = "clientIp";
    private static final String X_FORWARDED_FOR_HEADER = "X-Forwarded-For";

    private final SessionService sessionService;

    public IpGuardInterceptor(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String clientIp = extractClientIp(request);

        if (clientIp == null || clientIp.isBlank()) {
            log.warn("Could not determine client IP address, rejecting handshake");
            return false;
        }

        // In development (localhost), allow multiple sessions from same IP
        // by appending a unique suffix to differentiate tabs/browsers
        if (clientIp.equals("127.0.0.1") || clientIp.equals("0:0:0:0:0:0:0:1")) {
            clientIp = clientIp + "-" + System.nanoTime();
        } else if (sessionService.hasActiveSession(clientIp)) {
            log.info("Rejected WebSocket handshake: IP {} already has an active session", clientIp);
            return false;
        }

        attributes.put(CLIENT_IP_ATTRIBUTE, clientIp);
        log.debug("WebSocket handshake accepted for IP: {}", clientIp);
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // No-op
    }

    /**
     * Extracts the client IP address from the request.
     * Checks X-Forwarded-For header first (for Nginx/proxy setups),
     * then falls back to the remote address from the request.
     */
    private String extractClientIp(ServerHttpRequest request) {
        // Check X-Forwarded-For header (first IP in the chain is the original client)
        String xForwardedFor = request.getHeaders().getFirst(X_FORWARDED_FOR_HEADER);
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
            String clientIp = xForwardedFor.split(",")[0].trim();
            if (!clientIp.isBlank()) {
                return clientIp;
            }
        }

        // Fallback to remote address from the request
        if (request.getRemoteAddress() != null) {
            String remoteAddress = request.getRemoteAddress().getAddress().getHostAddress();
            return remoteAddress;
        }

        // For ServletServerHttpRequest, try getting from the underlying servlet request
        if (request instanceof ServletServerHttpRequest servletRequest) {
            return servletRequest.getServletRequest().getRemoteAddr();
        }

        return null;
    }
}
