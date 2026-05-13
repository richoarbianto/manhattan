package com.manhattan.service;

import com.manhattan.dto.ParticipantInfo;
import com.manhattan.dto.RoomCreationResult;
import com.manhattan.dto.RoomInfo;
import com.manhattan.dto.RoomJoinResult;
import com.manhattan.entity.Room;
import com.manhattan.entity.Session;
import com.manhattan.entity.SessionStatus;
import com.manhattan.repository.RoomRepository;
import com.manhattan.repository.SessionRepository;
import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
public class RoomService {

    private static final int MAX_PARTICIPANTS = 50;
    private static final Pattern ROOM_NAME_PATTERN = Pattern.compile("^[a-zA-Z0-9]{3,15}$");

    private final RoomRepository roomRepository;
    private final SessionRepository sessionRepository;

    public RoomService(RoomRepository roomRepository, SessionRepository sessionRepository) {
        this.roomRepository = roomRepository;
        this.sessionRepository = sessionRepository;
    }

    /**
     * Validates a room name against the naming rules:
     * - Alphanumeric only (case-sensitive)
     * - No spaces
     * - Between 3 and 15 characters
     */
    public boolean validateRoomName(String roomName) {
        if (roomName == null) {
            return false;
        }
        return ROOM_NAME_PATTERN.matcher(roomName).matches();
    }

    /**
     * Creates a new room with the given name and optional password hash.
     * The password hash is received already hashed (Argon2id PHC format) from the client.
     */
    public RoomCreationResult createRoom(String roomName, String passwordHash, String creatorIp) {
        if (!validateRoomName(roomName)) {
            return RoomCreationResult.failure("Invalid room name. Must be alphanumeric, 3-15 characters, no spaces.");
        }

        if (roomRepository.existsByName(roomName)) {
            return RoomCreationResult.failure("Room name is already taken.");
        }

        Room room = new Room();
        room.setName(roomName);
        room.setPasswordHash(passwordHash);
        room.setCreatorIp(creatorIp);
        room.setCreatedAt(LocalDateTime.now());
        room.setActive(true);

        roomRepository.save(room);

        return RoomCreationResult.success(roomName);
    }

    /**
     * Joins an existing room. For password-protected rooms, the client sends the plaintext
     * password and the server verifies it against the stored Argon2id hash using Bouncy Castle.
     *
     * @param roomName the room to join
     * @param password the plaintext password (null for rooms without password)
     * @param clientIp the IP address of the joining client
     */
    public RoomJoinResult joinRoom(String roomName, String password, String clientIp) {
        Optional<Room> roomOpt = roomRepository.findByName(roomName);

        if (roomOpt.isEmpty()) {
            return RoomJoinResult.failure("Room not found.");
        }

        Room room = roomOpt.get();

        if (!room.isActive()) {
            return RoomJoinResult.failure("Room is no longer available.");
        }

        if (isRoomFull(roomName)) {
            return RoomJoinResult.failure("Room is full. Maximum 50 participants allowed.");
        }

        // Password verification for protected rooms
        if (room.getPasswordHash() != null && !room.getPasswordHash().isEmpty()) {
            if (password == null || password.isEmpty()) {
                return RoomJoinResult.failure("Password is required for this room.");
            }

            if (!verifyArgon2Password(password, room.getPasswordHash())) {
                return RoomJoinResult.failure("Incorrect password.");
            }
        }

        int participantCount = (int) sessionRepository.countByRoomNameAndStatus(roomName, SessionStatus.ACTIVE);
        return RoomJoinResult.success(participantCount + 1);
    }

    /**
     * Removes a client from a room by marking their session as inactive.
     */
    public void leaveRoom(String roomName, String clientIp) {
        List<Session> sessions = sessionRepository.findByRoomNameAndStatus(roomName, SessionStatus.ACTIVE);
        for (Session session : sessions) {
            if (session.getIpAddress().equals(clientIp)) {
                session.setStatus(SessionStatus.INACTIVE);
                session.setDisconnectedAt(LocalDateTime.now());
                sessionRepository.save(session);
                break;
            }
        }
    }

