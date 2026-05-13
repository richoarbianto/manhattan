package com.manhattan.dto;

public class RoomInfo {

    private final String name;
    private final boolean hasPassword;
    private final int participantCount;
    private final boolean isActive;

    public RoomInfo(String name, boolean hasPassword, int participantCount, boolean isActive) {
        this.name = name;
        this.hasPassword = hasPassword;
        this.participantCount = participantCount;
        this.isActive = isActive;
    }

    public String getName() {
        return name;
    }

    public boolean isHasPassword() {
        return hasPassword;
    }

    public int getParticipantCount() {
        return participantCount;
    }

    public boolean isActive() {
        return isActive;
    }
}
