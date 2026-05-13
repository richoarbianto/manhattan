package com.manhattan.property;

import com.manhattan.entity.QueuedMessage;
import com.manhattan.entity.RateLimit;
import com.manhattan.entity.Session;
import com.manhattan.entity.SessionStatus;
import com.manhattan.repository.QueuedMessageRepository;
import com.manhattan.repository.RateLimitRepository;
import com.manhattan.repository.SessionRepository;
import com.manhattan.service.KeyExchangeService;
import com.manhattan.service.MessageRelayService;
import com.manhattan.service.RateLimitService;
import com.manhattan.service.SessionService;
import net.jqwik.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Property-based tests for Manhattan server services using jqwik.
 * Tests Properties 4, 8, 9, 12, and 16 from the design document.
 */
class ServerPropertyTests {

    // =========================================================================
    // Feature: manhattan, Property 4: Rate limiting triggers at threshold
    // Validates: Requirements 3.7
    // =========================================================================

    @Property(tries = 20)
    void rateLimitingTriggersAtExactly5Attempts(@ForAll("failedAttemptCounts") int attempts) {
        RateLimitRepository repo = mock(RateLimitRepository.class);
        RateLimitService service = new RateLimitService(repo);

        RateLimit rateLimit = new RateLimit();
        rateLimit.setClientIp("1.2.3.4");
        rateLimit.setRoomName("room");
        rateLimit.setFailedAttempts(attempts);
        rateLimit.setLockedUntil(null);
        rateLimit.setLastAttemptAt(LocalDateTime.now());

        when(repo.findByClientIpAndRoomName("1.2.3.4", "room"))
                .thenReturn(Optional.of(rateLimit));
        when(repo.save(any(RateLimit.class))).thenAnswer(i -> i.getArgument(0));

        service.recordFailedAttempt("1.2.3.4", "room");

        if (attempts + 1 >= 5) {
            assertNotNull(rateLimit.getLockedUntil(),
                    "With " + (attempts + 1) + " total attempts (>= 5), should be locked");
        } else {
            assertNull(rateLimit.getLockedUntil(),
                    "With " + (attempts + 1) + " total attempts (< 5), should NOT be locked");
        }
    }

    @Provide
    Arbitrary<Integer> failedAttemptCounts() {
        return Arbitraries.integers().between(0, 6);
    }

    // =========================================================================
    // Feature: manhattan, Property 8: Server relay payload integrity
    // Validates: Requirements 5.5
    // =========================================================================

    @Property(tries = 20)
    void relayPayloadIntegrity(@ForAll byte[] payload) {
        Assume.that(payload.length > 0 && payload.length < 10000);

        QueuedMessageRepository queueRepo = mock(QueuedMessageRepository.class);
        SessionRepository sessionRepo = mock(SessionRepository.class);
        SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
        MessageRelayService service = new MessageRelayService(queueRepo, sessionRepo, template);

        when(queueRepo.countByTargetIpAndRoomName(anyString(), anyString())).thenReturn(0L);
        when(queueRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        service.queueForOfflineClient("target", "room", "sender", payload, new byte[16]);

        ArgumentCaptor<QueuedMessage> captor =
                ArgumentCaptor.forClass(QueuedMessage.class);
        verify(queueRepo).save(captor.capture());

        assertArrayEquals(payload, captor.getValue().getCiphertext(),
                "Queued ciphertext must be byte-for-byte identical to the input payload");
    }

    // =========================================================================
    // Feature: manhattan, Property 9: RSA public key validation
    // Validates: Requirements 5.9
    // =========================================================================

    @Property(tries = 20)
    void rsaKeyValidation_rejectsSmallKeys(@ForAll("rsaKeySizes") int keySize) throws Exception {
        SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
        SessionRepository sessionRepo = mock(SessionRepository.class);
        KeyExchangeService service = new KeyExchangeService(template, sessionRepo);

        KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA");
        keyGen.initialize(keySize);
        KeyPair keyPair = keyGen.generateKeyPair();
        String base64Key = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());

        boolean result = service.validateRsaPublicKey(base64Key);

        if (keySize >= 2048) {
            assertTrue(result, "Key of size " + keySize + " should be accepted");
        } else {
            assertFalse(result, "Key of size " + keySize + " should be rejected");
        }
    }

    @Provide
    Arbitrary<Integer> rsaKeySizes() {
        return Arbitraries.of(1024, 2048, 4096);
    }

    // =========================================================================
    // Feature: manhattan, Property 12: Message queue capacity limit
    // Validates: Requirements 6.7
    // =========================================================================

    @Property(tries = 20)
    void messageQueueCapacity(@ForAll("queueCounts") long currentCount) {
        QueuedMessageRepository queueRepo = mock(QueuedMessageRepository.class);
        SessionRepository sessionRepo = mock(SessionRepository.class);
        SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
        MessageRelayService service = new MessageRelayService(queueRepo, sessionRepo, template);

        when(queueRepo.countByTargetIpAndRoomName("target", "room")).thenReturn(currentCount);
        when(queueRepo.save(any())).thenAnswer(i -> i.getArgument(0));

        service.queueForOfflineClient("target", "room", "sender", "data".getBytes(), new byte[16]);

        if (currentCount >= 500) {
            verify(queueRepo).deleteOldest("target", "room");
        } else {
            verify(queueRepo, never()).deleteOldest(anyString(), anyString());
        }
    }

    @Provide
    Arbitrary<Long> queueCounts() {
        return Arbitraries.longs().between(0, 600);
    }

    // =========================================================================
    // Feature: manhattan, Property 16: One session per IP enforcement
    // Validates: Requirements 11.2
    // =========================================================================

    @Property(tries = 20)
    void oneSessionPerIp(@ForAll("ipAddresses") String ip) {
        SessionRepository repo = mock(SessionRepository.class);
        SessionService service = new SessionService(repo);

        Session existingSession = new Session();
        existingSession.setIpAddress(ip);
        existingSession.setStatus(SessionStatus.ACTIVE);

        when(repo.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(existingSession));

        assertThrows(IllegalStateException.class,
                () -> service.createSession(ip, "room", "stomp-id"),
                "Second session from IP " + ip + " should be rejected");
    }

    @Provide
    Arbitrary<String> ipAddresses() {
        return Arbitraries.integers().between(1, 255)
                .tuple4()
                .map(t -> t.get1() + "." + t.get2() + "." + t.get3() + "." + t.get4());
    }
}
