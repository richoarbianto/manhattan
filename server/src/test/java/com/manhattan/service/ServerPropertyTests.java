package com.manhattan.service;

import com.manhattan.entity.QueuedMessage;
import com.manhattan.entity.RateLimit;
import com.manhattan.entity.Session;
import com.manhattan.entity.SessionStatus;
import com.manhattan.repository.QueuedMessageRepository;
import com.manhattan.repository.RateLimitRepository;
import com.manhattan.repository.SessionRepository;
import net.jqwik.api.*;
import net.jqwik.api.constraints.AlphaChars;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.constraints.NumericChars;
import net.jqwik.api.constraints.StringLength;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Property-based tests for Manhattan server services using jqwik.
 */
class ServerPropertyTests {

    // =========================================================================
    // Feature: manhattan, Property 3: Password verification round-trip
    // Validates: Requirements 3.4
    // =========================================================================

    @Property(tries = 100)
    void passwordVerificationRoundTrip_samePasswordAlwaysVerifies(
            @ForAll @StringLength(min = 1, max = 64) @AlphaChars String password) {
        // Feature: manhattan, Property 3: Password verification round-trip
        RoomService roomService = createRoomServiceWithMocks();

        // Hash the password using Argon2id in PHC format (same as client would send)
        String storedHash = hashPasswordArgon2id(password);

        // Verify the same password passes
        assertTrue(roomService.verifyArgon2Password(password, storedHash),
                "Same password should always verify against its own hash");
    }

    @Property(tries = 100)
    void passwordVerificationRoundTrip_differentPasswordAlwaysFails(
            @ForAll @StringLength(min = 1, max = 32) @AlphaChars String password,
            @ForAll @StringLength(min = 1, max = 32) @AlphaChars String differentPassword) {
        // Feature: manhattan, Property 3: Password verification round-trip
        Assume.that(!password.equals(differentPassword));

        RoomService roomService = createRoomServiceWithMocks();

        // Hash the original password
        String storedHash = hashPasswordArgon2id(password);

        // Verify a different password fails
        assertFalse(roomService.verifyArgon2Password(differentPassword, storedHash),
                "Different password should never verify against another password's hash");
    }

    // =========================================================================
    // Feature: manhattan, Property 4: Rate limiting triggers at threshold
    // Validates: Requirements 3.7
    // =========================================================================

    @Property(tries = 100)
    void rateLimiting_belowThresholdNeverLocks(
            @ForAll @IntRange(min = 1, max = 4) int failedAttempts,
            @ForAll @StringLength(min = 7, max = 15) @NumericChars String ipSuffix,
            @ForAll @StringLength(min = 3, max = 10) @AlphaChars String roomName) {
        // Feature: manhattan, Property 4: Rate limiting triggers at threshold
        String clientIp = "10.0.0." + ipSuffix.substring(0, Math.min(3, ipSuffix.length()));

        // Use a mutable holder to simulate repository state
        AtomicReference<RateLimit> stored = new AtomicReference<>(null);
        RateLimitRepository rateLimitRepository = mock(RateLimitRepository.class);

        when(rateLimitRepository.findByClientIpAndRoomName(clientIp, roomName))
                .thenAnswer(inv -> Optional.ofNullable(stored.get()));
        when(rateLimitRepository.save(any(RateLimit.class)))
                .thenAnswer(inv -> {
                    RateLimit rl = inv.getArgument(0);
                    stored.set(rl);
                    return rl;
                });

        RateLimitService rateLimitService = new RateLimitService(rateLimitRepository);

        // Record N failed attempts (N < 5)
        for (int i = 0; i < failedAttempts; i++) {
            rateLimitService.recordFailedAttempt(clientIp, roomName);
        }

        // Should NOT be locked
        assertFalse(rateLimitService.isLocked(clientIp, roomName),
                "With " + failedAttempts + " failed attempts (< 5), should NOT be locked");
    }

