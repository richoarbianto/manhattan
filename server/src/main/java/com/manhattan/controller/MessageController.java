package com.manhattan.controller;

import com.manhattan.service.MessageRelayService;
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
 * STOMP message controller for relaying encrypted messages within rooms.
 * The server treats all message content as opaque ciphertext — it never inspects or decrypts.
 */
@Controller
public class MessageController {

    private static final Logger log = LoggerFactory.getLogger(MessageController.class);

    private final MessageRelayService messageRelayService;
    private final SessionService sessionService;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageController(MessageRelayService messageRelayService,
                             SessionService sessionService,
                             SimpMessagingTemplate messagingTemplate) {
        this.messageRelayService = messageRelayService;
        this.sessionService = sessionService;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Handles encrypted message send requests.
     * Receives: { roomName, ciphertext, iv }
     * Relays the ciphertext to all other connected clients in the room.
     */
    @MessageMapping("/message.send")
    public void sendMessage(Map<String, Object> payload, SimpMessageHeaderAccessor headerAccessor) {
        String clientIp = getClientIp(headerAccessor);
        String sessionId = headerAccessor.getSessionId();

        if (clientIp == null || sessionId == null) {
            return;
        }

        String roomName = (String) payload.get("roomName");
        String ciphertext = (String) payload.get("ciphertext");
        String iv = (String) payload.get("iv");

        if (roomName == null || ciphertext == null || iv == null) {
            sendError(sessionId, "INVALID_MESSAGE", "Missing required fields: roomName, ciphertext, iv.");
            return;
        }

        // Verify the sender has an active session
        if (!sessionService.hasActiveSession(clientIp)) {
            sendError(sessionId, "NO_SESSION", "No active session found. Please join a room first.");
            return;
        }

        // Update last activity timestamp
        sessionService.updateLastActivity(clientIp);

        // Relay the encrypted message to the room
        long timestamp = System.currentTimeMillis();
        messageRelayService.relayToRoom(roomName, clientIp, ciphertext, iv, timestamp);

        log.debug("Relayed encrypted message from IP {} to room '{}'", clientIp, roomName);
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
