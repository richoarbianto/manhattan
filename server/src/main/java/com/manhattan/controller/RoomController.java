package com.manhattan.controller;

import com.manhattan.dto.ParticipantInfo;
import com.manhattan.dto.RoomCreationResult;
import com.manhattan.dto.RoomInfo;
import com.manhattan.dto.RoomJoinResult;
import com.manhattan.service.KeyExchangeService;
import com.manhattan.service.RateLimitService;
import com.manhattan.service.RoomService;
import com.manhattan.service.SessionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * STOMP message controller for room creation, joining, and info queries.
 */
@Controller
public class RoomController {

    private static final Logger log = LoggerFactory.getLogger(RoomController.class);

    private final RoomService roomService;
    private final SessionService sessionService;
    private final RateLimitService rateLimitService;
    private final KeyExchangeService keyExchangeService;
    private final SimpMessagingTemplate messagingTemplate;

    public RoomController(RoomService roomService,
                          SessionService sessionService,
                          RateLimitService rateLimitService,
                          KeyExchangeService keyExchangeService,
                          SimpMessagingTemplate messagingTemplate) {
        this.roomService = roomService;
        this.sessionService = sessionService;
        this.rateLimitService = rateLimitService;
        this.keyExchangeService = keyExchangeService;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Handles room creation requests.
     * Receives: { roomName, passwordHash }
     * On success: creates room, creates session, broadcasts USER_JOINED event.
     * On failure: sends error to user's private queue.
     */
    @MessageMapping("/room.create")
    public void createRoom(Map<String, Object> payload, SimpMessageHeaderAccessor headerAccessor) {
        String clientIp = getClientIp(headerAccessor);
        String sessionId = headerAccessor.getSessionId();

        if (clientIp == null || sessionId == null) {
            return;
        }

        String roomName = (String) payload.get("roomName");
        String passwordHash = (String) payload.get("passwordHash");
        String displayName = (String) payload.get("displayName");
        if (displayName == null || displayName.isBlank()) displayName = "User_" + clientIp;

        log.debug("Room create request from IP {} for room '{}'", clientIp, roomName);

        try {
            RoomCreationResult result = roomService.createRoom(roomName, passwordHash, clientIp);
            log.debug("RoomService.createRoom result: success={}, message={}", result.isSuccess(), result.getMessage());

            if (!result.isSuccess()) {
                sendError(sessionId, "ROOM_CREATE_FAILED", result.getMessage());
                return;
            }

            // Create session for the room creator
        try {
            sessionService.createSession(clientIp, roomName, sessionId, displayName);
        } catch (IllegalStateException e) {
            sendError(sessionId, "DUPLICATE_SESSION", e.getMessage());
            return;
        }

        // Send success response to the creator
        Map<String, Object> successResponse = new HashMap<>();
        successResponse.put("type", "ROOM_CREATED");
        successResponse.put("roomName", roomName);
        successResponse.put("clientIp", clientIp);
        log.debug("Sending ROOM_CREATED response to session {}", sessionId);
        sendToUser(sessionId, successResponse);
        log.debug("ROOM_CREATED response sent successfully");

        // Broadcast USER_JOINED event (the creator is the first participant)
        String rsaPublicKey = (String) payload.get("rsaPublicKey");
        if (rsaPublicKey != null) {
            keyExchangeService.broadcastPublicKey(roomName, clientIp, rsaPublicKey, displayName);
        }

        // Broadcast updated participant list
        broadcastParticipantList(roomName);

        log.info("Room '{}' created by IP {}", roomName, clientIp);

        } catch (Exception e) {
            log.error("Unexpected error in createRoom for room '{}': {}", roomName, e.getMessage(), e);
            if (sessionId != null) {
                sendError(sessionId, "INTERNAL_ERROR", "An unexpected error occurred: " + e.getMessage());
            }
        }
    }

    /**
     * Handles room join requests.
     * Receives: { roomName, password }
     * On success: joins room, creates session, broadcasts USER_JOINED event.
     * On failure: sends error to user's private queue.
     */
    @MessageMapping("/room.join")
    public void joinRoom(Map<String, Object> payload, SimpMessageHeaderAccessor headerAccessor) {
        String clientIp = getClientIp(headerAccessor);
        String sessionId = headerAccessor.getSessionId();

        if (clientIp == null || sessionId == null) {
            return;
        }

        String roomName = (String) payload.get("roomName");
        String password = (String) payload.get("password");
        String displayName = (String) payload.get("displayName");
        if (displayName == null || displayName.isBlank()) displayName = "User_" + clientIp;

        log.debug("Room join request from IP {} for room '{}'", clientIp, roomName);

        // Check rate limiting
        if (rateLimitService.isLocked(clientIp, roomName)) {
            long remaining = rateLimitService.getRemainingLockoutSeconds(clientIp, roomName);
            sendError(sessionId, "RATE_LIMITED",
                    "Too many failed attempts. Please wait " + remaining + " seconds.");
            return;
        }

        RoomJoinResult result = roomService.joinRoom(roomName, password, clientIp);

        if (!result.isSuccess()) {
            // Record failed attempt if it was a password failure
            if (result.getMessage().contains("Incorrect password")) {
                rateLimitService.recordFailedAttempt(clientIp, roomName);

                // Check if now locked after this attempt
                if (rateLimitService.isLocked(clientIp, roomName)) {
                    long remaining = rateLimitService.getRemainingLockoutSeconds(clientIp, roomName);
                    sendError(sessionId, "RATE_LIMITED",
                            "Too many failed attempts. Please wait " + remaining + " seconds.");
                    return;
                }
            }

            String errorCode = mapJoinErrorCode(result.getMessage());
            sendError(sessionId, errorCode, result.getMessage());
            return;
        }

        // Reset rate limit on successful join
        rateLimitService.resetAttempts(clientIp, roomName);

        // Create session for the joining client
        try {
            sessionService.createSession(clientIp, roomName, sessionId, displayName);
        } catch (IllegalStateException e) {
            sendError(sessionId, "DUPLICATE_SESSION", e.getMessage());
            return;
        }

        // Send success response to the joining client
        Map<String, Object> successResponse = new HashMap<>();
        successResponse.put("type", "ROOM_JOINED");
        successResponse.put("roomName", roomName);
        successResponse.put("clientIp", clientIp);
        successResponse.put("participantCount", result.getParticipantCount());
        sendToUser(sessionId, successResponse);

        // Broadcast USER_JOINED event with RSA public key
        String rsaPublicKey = (String) payload.get("rsaPublicKey");
        if (rsaPublicKey != null) {
            keyExchangeService.broadcastPublicKey(roomName, clientIp, rsaPublicKey, displayName);
        }

        // Broadcast updated participant list
        broadcastParticipantList(roomName);

        log.info("IP {} joined room '{}'", clientIp, roomName);
    }

    /**
     * Handles room info requests.
     * Receives: { roomName }
     * Returns room info (participant count, hasPassword) to the user's private queue.
     */
    @MessageMapping("/room.info")
    public void getRoomInfo(Map<String, Object> payload, SimpMessageHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();

        if (sessionId == null) {
            return;
        }

        String roomName = (String) payload.get("roomName");

        RoomInfo roomInfo = roomService.getRoomInfo(roomName);

        if (roomInfo == null) {
            sendError(sessionId, "ROOM_NOT_FOUND", "Room not found.");
            return;
        }

        Map<String, Object> response = new HashMap<>();
        response.put("type", "ROOM_INFO");
        response.put("roomName", roomInfo.getName());
        response.put("hasPassword", roomInfo.isHasPassword());
        response.put("participantCount", roomInfo.getParticipantCount());
        response.put("isActive", roomInfo.isActive());

        sendToUser(sessionId, response);
    }

    /**
     * Extracts the client IP from the STOMP session attributes.
     * The IP is stored during the WebSocket handshake by IpGuardInterceptor.
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

        sendToUser(sessionId, errorPayload);
    }

    /**
     * Sends a payload to a specific user's private queue using the resolved destination.
     * Spring's DefaultUserDestinationResolver resolves /user/queue/private subscriptions
     * to /queue/private-user{sessionId}, so we send directly to that destination.
     */
    private void sendToUser(String sessionId, Map<String, Object> payload) {
        org.springframework.messaging.simp.SimpMessageHeaderAccessor headerAccessor =
            org.springframework.messaging.simp.SimpMessageHeaderAccessor.create(org.springframework.messaging.simp.SimpMessageType.MESSAGE);
        headerAccessor.setSessionId(sessionId);
        headerAccessor.setLeaveMutable(true);
        messagingTemplate.convertAndSendToUser(sessionId, "/queue/private", payload, headerAccessor.getMessageHeaders());
    }

    /**
     * Broadcasts the updated participant list to all members in the room.
     */
    private void broadcastParticipantList(String roomName) {
        List<ParticipantInfo> participants = roomService.getParticipants(roomName);

        Map<String, Object> participantListEvent = new HashMap<>();
        participantListEvent.put("type", "PARTICIPANT_LIST");
        participantListEvent.put("participants", participants.stream()
                .map(p -> Map.of("ip", p.getIp(), "displayName", p.getDisplayName()))
                .toList());
        participantListEvent.put("count", participants.size());

        messagingTemplate.convertAndSend("/topic/room/" + roomName + "/events", participantListEvent);
    }

    /**
     * Maps join failure messages to appropriate error codes.
     */
    private String mapJoinErrorCode(String message) {
        if (message.contains("not found")) {
            return "ROOM_NOT_FOUND";
        } else if (message.contains("no longer available")) {
            return "ROOM_UNAVAILABLE";
        } else if (message.contains("full")) {
            return "ROOM_FULL";
        } else if (message.contains("Incorrect password")) {
            return "INVALID_PASSWORD";
        } else if (message.contains("Password is required")) {
            return "PASSWORD_REQUIRED";
        }
        return "JOIN_FAILED";
    }
}
