package com.manhattan.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import java.time.LocalDateTime;

@Document(collection = "sessions")
public class Session {

    @Id
    private String id;

    @Field("ip_address")
    private String ipAddress;

    @Field("room_name")
    private String roomName;

    @Field("stomp_session_id")
    private String stompSessionId;

    @Field("display_name")
    private String displayName;

    @Field("connected_at")
    private LocalDateTime connectedAt;

    @Field("disconnected_at")
    private LocalDateTime disconnectedAt;

    @Field("last_activity_at")
    private LocalDateTime lastActivityAt;

    @Field("status")
    private SessionStatus status;

    public Session() {
    }

    public Session(String id, String ipAddress, String roomName, String stompSessionId, String displayName,
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

    public String getId() {
        return id;
    }

    public void setId(String id) {
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
