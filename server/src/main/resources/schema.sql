-- Manhattan Database Schema
-- Tables: rooms, sessions, message_queue, rate_limits

CREATE TABLE IF NOT EXISTS rooms (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(15) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    creator_ip VARCHAR(45) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    INDEX idx_room_name (name)
);

CREATE TABLE IF NOT EXISTS sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    room_name VARCHAR(15) NOT NULL,
    stomp_session_id VARCHAR(64) NOT NULL,
    display_name VARCHAR(45) NOT NULL,
    connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disconnected_at TIMESTAMP NULL,
    last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    INDEX idx_ip_active (ip_address, status),
    INDEX idx_room_active (room_name, status),
    FOREIGN KEY (room_name) REFERENCES rooms(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_queue (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    target_ip VARCHAR(45) NOT NULL,
    room_name VARCHAR(15) NOT NULL,
    sender_ip VARCHAR(45) NOT NULL,
    ciphertext BLOB NOT NULL,
    iv VARBINARY(16) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_target_room (target_ip, room_name),
    FOREIGN KEY (room_name) REFERENCES rooms(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rate_limits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    client_ip VARCHAR(45) NOT NULL,
    room_name VARCHAR(15) NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP NULL,
    last_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ip_room (client_ip, room_name)
);
