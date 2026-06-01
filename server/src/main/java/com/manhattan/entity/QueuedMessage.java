package com.manhattan.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;
import java.time.LocalDateTime;

@Document(collection = "message_queue")
public class QueuedMessage {

    @Id
    private String id;

    @Field("target_ip")
    private String targetIp;

    @Field("room_name")
    private String roomName;

    @Field("sender_ip")
    private String senderIp;

    @Field("ciphertext")
    private byte[] ciphertext;

    @Field("iv")
    private byte[] iv;

    @Field("created_at")
    private LocalDateTime createdAt;

    public QueuedMessage() {
    }

    public QueuedMessage(String id, String targetIp, String roomName, String senderIp, byte[] ciphertext, byte[] iv,
                         LocalDateTime createdAt) {
        this.id = id;
        this.targetIp = targetIp;
        this.roomName = roomName;
        this.senderIp = senderIp;
        this.ciphertext = ciphertext;
        this.iv = iv;
        this.createdAt = createdAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTargetIp() {
        return targetIp;
    }

    public void setTargetIp(String targetIp) {
        this.targetIp = targetIp;
    }

    public String getRoomName() {
        return roomName;
    }

    public void setRoomName(String roomName) {
        this.roomName = roomName;
    }

    public String getSenderIp() {
        return senderIp;
    }

    public void setSenderIp(String senderIp) {
        this.senderIp = senderIp;
    }

    public byte[] getCiphertext() {
        return ciphertext;
    }

    public void setCiphertext(byte[] ciphertext) {
        this.ciphertext = ciphertext;
    }

    public byte[] getIv() {
        return iv;
    }

    public void setIv(byte[] iv) {
        this.iv = iv;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
