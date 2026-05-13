package com.manhattan.dto;

public class ParticipantInfo {

    private final String ip;
    private final String displayName;

    public ParticipantInfo(String ip, String displayName) {
        this.ip = ip;
        this.displayName = displayName;
    }

    public String getIp() {
        return ip;
    }

    public String getDisplayName() {
        return displayName;
    }
}
