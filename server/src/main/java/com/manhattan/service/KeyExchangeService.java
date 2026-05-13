package com.manhattan.service;

import com.manhattan.entity.Session;
import com.manhattan.entity.SessionStatus;
import com.manhattan.repository.SessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

@Service
public class KeyExchangeService {

    private static final Logger logger = LoggerFactory.getLogger(KeyExchangeService.class);
    private static final int MINIMUM_RSA_KEY_SIZE_BITS = 2048;

    private final SimpMessagingTemplate messagingTemplate;
    private final SessionRepository sessionRepository;

    public KeyExchangeService(SimpMessagingTemplate messagingTemplate, SessionRepository sessionRepository) {
        this.messagingTemplate = messagingTemplate;
        this.sessionRepository = sessionRepository;
    }

    /**
     * Broadcasts a USER_JOINED event containing the new client's RSA public key
     * to all existing room members via the room events topic.
     *
     * @param roomName          the name of the room to broadcast to
     * @param senderIp          the IP address of the joining client
     * @param rsaPublicKeyBase64 the RSA public key in base64-encoded SPKI format
     */
    public void broadcastPublicKey(String roomName, String senderIp, String rsaPublicKeyBase64, String displayName) {
        String destination = "/topic/room/" + roomName + "/events";

        java.util.Map<String, Object> event = new java.util.HashMap<>();
        event.put("type", "USER_JOINED");
        event.put("ip", senderIp);
        event.put("rsaPublicKey", rsaPublicKeyBase64);
        event.put("displayName", displayName != null ? displayName : senderIp);

        messagingTemplate.convertAndSend(destination, event);
        logger.debug("Broadcast USER_JOINED event for IP {} (displayName={}) to room {}", senderIp, displayName, roomName);
    }

    /**
     * Forwards an encrypted AES key to a specific target client via their private queue.
     * If the target client is disconnected, the message is silently discarded.
     *
     * @param targetIp             the IP address of the target client
     * @param senderIp             the IP address of the sending client
     * @param encryptedAesKeyBase64 the encrypted AES key in base64 format
     */
    public void forwardEncryptedAesKey(String targetIp, String senderIp, String encryptedAesKeyBase64, String rsaPublicKey) {
        Optional<Session> targetSession = sessionRepository.findByIpAddressAndStatus(targetIp, SessionStatus.ACTIVE);

        if (targetSession.isEmpty()) {
            logger.debug("Target client {} is disconnected, discarding AES key exchange from {}", targetIp, senderIp);
            return;
        }

        String sessionId = targetSession.get().getStompSessionId();
        String destination = "/queue/private";

        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("type", "AES_KEY_EXCHANGE");
        payload.put("senderIp", senderIp);
        payload.put("encryptedAesKey", encryptedAesKeyBase64);
        if (rsaPublicKey != null) {
            payload.put("rsaPublicKey", rsaPublicKey);
        }

        org.springframework.messaging.simp.SimpMessageHeaderAccessor ha =
            org.springframework.messaging.simp.SimpMessageHeaderAccessor.create(org.springframework.messaging.simp.SimpMessageType.MESSAGE);
        ha.setSessionId(sessionId);
        ha.setLeaveMutable(true);
        messagingTemplate.convertAndSendToUser(sessionId, destination, payload, ha.getMessageHeaders());
        logger.debug("Forwarded encrypted AES key from {} to {} (session: {})", senderIp, targetIp, sessionId);
    }

    /**
     * Validates that the given base64-encoded string is a well-formed RSA public key
     * with a modulus of at least 2048 bits.
     *
     * @param rsaPublicKeyBase64 the RSA public key in base64-encoded SPKI format
     * @return true if the key is a valid RSA public key with >= 2048-bit modulus, false otherwise
     */
    public boolean validateRsaPublicKey(String rsaPublicKeyBase64) {
        if (rsaPublicKeyBase64 == null || rsaPublicKeyBase64.isBlank()) {
            return false;
        }

        try {
            byte[] keyBytes = Base64.getDecoder().decode(rsaPublicKeyBase64);
            X509EncodedKeySpec keySpec = new X509EncodedKeySpec(keyBytes);
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            RSAPublicKey rsaPublicKey = (RSAPublicKey) keyFactory.generatePublic(keySpec);

            int keySize = rsaPublicKey.getModulus().bitLength();
            if (keySize < MINIMUM_RSA_KEY_SIZE_BITS) {
                logger.debug("RSA public key rejected: modulus size {} bits is below minimum {}", keySize, MINIMUM_RSA_KEY_SIZE_BITS);
                return false;
            }

            return true;
        } catch (IllegalArgumentException e) {
            logger.debug("RSA public key validation failed: invalid base64 encoding", e);
            return false;
        } catch (Exception e) {
            logger.debug("RSA public key validation failed: {}", e.getMessage(), e);
            return false;
        }
    }
}