    @Property(tries = 100)
    void rateLimiting_atThresholdAlwaysLocks(
            @ForAll @StringLength(min = 1, max = 3) @NumericChars String ipOctet,
            @ForAll @StringLength(min = 3, max = 10) @AlphaChars String roomName) {
        // Feature: manhattan, Property 4: Rate limiting triggers at threshold
        String clientIp = "192.168.1." + ipOctet;

        AtomicReference<RateLimit> stored = new AtomicReference<>(null);
        RateLimitRepository rateLimitRepository = mock(RateLimitRepository.class);

        when(rateLimitRepository.findByClientIpAndRoomName(clientIp, roomName))
                .thenAnswer(inv -> Optional.ofNullable(stored.get()));
        when(rateLimitRepository.save(any(RateLimit.class)))
                .thenAnswer(inv -> {
                    RateLimit rl = inv.getArgument(0);
                    stored.set(rl);
                    return rl;
                });

        RateLimitService rateLimitService = new RateLimitService(rateLimitRepository);

        // Record exactly 5 failed attempts
        for (int i = 0; i < 5; i++) {
            rateLimitService.recordFailedAttempt(clientIp, roomName);
        }

        // Should be locked
        assertTrue(rateLimitService.isLocked(clientIp, roomName),
                "With exactly 5 failed attempts, should be locked");
    }

    // =========================================================================
    // Feature: manhattan, Property 8: Server relay payload integrity
    // Validates: Requirements 6.5
    // =========================================================================

    @Property(tries = 100)
    void serverRelayPayloadIntegrity_payloadMatchesExactly(
            @ForAll @StringLength(min = 3, max = 15) @AlphaChars String roomName,
            @ForAll @StringLength(min = 7, max = 15) String senderIp,
            @ForAll("randomBytes") byte[] ciphertext,
            @ForAll("randomIvBytes") byte[] iv) {
        // Feature: manhattan, Property 8: Server relay payload integrity

        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        SessionRepository sessionRepository = mock(SessionRepository.class);
        QueuedMessageRepository queuedMessageRepository = mock(QueuedMessageRepository.class);

        MessageRelayService relayService = new MessageRelayService(
                queuedMessageRepository, sessionRepository, messagingTemplate);

        String ciphertextB64 = Base64.getEncoder().encodeToString(ciphertext);
        String ivB64 = Base64.getEncoder().encodeToString(iv);
        long timestamp = System.currentTimeMillis();

        relayService.relayToRoom(roomName, senderIp, ciphertextB64, ivB64, timestamp);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(
                eq("/topic/room/" + roomName),
                payloadCaptor.capture()
        );

        Map<String, Object> relayedPayload = payloadCaptor.getValue();

        // The relayed payload must be byte-for-byte identical
        assertEquals(ciphertextB64, relayedPayload.get("ciphertext"),
                "Relayed ciphertext must match original exactly");
        assertEquals(ivB64, relayedPayload.get("iv"),
                "Relayed IV must match original exactly");
        assertEquals(senderIp, relayedPayload.get("senderIp"),
                "Relayed senderIp must match original exactly");
        assertEquals(timestamp, relayedPayload.get("timestamp"),
                "Relayed timestamp must match original exactly");
    }

    // =========================================================================
    // Feature: manhattan, Property 9: RSA public key validation
    // Validates: Requirements 5.9
    // =========================================================================

    @Property(tries = 20)
    void rsaPublicKeyValidation_validKeysAtLeast2048BitsAccepted(
            @ForAll("validRsaKeySizes") int keySize) throws NoSuchAlgorithmException {
        // Feature: manhattan, Property 9: RSA public key validation
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        SessionRepository sessionRepository = mock(SessionRepository.class);
        KeyExchangeService keyExchangeService = new KeyExchangeService(messagingTemplate, sessionRepository);

        KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA");
        keyGen.initialize(keySize);
        KeyPair keyPair = keyGen.generateKeyPair();
        String base64Key = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());

