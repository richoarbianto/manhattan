package com.manhattan.dto;

public class RoomJoinResult {

    private final boolean success;
    private final String message;
    private final int participantCount;

    public RoomJoinResult(boolean success, String message, int participantCount) {
        this.success = success;
        this.message = message;
        this.participantCount = participantCount;
    }

    public static RoomJoinResult success(int participantCount) {
        return new RoomJoinResult(true, "Joined room successfully", participantCount);
    }

    public static RoomJoinResult failure(String message) {
        return new RoomJoinResult(false, message, 0);
    }

    public boolean isSuccess() {
        return success;
    }

    public String getMessage() {
        return message;
    }

    public int getParticipantCount() {
        return participantCount;
    }
}
