package com.manhattan.service;

import com.manhattan.dto.RoomCreationResult;
import com.manhattan.dto.RoomJoinResult;
import com.manhattan.entity.Room;
import com.manhattan.entity.SessionStatus;
import com.manhattan.repository.RoomRepository;
import com.manhattan.repository.SessionRepository;
import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for RoomService.
 * Validates: Requirements 1.1, 1.2, 1.8, 2.2, 3.5, 3.6
 */
@ExtendWith(MockitoExtension.class)
class RoomServiceTest {

    @Mock
    private RoomRepository roomRepository;

    @Mock
    private SessionRepository sessionRepository;

    private RoomService roomService;

    @BeforeEach
    void setUp() {
        roomService = new RoomService(roomRepository, sessionRepository);
    }

    private String generateArgon2Hash(String password) {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);

        Argon2Parameters params = new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
                .withVersion(Argon2Parameters.ARGON2_VERSION_13)
                .withMemoryAsKB(65536)
                .withIterations(3)
                .withParallelism(4)
                .withSalt(salt)
                .build();

        Argon2BytesGenerator generator = new Argon2BytesGenerator();
        generator.init(params);

        byte[] hash = new byte[32];
        generator.generateBytes(password.toCharArray(), hash);

        String saltBase64 = Base64.getEncoder().withoutPadding().encodeToString(salt);
        String hashBase64 = Base64.getEncoder().withoutPadding().encodeToString(hash);

        return "$argon2id$v=19$m=65536,t=3,p=4$" + saltBase64 + "$" + hashBase64;
    }

    // --- Requirement 1.1: Room creation with valid name ---
    @Test
    void createRoom_withValidName_succeeds() {
        when(roomRepository.existsByName("ChatRoom")).thenReturn(false);

        RoomCreationResult result = roomService.createRoom("ChatRoom", null, "192.168.1.1");

        assertTrue(result.isSuccess());
        assertEquals("ChatRoom", result.getRoomName());
        verify(roomRepository).save(any(Room.class));
    }

    // --- Requirement 1.2: Duplicate room name rejection ---
    @Test
    void createRoom_withDuplicateName_fails() {
        when(roomRepository.existsByName("Existing")).thenReturn(true);

        RoomCreationResult result = roomService.createRoom("Existing", null, "192.168.1.1");

        assertFalse(result.isSuccess());
        assertTrue(result.getMessage().contains("already taken"));
        verify(roomRepository, never()).save(any(Room.class));
    }

    // --- Requirement 1.3: Invalid room name rejected ---
    @Test
    void createRoom_withInvalidName_fails() {
        RoomCreationResult result = roomService.createRoom("ab", null, "192.168.1.1");

        assertFalse(result.isSuccess());
        assertTrue(result.getMessage().contains("Invalid room name"));
        verify(roomRepository, never()).save(any(Room.class));
    }

    // --- Requirement 1.3: Room name validation accepts valid names ---
    @Test
    void validateRoomName_validCases() {
        assertTrue(roomService.validateRoomName("abc"));          // min length
        assertTrue(roomService.validateRoomName("abcdefghijklmno")); // max length (15)
        assertTrue(roomService.validateRoomName("Room123"));      // mixed alphanumeric
        assertTrue(roomService.validateRoomName("UPPER"));        // uppercase only
        assertTrue(roomService.validateRoomName("12345"));        // digits only
    }

    // --- Requirement 1.3, 1.4: Room name validation rejects invalid names ---
    @Test
    void validateRoomName_invalidCases() {
        assertFalse(roomService.validateRoomName(null));              // null
        assertFalse(roomService.validateRoomName(""));               // empty
        assertFalse(roomService.validateRoomName("ab"));             // too short
        assertFalse(roomService.validateRoomName("abcdefghijklmnop")); // too long (16)
        assertFalse(roomService.validateRoomName("my room"));        // spaces
        assertFalse(roomService.validateRoomName("room@123"));       // special chars
        assertFalse(roomService.validateRoomName("my-room"));        // hyphen
    }

    // --- Requirement 3.5: Join with correct password succeeds ---
    @Test
    void joinRoom_withCorrectPassword_succeeds() {
        String password = "secret123";
        String storedHash = generateArgon2Hash(password);

        Room room = new Room();
        room.setName("SecRoom");
        room.setActive(true);
        room.setPasswordHash(storedHash);
        when(roomRepository.findByName("SecRoom")).thenReturn(Optional.of(room));
        when(sessionRepository.countByRoomNameAndStatus("SecRoom", SessionStatus.ACTIVE))
                .thenReturn(3L);

        RoomJoinResult result = roomService.joinRoom("SecRoom", password, "192.168.1.1");

        assertTrue(result.isSuccess());
        assertEquals(4, result.getParticipantCount());
    }

    // --- Requirement 3.6: Join with incorrect password fails ---
    @Test
    void joinRoom_withIncorrectPassword_fails() {
        String storedHash = generateArgon2Hash("correctPass");

        Room room = new Room();
        room.setName("SecRoom");
        room.setActive(true);
        room.setPasswordHash(storedHash);
        when(roomRepository.findByName("SecRoom")).thenReturn(Optional.of(room));
        when(sessionRepository.countByRoomNameAndStatus("SecRoom", SessionStatus.ACTIVE))
                .thenReturn(3L);

        RoomJoinResult result = roomService.joinRoom("SecRoom", "wrongPass", "192.168.1.1");

        assertFalse(result.isSuccess());
        assertTrue(result.getMessage().contains("Incorrect password"));
    }

    // --- Requirement 2.2: Join room not found ---
    @Test
    void joinRoom_roomNotFound_fails() {
        when(roomRepository.findByName("NoRoom")).thenReturn(Optional.empty());

        RoomJoinResult result = roomService.joinRoom("NoRoom", null, "192.168.1.1");

        assertFalse(result.isSuccess());
        assertTrue(result.getMessage().contains("not found"));
    }

    // --- Requirement 1.1 (max 50 participants): Room full rejection ---
    @Test
    void joinRoom_roomFull_fails() {
        Room room = new Room();
        room.setName("FullRoom");
        room.setActive(true);
        when(roomRepository.findByName("FullRoom")).thenReturn(Optional.of(room));
        when(sessionRepository.countByRoomNameAndStatus("FullRoom", SessionStatus.ACTIVE))
                .thenReturn(50L);

        RoomJoinResult result = roomService.joinRoom("FullRoom", null, "192.168.1.1");

        assertFalse(result.isSuccess());
        assertTrue(result.getMessage().contains("full"));
    }

    // --- isRoomFull boundary check ---
    @Test
    void isRoomFull_atCapacity_returnsTrue() {
        when(sessionRepository.countByRoomNameAndStatus("Room", SessionStatus.ACTIVE))
                .thenReturn(50L);
        assertTrue(roomService.isRoomFull("Room"));

        when(sessionRepository.countByRoomNameAndStatus("Room2", SessionStatus.ACTIVE))
                .thenReturn(49L);
        assertFalse(roomService.isRoomFull("Room2"));
    }
}
