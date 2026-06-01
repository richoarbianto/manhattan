package com.manhattan.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import java.time.LocalDateTime;

@Document(collection = "rate_limits")
public class RateLimit {

    @Id
    private String id;

    @Field("client_ip")
    private String clientIp;

    @Field("room_name")
    private String roomName;

    @Field("failed_attempts")
    private int failedAttempts;

    @Field("locked_until")
    private LocalDateTime lockedUntil;

    @Field("last_attempt_at")
    private LocalDateTime lastAttemptAt;

    public RateLimit() {
    }

    public RateLimit(String id, String clientIp, String roomName, int failedAttempts, LocalDateTime lockedUntil,
                     LocalDateTime lastAttemptAt) {
        this.id = id;
        this.clientIp = clientIp;
        this.roomName = roomName;
        this.failedAttempts = failedAttempts;
        this.lockedUntil = lockedUntil;
        this.lastAttemptAt = lastAttemptAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getClientIp() {
        return clientIp;
    }

    public void setClientIp(String clientIp) {
        this.clientIp = clientIp;
    }

    public String getRoomName() {
        return roomName;
    }

    public void setRoomName(String roomName) {
        this.roomName = roomName;
    }

    public int getFailedAttempts() {
        return failedAttempts;
    }

    public void setFailedAttempts(int failedAttempts) {
        this.failedAttempts = failedAttempts;
    }

    public LocalDateTime getLockedUntil() {
        return lockedUntil;
    }

    public void setLockedUntil(LocalDateTime lockedUntil) {
        this.lockedUntil = lockedUntil;
    }

    public LocalDateTime getLastAttemptAt() {
        return lastAttemptAt;
    }

    public void setLastAttemptAt(LocalDateTime lastAttemptAt) {
        this.lastAttemptAt = lastAttemptAt;
    }
}
