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

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SessionServiceTest {

    @Mock
    private SessionRepository sessionRepository;

    private SessionService sessionService;

    @BeforeEach
    void setUp() {
        sessionService = new SessionService(sessionRepository);
    }

    // --- createSession tests ---

    @Test
    void createSession_success_newIp() {
        String ip = "192.168.1.1";
        String room = "testRoom";
        String stompId = "stomp-123";

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.empty());
        when(sessionRepository.save(any(Session.class)))
                .thenAnswer(invocation -> {
                    Session s = invocation.getArgument(0);
                    s.setId(1L);
                    return s;
                });

        Session result = sessionService.createSession(ip, room, stompId);

        assertNotNull(result);
        assertEquals(ip, result.getIpAddress());
        assertEquals(room, result.getRoomName());
        assertEquals(stompId, result.getStompSessionId());
        assertEquals("User_" + ip, result.getDisplayName());
        assertEquals(SessionStatus.ACTIVE, result.getStatus());
        assertNotNull(result.getConnectedAt());
        assertNotNull(result.getLastActivityAt());
        assertNull(result.getDisconnectedAt());

        verify(sessionRepository).save(any(Session.class));
    }

    @Test
    void createSession_throwsIllegalStateException_forDuplicateIp() {
        String ip = "192.168.1.1";
        Session existingSession = new Session();
        existingSession.setIpAddress(ip);
        existingSession.setStatus(SessionStatus.ACTIVE);

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(existingSession));

        IllegalStateException exception = assertThrows(IllegalStateException.class,
                () -> sessionService.createSession(ip, "room", "stomp-456"));

        assertEquals("Only one session per IP is allowed", exception.getMessage());
        verify(sessionRepository, never()).save(any(Session.class));
    }

    // --- markDisconnected tests ---

    @Test
    void markDisconnected_setsStatusToInactive_andRecordsTimestamp() {
        String ip = "10.0.0.1";
        Session activeSession = new Session();
        activeSession.setId(1L);
        activeSession.setIpAddress(ip);
        activeSession.setStatus(SessionStatus.ACTIVE);
        activeSession.setConnectedAt(LocalDateTime.now().minusMinutes(5));

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(activeSession));
        when(sessionRepository.save(any(Session.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        sessionService.markDisconnected(ip);

        ArgumentCaptor<Session> captor = ArgumentCaptor.forClass(Session.class);
        verify(sessionRepository).save(captor.capture());

        Session saved = captor.getValue();
        assertEquals(SessionStatus.INACTIVE, saved.getStatus());
        assertNotNull(saved.getDisconnectedAt());
    }

    @Test
    void markDisconnected_doesNothing_whenNoActiveSession() {
        String ip = "10.0.0.2";

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.empty());

        sessionService.markDisconnected(ip);

        verify(sessionRepository, never()).save(any(Session.class));
    }

    // --- hasActiveSession tests ---

    @Test
    void hasActiveSession_returnsTrue_whenActiveSessionExists() {
        String ip = "172.16.0.1";
        Session activeSession = new Session();
        activeSession.setIpAddress(ip);
        activeSession.setStatus(SessionStatus.ACTIVE);

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(activeSession));

        assertTrue(sessionService.hasActiveSession(ip));
    }

    @Test
    void hasActiveSession_returnsFalse_whenNoActiveSession() {
        String ip = "172.16.0.2";

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.empty());

        assertFalse(sessionService.hasActiveSession(ip));
    }

    // --- releaseIp tests ---

    @Test
    void releaseIp_marksSessionInactive_andAllowsNewConnection() {
        String ip = "192.168.0.50";
        Session activeSession = new Session();
        activeSession.setId(1L);
        activeSession.setIpAddress(ip);
        activeSession.setStatus(SessionStatus.ACTIVE);

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(activeSession))
                .thenReturn(Optional.empty()); // after release

        when(sessionRepository.save(any(Session.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        sessionService.releaseIp(ip);

        ArgumentCaptor<Session> captor = ArgumentCaptor.forClass(Session.class);
        verify(sessionRepository).save(captor.capture());

        Session saved = captor.getValue();
        assertEquals(SessionStatus.INACTIVE, saved.getStatus());
        assertNotNull(saved.getDisconnectedAt());
    }

    @Test
    void releaseIp_doesNothing_whenNoActiveSession() {
        String ip = "192.168.0.51";

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.empty());

        sessionService.releaseIp(ip);

        verify(sessionRepository, never()).save(any(Session.class));
    }

    // --- updateLastActivity tests ---

    @Test
    void updateLastActivity_updatesTimestamp() {
        String ip = "10.10.10.1";
        LocalDateTime oldTime = LocalDateTime.now().minusMinutes(10);
        Session activeSession = new Session();
        activeSession.setId(1L);
        activeSession.setIpAddress(ip);
        activeSession.setStatus(SessionStatus.ACTIVE);
        activeSession.setLastActivityAt(oldTime);

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(activeSession));
        when(sessionRepository.save(any(Session.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        sessionService.updateLastActivity(ip);

        ArgumentCaptor<Session> captor = ArgumentCaptor.forClass(Session.class);
        verify(sessionRepository).save(captor.capture());

        Session saved = captor.getValue();
        assertTrue(saved.getLastActivityAt().isAfter(oldTime));
    }

    @Test
    void updateLastActivity_doesNothing_whenNoActiveSession() {
        String ip = "10.10.10.2";

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.empty());

        sessionService.updateLastActivity(ip);

        verify(sessionRepository, never()).save(any(Session.class));
    }

    // --- getActiveSession tests ---

    @Test
    void getActiveSession_returnsSession_whenExists() {
        String ip = "203.0.113.1";
        Session activeSession = new Session();
        activeSession.setId(1L);
        activeSession.setIpAddress(ip);
        activeSession.setRoomName("room1");
        activeSession.setStatus(SessionStatus.ACTIVE);

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(activeSession));

        Optional<Session> result = sessionService.getActiveSession(ip);

        assertTrue(result.isPresent());
        assertEquals(ip, result.get().getIpAddress());
        assertEquals("room1", result.get().getRoomName());
    }

    @Test
    void getActiveSession_returnsEmpty_whenNoActiveSession() {
        String ip = "203.0.113.2";

        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.empty());

        Optional<Session> result = sessionService.getActiveSession(ip);

        assertTrue(result.isEmpty());
    }

    // --- Fresh session on reconnect (no carried-over state) ---

    @Test
    void freshSessionOnReconnect_newSessionHasNoCarriedOverState() {
        String ip = "192.168.1.100";

        // First session exists and gets disconnected
        Session oldSession = new Session();
        oldSession.setId(1L);
        oldSession.setIpAddress(ip);
        oldSession.setRoomName("oldRoom");
        oldSession.setStompSessionId("old-stomp-id");
        oldSession.setDisplayName("User_" + ip);
        oldSession.setConnectedAt(LocalDateTime.now().minusHours(1));
        oldSession.setLastActivityAt(LocalDateTime.now().minusMinutes(30));
        oldSession.setStatus(SessionStatus.ACTIVE);

        // Mark disconnected
        when(sessionRepository.findByIpAddressAndStatus(ip, SessionStatus.ACTIVE))
                .thenReturn(Optional.of(oldSession))  // for markDisconnected
                .thenReturn(Optional.empty());         // for createSession's hasActiveSession check
        when(sessionRepository.save(any(Session.class)))
                .thenAnswer(invocation -> {
                    Session s = invocation.getArgument(0);
                    if (s.getId() == null) s.setId(2L);
                    return s;
                });

        sessionService.markDisconnected(ip);

        // Now create a new session (reconnect)
        Session newSession = sessionService.createSession(ip, "newRoom", "new-stomp-id");

        // Verify the new session is completely fresh
        assertNotEquals(oldSession.getRoomName(), newSession.getRoomName());
        assertNotEquals(oldSession.getStompSessionId(), newSession.getStompSessionId());
        assertEquals("newRoom", newSession.getRoomName());
        assertEquals("new-stomp-id", newSession.getStompSessionId());
        assertEquals(SessionStatus.ACTIVE, newSession.getStatus());
        assertNull(newSession.getDisconnectedAt());
        // The new session's connectedAt should be recent, not carried over
        assertTrue(newSession.getConnectedAt().isAfter(oldSession.getConnectedAt()));
    }
}
