package com.manhattan.controller;

import com.manhattan.service.KeyExchangeService;
import com.manhattan.service.SessionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.HashMap;
import java.util.Map;

/**
 * STOMP message controller for RSA/AES key exchange between clients.
 * Facilitates secure key distribution without the server accessing plaintext keys.
 */
@Controller
public class KeyExchangeController {

    private static final Logger log = LoggerFactory.getLogger(KeyExchangeController.class);

    private final KeyExchangeService keyExchangeService;
    private final SessionService sessionService;
    private final SimpMessagingTemplate messagingTemplate;

    public KeyExchangeController(KeyExchangeService keyExchangeService,
                                 SessionService sessionService,
                                 SimpMessagingTemplate messagingTemplate) {
        this.keyExchangeService = keyExchangeService;
        this.sessionService = sessionService;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Handles encrypted AES key exchange requests.
     * Receives: { targetIp, encryptedAesKey }
     * Forwards the encrypted AES key to the target client's private queue.
     */
    @MessageMapping("/key.exchange")
    public void exchangeKey(Map<String, Object> payload, SimpMessageHeaderAccessor headerAccessor) {
        String clientIp = getClientIp(headerAccessor);
        String sessionId = headerAccessor.getSessionId();

        if (clientIp == null || sessionId == null) {
            return;
        }

        String targetIp = (String) payload.get("targetIp");
        String encryptedAesKey = (String) payload.get("encryptedAesKey");

        if (targetIp == null || encryptedAesKey == null) {
            sendError(sessionId, "INVALID_KEY_EXCHANGE", "Missing required fields: targetIp, encryptedAesKey.");
            return;
        }

        // Verify the sender has an active session
        if (!sessionService.hasActiveSession(clientIp)) {
            sendError(sessionId, "NO_SESSION", "No active session found. Please join a room first.");
            return;
        }

        // Forward the encrypted AES key to the target client (include rsaPublicKey if present)
        String rsaPublicKey = (String) payload.get("rsaPublicKey");
        keyExchangeService.forwardEncryptedAesKey(targetIp, clientIp, encryptedAesKey, rsaPublicKey);

        log.debug("Key exchange: forwarded encrypted AES key from IP {} to IP {}", clientIp, targetIp);
    }

    /**
     * Extracts the client IP from the STOMP session attributes.
     */
    private String getClientIp(SimpMessageHeaderAccessor headerAccessor) {
        Map<String, Object> sessionAttributes = headerAccessor.getSessionAttributes();
        if (sessionAttributes == null) {
            return null;
        }
        return (String) sessionAttributes.get("clientIp");
    }

    /**
     * Sends an error response to the user's private queue.
     */
    private void sendError(String sessionId, String code, String message) {
        Map<String, Object> errorPayload = new HashMap<>();
        errorPayload.put("type", "ERROR");
        errorPayload.put("code", code);
        errorPayload.put("message", message);

        org.springframework.messaging.simp.SimpMessageHeaderAccessor ha =
            org.springframework.messaging.simp.SimpMessageHeaderAccessor.create(org.springframework.messaging.simp.SimpMessageType.MESSAGE);
        ha.setSessionId(sessionId);
        ha.setLeaveMutable(true);
        messagingTemplate.convertAndSendToUser(sessionId, "/queue/private", errorPayload, ha.getMessageHeaders());
    }
}
