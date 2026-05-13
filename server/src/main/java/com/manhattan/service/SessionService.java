package com.manhattan.service;

import com.manhattan.entity.Session;
import com.manhattan.entity.SessionStatus;
import com.manhattan.repository.SessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class SessionService {

    private final SessionRepository sessionRepository;

    public SessionService(SessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    /**
     * Creates a new session for the given IP address.
     * Enforces one-session-per-IP constraint: rejects if an active session already exists.
     *
     * @throws IllegalStateException if the IP already has an active session
     */
    @Transactional
    public Session createSession(String ipAddress, String roomName, String stompSessionId) {
        return createSession(ipAddress, roomName, stompSessionId, null);
    }

    @Transactional
    public Session createSession(String ipAddress, String roomName, String stompSessionId, String displayName) {
        if (hasActiveSession(ipAddress)) {
            throw new IllegalStateException("Only one session per IP is allowed");
        }

        LocalDateTime now = LocalDateTime.now();
        Session session = new Session();
        session.setIpAddress(ipAddress);
        session.setRoomName(roomName);
        session.setStompSessionId(stompSessionId);
        session.setDisplayName(displayName != null && !displayName.isBlank() ? displayName : "User_" + ipAddress);
        session.setConnectedAt(now);
        session.setLastActivityAt(now);
        session.setStatus(SessionStatus.ACTIVE);

        return sessionRepository.save(session);
    }

    /**
     * Marks the active session for the given IP as disconnected.
     * Records the disconnection timestamp and sets status to INACTIVE.
     */
    @Transactional
    public void markDisconnected(String ipAddress) {
        Optional<Session> activeSession = sessionRepository.findByIpAddressAndStatus(ipAddress, SessionStatus.ACTIVE);
        activeSession.ifPresent(session -> {
            session.setStatus(SessionStatus.INACTIVE);
            session.setDisconnectedAt(LocalDateTime.now());
            sessionRepository.save(session);
        });
    }

    /**
     * Checks whether the given IP address has an active session.
     */
    public boolean hasActiveSession(String ipAddress) {
        return sessionRepository.findByIpAddressAndStatus(ipAddress, SessionStatus.ACTIVE).isPresent();
    }

    /**
     * Releases the IP address association by marking any active session as INACTIVE.
     * This allows a new connection from the same IP address.
     * Should be called on disconnect to release the IP within 2 seconds.
     */
    @Transactional
    public void releaseIp(String ipAddress) {
        Optional<Session> activeSession = sessionRepository.findByIpAddressAndStatus(ipAddress, SessionStatus.ACTIVE);
        activeSession.ifPresent(session -> {
            session.setStatus(SessionStatus.INACTIVE);
            session.setDisconnectedAt(LocalDateTime.now());
            sessionRepository.save(session);
        });
    }

    /**
     * Updates the last activity timestamp for the active session of the given IP.
     */
    @Transactional
    public void updateLastActivity(String ipAddress) {
        Optional<Session> activeSession = sessionRepository.findByIpAddressAndStatus(ipAddress, SessionStatus.ACTIVE);
        activeSession.ifPresent(session -> {
            session.setLastActivityAt(LocalDateTime.now());
            sessionRepository.save(session);
        });
    }

    /**
     * Retrieves the active session for the given IP address, if one exists.
     */
    public Optional<Session> getActiveSession(String ipAddress) {
        return sessionRepository.findByIpAddressAndStatus(ipAddress, SessionStatus.ACTIVE);
    }
}
