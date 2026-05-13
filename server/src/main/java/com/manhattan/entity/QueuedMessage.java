package com.manhattan.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "message_queue")
public class QueuedMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "target_ip", nullable = false, length = 45)
    private String targetIp;

    @Column(name = "room_name", nullable = false, length = 15)
    private String roomName;

    @Column(name = "sender_ip", nullable = false, length = 45)
    private String senderIp;

    @Lob
    @Column(name = "ciphertext", nullable = false)
    private byte[] ciphertext;

    @Column(name = "iv", nullable = false, length = 16)
    private byte[] iv;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public QueuedMessage() {
    }

    public QueuedMessage(Long id, String targetIp, String roomName, String senderIp, byte[] ciphertext, byte[] iv,
                         LocalDateTime createdAt) {
        this.id = id;
        this.targetIp = targetIp;
        this.roomName = roomName;
        this.senderIp = senderIp;
        this.ciphertext = ciphertext;
        this.iv = iv;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
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
