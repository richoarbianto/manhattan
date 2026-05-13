package com.manhattan.listener;

import com.manhattan.entity.Session;
import com.manhattan.service.RoomService;
import com.manhattan.service.SessionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.Map;
import java.util.Optional;

/**
 * Listens for WebSocket session lifecycle events (connect and disconnect).
 *
 * On disconnect:
 * 1. Marks the session as inactive
 * 2. Removes the client from the room
 * 3. Broadcasts a USER_LEFT event to remaining room members
 * 4. Releases the IP address for reuse
 *
 * Heartbeat (ping/pong) is configured in WebSocketConfig at the broker level
 * (25s server heartbeat interval, 10s client heartbeat timeout).
 */
@Component
public class WebSocketEventListener {

    private static final Logger log = LoggerFactory.getLogger(WebSocketEventListener.class);

    private final SessionService sessionService;
    private final RoomService roomService;
    private final SimpMessagingTemplate messagingTemplate;

    public WebSocketEventListener(SessionService sessionService,
                                  RoomService roomService,
                                  SimpMessagingTemplate messagingTemplate) {
        this.sessionService = sessionService;
        this.roomService = roomService;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Handles WebSocket session connect events.
     * Logs the connection for monitoring purposes.
     */
    @EventListener
    public void handleSessionConnect(SessionConnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        Map<String, Object> sessionAttributes = accessor.getSessionAttributes();

        if (sessionAttributes != null) {
            String clientIp = (String) sessionAttributes.get("clientIp");
            log.info("WebSocket session connected: sessionId={}, clientIp={}",
                    accessor.getSessionId(), clientIp);
        } else {
            log.info("WebSocket session connected: sessionId={}", accessor.getSessionId());
        }
    }

    /**
     * Handles WebSocket session disconnect events.
     * Performs cleanup: marks session inactive, removes from room,
     * broadcasts USER_LEFT event, and releases the IP address.
     */
    @EventListener
    public void handleSessionDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        Map<String, Object> sessionAttributes = accessor.getSessionAttributes();

        if (sessionAttributes == null) {
            log.warn("Session disconnect event with no session attributes, sessionId={}",
                    accessor.getSessionId());
            return;
        }

        String clientIp = (String) sessionAttributes.get("clientIp");

        if (clientIp == null || clientIp.isBlank()) {
            log.warn("Session disconnect event with no clientIp attribute, sessionId={}",
                    accessor.getSessionId());
            return;
        }

        log.info("WebSocket session disconnected: sessionId={}, clientIp={}",
                accessor.getSessionId(), clientIp);

        // 1. Get the room name from the active session record before marking disconnected
        Optional<Session> activeSession = sessionService.getActiveSession(clientIp);
        String roomName = activeSession.map(Session::getRoomName).orElse(null);

        // 2. Mark the session as disconnected/inactive
        sessionService.markDisconnected(clientIp);

        // 3. Remove the client from the room
        if (roomName != null) {
            roomService.leaveRoom(roomName, clientIp);

            // 4. Broadcast USER_LEFT event to remaining room members
            Map<String, String> userLeftEvent = Map.of(
                    "type", "USER_LEFT",
                    "ip", clientIp
            );
            messagingTemplate.convertAndSend(
                    "/topic/room/" + roomName + "/events",
                    userLeftEvent
            );

            log.info("Broadcast USER_LEFT event for clientIp={} in room={}", clientIp, roomName);
        }

        // 5. Release the IP address for reuse
        sessionService.releaseIp(clientIp);

        log.debug("IP released for clientIp={}", clientIp);
    }
}
