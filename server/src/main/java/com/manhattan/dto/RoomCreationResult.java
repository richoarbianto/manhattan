package com.manhattan.dto;

public class RoomCreationResult {

    private final boolean success;
    private final String message;
    private final String roomName;

    public RoomCreationResult(boolean success, String message, String roomName) {
        this.success = success;
        this.message = message;
        this.roomName = roomName;
    }

    public static RoomCreationResult success(String roomName) {
        return new RoomCreationResult(true, "Room created successfully", roomName);
    }

    public static RoomCreationResult failure(String message) {
        return new RoomCreationResult(false, message, null);
    }

    public boolean isSuccess() {
        return success;
    }

    public String getMessage() {
        return message;
    }

    public String getRoomName() {
        return roomName;
    }
}
