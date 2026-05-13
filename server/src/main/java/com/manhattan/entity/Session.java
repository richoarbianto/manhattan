package com.manhattan.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "sessions")
public class Session {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ip_address", nullable = false, length = 45)
    private String ipAddress;

    @Column(name = "room_name", nullable = false, length = 15)
    private String roomName;

    @Column(name = "stomp_session_id", nullable = false, length = 64)
    private String stompSessionId;

    @Column(name = "display_name", nullable = false, length = 45)
    private String displayName;

    @Column(name = "connected_at", nullable = false)
    private LocalDateTime connectedAt;

    @Column(name = "disconnected_at")
    private LocalDateTime disconnectedAt;

    @Column(name = "last_activity_at", nullable = false)
    private LocalDateTime lastActivityAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private SessionStatus status;

    public Session() {
    }

    public Session(Long id, String ipAddress, String roomName, String stompSessionId, String displayName,
                   LocalDateTime connectedAt, LocalDateTime disconnectedAt, LocalDateTime lastActivityAt,
                   SessionStatus status) {
        this.id = id;
        this.ipAddress = ipAddress;
        this.roomName = roomName;
        this.stompSessionId = stompSessionId;
        this.displayName = displayName;
        this.connectedAt = connectedAt;
        this.disconnectedAt = disconnectedAt;
        this.lastActivityAt = lastActivityAt;
        this.status = status;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public String getRoomName() {
        return roomName;
    }

    public void setRoomName(String roomName) {
        this.roomName = roomName;
    }

    public String getStompSessionId() {
        return stompSessionId;
    }

    public void setStompSessionId(String stompSessionId) {
        this.stompSessionId = stompSessionId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public LocalDateTime getConnectedAt() {
        return connectedAt;
    }

    public void setConnectedAt(LocalDateTime connectedAt) {
        this.connectedAt = connectedAt;
    }

    public LocalDateTime getDisconnectedAt() {
        return disconnectedAt;
    }

    public void setDisconnectedAt(LocalDateTime disconnectedAt) {
        this.disconnectedAt = disconnectedAt;
    }

    public LocalDateTime getLastActivityAt() {
        return lastActivityAt;
    }

    public void setLastActivityAt(LocalDateTime lastActivityAt) {
        this.lastActivityAt = lastActivityAt;
    }

    public SessionStatus getStatus() {
        return status;
    }

    public void setStatus(SessionStatus status) {
        this.status = status;
    }
}
