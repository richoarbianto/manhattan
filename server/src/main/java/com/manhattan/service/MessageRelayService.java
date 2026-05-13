package com.manhattan.service;

import com.manhattan.entity.QueuedMessage;
import com.manhattan.entity.Session;
import com.manhattan.entity.SessionStatus;
import com.manhattan.repository.QueuedMessageRepository;
import com.manhattan.repository.SessionRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Routes encrypted messages to room members and manages offline message queuing.
 * The server treats ciphertext as an opaque binary payload — it never inspects or decrypts content.
 */
@Service
public class MessageRelayService {

    private static final int MAX_QUEUE_SIZE = 500;

    private final QueuedMessageRepository queuedMessageRepository;
    private final SessionRepository sessionRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageRelayService(QueuedMessageRepository queuedMessageRepository,
                               SessionRepository sessionRepository,
                               SimpMessagingTemplate messagingTemplate) {
        this.queuedMessageRepository = queuedMessageRepository;
        this.sessionRepository = sessionRepository;
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Relays an encrypted message to all connected clients in the room except the sender.
     * If a client in the room is offline, the message is queued for later delivery.
     *
     * @param roomName      the target room name
     * @param senderIp      the IP address of the sending client
     * @param ciphertextB64 the encrypted message as a Base64 string (opaque payload)
     * @param ivB64         the initialization vector as a Base64 string
     * @param timestamp     the message timestamp
     */
    public void relayToRoom(String roomName, String senderIp, String ciphertextB64, String ivB64, long timestamp) {
        // Look up sender's display name from active session
        String senderDisplayName = sessionRepository.findByIpAddressAndStatus(senderIp, 
            com.manhattan.entity.SessionStatus.ACTIVE)
            .map(s -> s.getDisplayName())
            .orElse(senderIp);

        // Build the message payload to broadcast
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "MESSAGE");
        payload.put("senderIp", senderIp);
        payload.put("senderDisplayName", senderDisplayName);
        payload.put("ciphertext", ciphertextB64);
        payload.put("iv", ivB64);
        payload.put("timestamp", timestamp);

        // Send to the room topic — all subscribed (connected) clients will receive it
        messagingTemplate.convertAndSend("/topic/room/" + roomName, payload);
    }

    /**
     * Queues a message for an offline client. The ciphertext is stored as-is (opaque binary).
     * Enforces a maximum of 500 queued messages per (targetIp, roomName).
     * When the limit is exceeded, the oldest message is discarded.
     *
     * @param targetIp   the IP address of the offline client
     * @param roomName   the room the message belongs to
     * @param senderIp   the IP address of the sender
     * @param ciphertext the encrypted message bytes (opaque payload)
     * @param iv         the initialization vector bytes
     */
    @Transactional
    public void queueForOfflineClient(String targetIp, String roomName, String senderIp, byte[] ciphertext, byte[] iv) {
        // Enforce 500-message queue limit: discard oldest if at capacity
        long currentCount = queuedMessageRepository.countByTargetIpAndRoomName(targetIp, roomName);
        if (currentCount >= MAX_QUEUE_SIZE) {
            queuedMessageRepository.deleteOldest(targetIp, roomName);
        }

        QueuedMessage message = new QueuedMessage();
        message.setTargetIp(targetIp);
        message.setRoomName(roomName);
        message.setSenderIp(senderIp);
        message.setCiphertext(ciphertext);
        message.setIv(iv);
        message.setCreatedAt(LocalDateTime.now());

        queuedMessageRepository.save(message);
    }

    /**
     * Retrieves all queued messages for a client in a specific room, ordered by creation time.
     * Called when a client reconnects to deliver messages that were sent while they were offline.
     *
     * @param clientIp the IP address of the reconnecting client
     * @param roomName the room to retrieve queued messages for
     * @return list of queued messages ordered by creation time (oldest first)
     */
    public List<QueuedMessage> getQueuedMessages(String clientIp, String roomName) {
        return queuedMessageRepository.findByTargetIpAndRoomNameOrderByCreatedAtAsc(clientIp, roomName);
    }

    /**
     * Clears all queued messages for a client in a specific room.
     * Called after queued messages have been successfully delivered to the reconnected client.
     *
     * @param clientIp the IP address of the client
     * @param roomName the room to clear the queue for
     */
    @Transactional
    public void clearQueue(String clientIp, String roomName) {
        queuedMessageRepository.deleteByTargetIpAndRoomName(clientIp, roomName);
    }
}