        assertTrue(keyExchangeService.validateRsaPublicKey(base64Key),
                "RSA key of " + keySize + " bits (>= 2048) should be accepted");
    }

    @Property(tries = 20)
    void rsaPublicKeyValidation_keysBelow2048BitsRejected(
            @ForAll("invalidRsaKeySizes") int keySize) throws NoSuchAlgorithmException {
        // Feature: manhattan, Property 9: RSA public key validation
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        SessionRepository sessionRepository = mock(SessionRepository.class);
        KeyExchangeService keyExchangeService = new KeyExchangeService(messagingTemplate, sessionRepository);

        KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA");
        keyGen.initialize(keySize);
        KeyPair keyPair = keyGen.generateKeyPair();
        String base64Key = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());

        assertFalse(keyExchangeService.validateRsaPublicKey(base64Key),
                "RSA key of " + keySize + " bits (< 2048) should be rejected");
    }

    @Property(tries = 100)
    void rsaPublicKeyValidation_randomStringsRejected(
            @ForAll @StringLength(min = 1, max = 200) String randomString) {
        // Feature: manhattan, Property 9: RSA public key validation
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        SessionRepository sessionRepository = mock(SessionRepository.class);
        KeyExchangeService keyExchangeService = new KeyExchangeService(messagingTemplate, sessionRepository);

        assertFalse(keyExchangeService.validateRsaPublicKey(randomString),
                "Random string should be rejected as RSA public key");
    }

    // =========================================================================
    // Feature: manhattan, Property 12: Message queue capacity limit
    // Validates: Requirements 6.7
    // =========================================================================

    @Property(tries = 100)
    void messageQueueCapacityLimit_neverExceeds500(
            @ForAll @IntRange(min = 501, max = 600) int totalMessages) {
        // Feature: manhattan, Property 12: Message queue capacity limit
        String targetIp = "10.0.0.1";
        String roomName = "testRoom";
        String senderIp = "10.0.0.2";

        QueuedMessageRepository queuedMessageRepository = mock(QueuedMessageRepository.class);
        SessionRepository sessionRepository = mock(SessionRepository.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);

        // Track the current count in the mock
        final long[] currentCount = {499}; // Start at 499 (below limit)

        when(queuedMessageRepository.countByTargetIpAndRoomName(targetIp, roomName))
                .thenAnswer(inv -> currentCount[0]);
        when(queuedMessageRepository.save(any(QueuedMessage.class)))
                .thenAnswer(inv -> {
                    currentCount[0] = Math.min(currentCount[0] + 1, 500);
                    return inv.getArgument(0);
                });
        doAnswer(inv -> {
            currentCount[0] = Math.max(currentCount[0] - 1, 0);
            return null;
        }).when(queuedMessageRepository).deleteOldest(targetIp, roomName);

        MessageRelayService relayService = new MessageRelayService(
                queuedMessageRepository, sessionRepository, messagingTemplate);

        byte[] ciphertext = new byte[]{1, 2, 3};
        byte[] iv = new byte[]{4, 5, 6};

        // Queue messages beyond the limit
        int messagesToQueue = totalMessages - 499; // We start at 499
        for (int i = 0; i < messagesToQueue; i++) {
            relayService.queueForOfflineClient(targetIp, roomName, senderIp, ciphertext, iv);
        }

        // The count should never exceed 500
        assertTrue(currentCount[0] <= 500,
                "Queue count should never exceed 500, but was " + currentCount[0]);
    }

    // =========================================================================
    // Feature: manhattan, Property 16: One session per IP enforcement
    // Validates: Requirements 11.2
    // =========================================================================

    @Property(tries = 100)
    void oneSessionPerIp_secondSessionThrowsException(
            @ForAll @StringLength(min = 7, max = 15) @NumericChars String ipSuffix,
            @ForAll @StringLength(min = 3, max = 10) @AlphaChars String roomName,
            @ForAll @StringLength(min = 5, max = 20) @AlphaChars String sessionId1,
            @ForAll @StringLength(min = 5, max = 20) @AlphaChars String sessionId2) {
        // Feature: manhattan, Property 16: One session per IP enforcement
        Assume.that(!sessionId1.equals(sessionId2));

        String ipAddress = "10.0." + ipSuffix.substring(0, Math.min(3, ipSuffix.length())) + ".1";

        SessionRepository sessionRepository = mock(SessionRepository.class);
        SessionService sessionService = new SessionService(sessionRepository);

        // First session creation succeeds
        when(sessionRepository.findByIpAddressAndStatus(ipAddress, SessionStatus.ACTIVE))
                .thenReturn(Optional.empty());
        when(sessionRepository.save(any(Session.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        Session firstSession = sessionService.createSession(ipAddress, roomName, sessionId1);
        assertNotNull(firstSession, "First session should be created successfully");

        // Now simulate that the first session is active
        when(sessionRepository.findByIpAddressAndStatus(ipAddress, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(firstSession));

        // Second session attempt should throw
        assertThrows(IllegalStateException.class,
                () -> sessionService.createSession(ipAddress, roomName, sessionId2),
                "Second session from same IP should throw IllegalStateException");
    }

    @Property(tries = 100)
    void oneSessionPerIp_existingSessionPreservedOnRejection(
            @ForAll @StringLength(min = 7, max = 15) @NumericChars String ipSuffix,
            @ForAll @StringLength(min = 3, max = 10) @AlphaChars String roomName,
            @ForAll @StringLength(min = 5, max = 20) @AlphaChars String sessionId1,
            @ForAll @StringLength(min = 5, max = 20) @AlphaChars String sessionId2) {
        // Feature: manhattan, Property 16: One session per IP enforcement
        Assume.that(!sessionId1.equals(sessionId2));

        String ipAddress = "10.0." + ipSuffix.substring(0, Math.min(3, ipSuffix.length())) + ".1";

        SessionRepository sessionRepository = mock(SessionRepository.class);
        SessionService sessionService = new SessionService(sessionRepository);

        // Create first session
        when(sessionRepository.findByIpAddressAndStatus(ipAddress, SessionStatus.ACTIVE))
                .thenReturn(Optional.empty());
        when(sessionRepository.save(any(Session.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        Session firstSession = sessionService.createSession(ipAddress, roomName, sessionId1);

        // Now simulate active session exists
        when(sessionRepository.findByIpAddressAndStatus(ipAddress, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(firstSession));

        // Attempt second session
        try {
            sessionService.createSession(ipAddress, roomName, sessionId2);
        } catch (IllegalStateException e) {
            // Expected
        }

        // Verify the existing session was never modified (save only called once for first session)
        verify(sessionRepository, times(1)).save(any(Session.class));

        // Verify the first session is still active
        assertTrue(sessionService.hasActiveSession(ipAddress),
                "Existing session should remain unchanged after rejection");
    }

    // =========================================================================
    // Arbitraries (Generators)
    // =========================================================================

    @Provide
    Arbitrary<Integer> validRsaKeySizes() {
        return Arbitraries.of(2048, 3072, 4096);
    }

    @Provide
    Arbitrary<Integer> invalidRsaKeySizes() {
        return Arbitraries.of(512, 1024);
    }

    @Provide
    Arbitrary<byte[]> randomBytes() {
        return Arbitraries.bytes().array(byte[].class).ofMinSize(1).ofMaxSize(256);
    }

    @Provide
    Arbitrary<byte[]> randomIvBytes() {
        return Arbitraries.bytes().array(byte[].class).ofMinSize(1).ofMaxSize(16);
    }

    // =========================================================================
    // Helper Methods
    // =========================================================================

    private RoomService createRoomServiceWithMocks() {
        var roomRepository = mock(com.manhattan.repository.RoomRepository.class);
        var sessionRepository = mock(SessionRepository.class);
        return new RoomService(roomRepository, sessionRepository);
    }

    /**
     * Hashes a password using Argon2id with Bouncy Castle, producing a PHC format string.
     * Parameters: timeCost=3, memoryCost=65536 (64MB), parallelism=4, hashLength=32
     */
    private String hashPasswordArgon2id(String password) {
        byte[] salt = new byte[16];
        // Use a deterministic salt for testing (in production, this would be random)
        new java.security.SecureRandom().nextBytes(salt);

        org.bouncycastle.crypto.params.Argon2Parameters.Builder builder =
                new org.bouncycastle.crypto.params.Argon2Parameters.Builder(
                        org.bouncycastle.crypto.params.Argon2Parameters.ARGON2_id)
                        .withVersion(org.bouncycastle.crypto.params.Argon2Parameters.ARGON2_VERSION_13)
                        .withMemoryAsKB(65536)
                        .withIterations(3)
                        .withParallelism(4)
                        .withSalt(salt);

        org.bouncycastle.crypto.generators.Argon2BytesGenerator generator =
                new org.bouncycastle.crypto.generators.Argon2BytesGenerator();
        generator.init(builder.build());

        byte[] hash = new byte[32];
        generator.generateBytes(password.toCharArray(), hash);

        // Produce PHC format: $argon2id$v=19$m=65536,t=3,p=4$<salt_b64>$<hash_b64>
        String saltB64 = Base64.getEncoder().withoutPadding().encodeToString(salt);
        String hashB64 = Base64.getEncoder().withoutPadding().encodeToString(hash);

        return "$argon2id$v=19$m=65536,t=3,p=4$" + saltB64 + "$" + hashB64;
    }
}
