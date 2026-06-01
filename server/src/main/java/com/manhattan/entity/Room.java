package com.manhattan.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import org.springframework.data.mongodb.core.index.Indexed;
import java.time.LocalDateTime;

@Document(collection = "rooms")
public class Room {

    @Id
    private String id;

    @Indexed(unique = true)
    @Field("name")
    private String name;

    @Field("password_hash")
    private String passwordHash;

    @Field("creator_ip")
    private String creatorIp;

    @Field("created_at")
    private LocalDateTime createdAt;

    @Field("is_active")
    private boolean isActive;

    public Room() {
    }

    public Room(String id, String name, String passwordHash, String creatorIp, LocalDateTime createdAt, boolean isActive) {
        this.id = id;
        this.name = name;
        this.passwordHash = passwordHash;
        this.creatorIp = creatorIp;
        this.createdAt = createdAt;
        this.isActive = isActive;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getCreatorIp() {
        return creatorIp;
    }

    public void setCreatorIp(String creatorIp) {
        this.creatorIp = creatorIp;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public boolean isActive() {
        return isActive;
    }

    public void setActive(boolean active) {
        isActive = active;
    }
}
