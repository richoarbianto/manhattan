package com.manhattan.service;

import com.manhattan.entity.QueuedMessage;
import com.manhattan.repository.QueuedMessageRepository;
import com.manhattan.repository.SessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for MessageRelayService.
 * Validates: Requirements 6.5, 6.6, 6.7
 */
@ExtendWith(MockitoExtension.class)
class MessageRelayServiceTest {

    @Mock
    private QueuedMessageRepository queuedMessageRepository;

    @Mock
    private SessionRepository sessionRepository;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    private MessageRelayService messageRelayService;

    @BeforeEach
    void setUp() {
        messageRelayService = new MessageRelayService(queuedMessageRepository, sessionRepository, messagingTemplate);
    }

    @Test
    void relayToRoom_sendsMessageToCorrectTopicDestination() {
        messageRelayService.relayToRoom("chatRoom", "192.168.1.10", "ZW5jcnlwdGVk", "aXZCYXNlNjQ=", 1700000000000L);

        verify(messagingTemplate).convertAndSend(eq("/topic/room/chatRoom"), any(Map.class));
    }

    @SuppressWarnings("unchecked")
    @Test
    void relayToRoom_payloadContainsCorrectFields() {
        messageRelayService.relayToRoom("testRoom", "10.0.0.1", "Y2lwaGVydGV4dA==", "aXZEYXRh", 1700000000000L);

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/room/testRoom"), payloadCaptor.capture());

        Map<String, Object> payload = payloadCaptor.getValue();
        assertEquals("MESSAGE", payload.get("type"));
        assertEquals("10.0.0.1", payload.get("senderIp"));
        assertEquals("Y2lwaGVydGV4dA==", payload.get("ciphertext"));
        assertEquals("aXZEYXRh", payload.get("iv"));
        assertEquals(1700000000000L, payload.get("timestamp"));
    }

    @Test
    void queueForOfflineClient_savesMessageWhenUnderLimit() {
        when(queuedMessageRepository.countByTargetIpAndRoomName("192.168.1.20", "room1")).thenReturn(10L);

        messageRelayService.queueForOfflineClient("192.168.1.20", "room1", "192.168.1.10",
                "encrypted".getBytes(), "ivdata1234567890".getBytes());

        verify(queuedMessageRepository, never()).deleteOldest(anyString(), anyString());
        ArgumentCaptor<QueuedMessage> captor = ArgumentCaptor.forClass(QueuedMessage.class);
        verify(queuedMessageRepository).save(captor.capture());

        QueuedMessage saved = captor.getValue();
        assertEquals("192.168.1.20", saved.getTargetIp());
        assertEquals("room1", saved.getRoomName());
        assertEquals("192.168.1.10", saved.getSenderIp());
        assertNotNull(saved.getCreatedAt());
    }

    @Test
    void queueForOfflineClient_deletesOldestWhenAt500Limit() {
        when(queuedMessageRepository.countByTargetIpAndRoomName("192.168.1.20", "room1")).thenReturn(500L);

        messageRelayService.queueForOfflineClient("192.168.1.20", "room1", "192.168.1.10",
                "newMsg".getBytes(), "ivdata1234567890".getBytes());

        verify(queuedMessageRepository).deleteOldest("192.168.1.20", "room1");
        verify(queuedMessageRepository).save(any(QueuedMessage.class));
    }

    @Test
    void getQueuedMessages_returnsMessagesOrderedByCreatedAt() {
        QueuedMessage msg1 = new QueuedMessage(1L, "192.168.1.20", "room1", "192.168.1.10",
                "msg1".getBytes(), "iv1".getBytes(), LocalDateTime.now().minusMinutes(5));
        QueuedMessage msg2 = new QueuedMessage(2L, "192.168.1.20", "room1", "192.168.1.11",
                "msg2".getBytes(), "iv2".getBytes(), LocalDateTime.now().minusMinutes(2));

        when(queuedMessageRepository.findByTargetIpAndRoomNameOrderByCreatedAtAsc("192.168.1.20", "room1"))
                .thenReturn(List.of(msg1, msg2));

        List<QueuedMessage> result = messageRelayService.getQueuedMessages("192.168.1.20", "room1");

        assertEquals(2, result.size());
        assertEquals(msg1, result.get(0));
        assertEquals(msg2, result.get(1));
    }

    @Test
    void clearQueue_deletesAllMessagesForClientAndRoom() {
        messageRelayService.clearQueue("192.168.1.20", "room1");

        verify(queuedMessageRepository).deleteByTargetIpAndRoomName("192.168.1.20", "room1");
        verifyNoMoreInteractions(queuedMessageRepository);
    }
}