    /**
     * Gets information about a room.
     */
    public RoomInfo getRoomInfo(String roomName) {
        Optional<Room> roomOpt = roomRepository.findByName(roomName);

        if (roomOpt.isEmpty()) {
            return null;
        }

        Room room = roomOpt.get();
        int participantCount = (int) sessionRepository.countByRoomNameAndStatus(roomName, SessionStatus.ACTIVE);

        return new RoomInfo(
                room.getName(),
                room.getPasswordHash() != null && !room.getPasswordHash().isEmpty(),
                participantCount,
                room.isActive()
        );
    }

    /**
     * Gets the list of active participants in a room.
     */
    public List<ParticipantInfo> getParticipants(String roomName) {
        List<Session> activeSessions = sessionRepository.findByRoomNameAndStatus(roomName, SessionStatus.ACTIVE);
        return activeSessions.stream()
                .map(session -> new ParticipantInfo(session.getIpAddress(), session.getDisplayName()))
                .toList();
    }

    /**
     * Checks if a room has reached the maximum participant limit (50).
     */
    public boolean isRoomFull(String roomName) {
        long count = sessionRepository.countByRoomNameAndStatus(roomName, SessionStatus.ACTIVE);
        return count >= MAX_PARTICIPANTS;
    }

    /**
     * Verifies a plaintext password against a stored Argon2id hash in PHC format.
     * The PHC format is: $argon2id$v=19$m=65536,t=3,p=4$<salt_base64>$<hash_base64>
     */
    boolean verifyArgon2Password(String password, String storedHash) {
        try {
            // Parse the PHC format string
            // Format: $argon2id$v=<version>$m=<memory>,t=<iterations>,p=<parallelism>$<salt_b64>$<hash_b64>
            String[] parts = storedHash.split("\\$");
            if (parts.length != 6) {
                return false;
            }

            // parts[0] = "" (empty before first $)
            // parts[1] = "argon2id"
            // parts[2] = "v=19"
            // parts[3] = "m=65536,t=3,p=4"
            // parts[4] = salt (base64 no padding)
            // parts[5] = hash (base64 no padding)

            if (!"argon2id".equals(parts[1])) {
                return false;
            }

            // Parse parameters
            String[] params = parts[3].split(",");
            int memory = 0;
            int iterations = 0;
            int parallelism = 0;

            for (String param : params) {
                if (param.startsWith("m=")) {
                    memory = Integer.parseInt(param.substring(2));
                } else if (param.startsWith("t=")) {
                    iterations = Integer.parseInt(param.substring(2));
                } else if (param.startsWith("p=")) {
                    parallelism = Integer.parseInt(param.substring(2));
                }
            }

            // Decode salt (base64 without padding)
            byte[] salt = Base64.getDecoder().decode(padBase64(parts[4]));

            // Decode expected hash
            byte[] expectedHash = Base64.getDecoder().decode(padBase64(parts[5]));

            // Re-hash the password with the same parameters and salt
            Argon2Parameters.Builder builder = new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
                    .withVersion(Argon2Parameters.ARGON2_VERSION_13)
                    .withMemoryAsKB(memory)
                    .withIterations(iterations)
                    .withParallelism(parallelism)
                    .withSalt(salt);

            Argon2BytesGenerator generator = new Argon2BytesGenerator();
            generator.init(builder.build());

            byte[] result = new byte[expectedHash.length];
            generator.generateBytes(password.toCharArray(), result);

            // Constant-time comparison to prevent timing attacks
            return constantTimeEquals(result, expectedHash);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Pads a base64 string without padding to standard base64 with padding.
     */
    private String padBase64(String base64NoPadding) {
        int remainder = base64NoPadding.length() % 4;
        if (remainder == 0) {
            return base64NoPadding;
        }
        return base64NoPadding + "=".repeat(4 - remainder);
    }

    /**
     * Constant-time byte array comparison to prevent timing attacks.
     */
    private boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a.length != b.length) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        return result == 0;
    }
}
