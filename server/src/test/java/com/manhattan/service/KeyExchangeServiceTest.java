package com.manhattan.service;

import com.manhattan.entity.Session;
import com.manhattan.entity.SessionStatus;
import com.manhattan.repository.SessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class KeyExchangeServiceTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @Mock
    private SessionRepository sessionRepository;

    private KeyExchangeService keyExchangeService;

    @BeforeEach
    void setUp() {
        keyExchangeService = new KeyExchangeService(messagingTemplate, sessionRepository);
    }

    @Test
    void broadcastPublicKey_sendsUserJoinedEventToRoomTopic() {
        String roomName = "testRoom";
        String senderIp = "192.168.1.1";
        String rsaPublicKey = "dummyBase64Key";

        keyExchangeService.broadcastPublicKey(roomName, senderIp, rsaPublicKey);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(
                eq("/topic/room/testRoom/events"),
                payloadCaptor.capture()
        );

        Map<String, Object> payload = payloadCaptor.getValue();
        assertEquals("USER_JOINED", payload.get("type"));
        assertEquals("192.168.1.1", payload.get("ip"));
        assertEquals("dummyBase64Key", payload.get("rsaPublicKey"));
    }

    @Test
    void forwardEncryptedAesKey_sendsToTargetUserPrivateQueue() {
        String targetIp = "192.168.1.2";
        String senderIp = "192.168.1.1";
        String encryptedAesKey = "encryptedKeyBase64";

        Session targetSession = new Session();
        targetSession.setIpAddress(targetIp);
        targetSession.setStompSessionId("stomp-session-123");
        targetSession.setStatus(SessionStatus.ACTIVE);

        when(sessionRepository.findByIpAddressAndStatus(targetIp, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(targetSession));

        keyExchangeService.forwardEncryptedAesKey(targetIp, senderIp, encryptedAesKey);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSendToUser(
                eq("stomp-session-123"),
                eq("/queue/private"),
                payloadCaptor.capture()
        );

        Map<String, Object> payload = payloadCaptor.getValue();
        assertEquals("AES_KEY_EXCHANGE", payload.get("type"));
        assertEquals("192.168.1.1", payload.get("senderIp"));
        assertEquals("encryptedKeyBase64", payload.get("encryptedAesKey"));
    }

    @Test
    void forwardEncryptedAesKey_discardsWhenTargetDisconnected() {
        String targetIp = "192.168.1.2";
        String senderIp = "192.168.1.1";
        String encryptedAesKey = "encryptedKeyBase64";

        when(sessionRepository.findByIpAddressAndStatus(targetIp, SessionStatus.ACTIVE))
                .thenReturn(Optional.empty());

        keyExchangeService.forwardEncryptedAesKey(targetIp, senderIp, encryptedAesKey);

        verifyNoInteractions(messagingTemplate);
    }

    @Test
    void validateRsaPublicKey_acceptsValid2048BitKey() throws Exception {
        KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA");
        keyGen.initialize(2048);
        KeyPair keyPair = keyGen.generateKeyPair();
        String base64Key = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());

        assertTrue(keyExchangeService.validateRsaPublicKey(base64Key));
    }

    @Test
    void validateRsaPublicKey_acceptsValid4096BitKey() throws Exception {
        KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA");
        keyGen.initialize(4096);
        KeyPair keyPair = keyGen.generateKeyPair();
        String base64Key = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());

        assertTrue(keyExchangeService.validateRsaPublicKey(base64Key));
    }

    @Test
    void validateRsaPublicKey_rejects1024BitKey() throws Exception {
        KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA");
        keyGen.initialize(1024);
        KeyPair keyPair = keyGen.generateKeyPair();
        String base64Key = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());

        assertFalse(keyExchangeService.validateRsaPublicKey(base64Key));
    }

    @Test
    void validateRsaPublicKey_rejectsNull() {
        assertFalse(keyExchangeService.validateRsaPublicKey(null));
    }

    @Test
    void validateRsaPublicKey_rejectsEmptyString() {
        assertFalse(keyExchangeService.validateRsaPublicKey(""));
    }

    @Test
    void validateRsaPublicKey_rejectsBlankString() {
        assertFalse(keyExchangeService.validateRsaPublicKey("   "));
    }

    @Test
    void validateRsaPublicKey_rejectsInvalidBase64() {
        assertFalse(keyExchangeService.validateRsaPublicKey("not-valid-base64!!!"));
    }

    @Test
    void validateRsaPublicKey_rejectsRandomBytes() {
        String randomBase64 = Base64.getEncoder().encodeToString(new byte[]{1, 2, 3, 4, 5});
        assertFalse(keyExchangeService.validateRsaPublicKey(randomBase64));
    }
}
