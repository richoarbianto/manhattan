package com.manhattan.service;

import com.manhattan.entity.RateLimit;
import com.manhattan.repository.RateLimitRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

@Service
public class RateLimitService {

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final long LOCKOUT_DURATION_SECONDS = 60;

    private final RateLimitRepository rateLimitRepository;

    public RateLimitService(RateLimitRepository rateLimitRepository) {
        this.rateLimitRepository = rateLimitRepository;
    }

    public boolean isLocked(String clientIp, String roomName) {
        return rateLimitRepository.findByClientIpAndRoomName(clientIp, roomName)
                .map(rateLimit -> rateLimit.getLockedUntil() != null
                        && LocalDateTime.now().isBefore(rateLimit.getLockedUntil()))
                .orElse(false);
    }

    public void recordFailedAttempt(String clientIp, String roomName) {
        RateLimit rateLimit = rateLimitRepository.findByClientIpAndRoomName(clientIp, roomName)
                .orElseGet(() -> {
                    RateLimit newRateLimit = new RateLimit();
                    newRateLimit.setClientIp(clientIp);
                    newRateLimit.setRoomName(roomName);
                    newRateLimit.setFailedAttempts(0);
                    newRateLimit.setLastAttemptAt(LocalDateTime.now());
                    return newRateLimit;
                });

        rateLimit.setFailedAttempts(rateLimit.getFailedAttempts() + 1);
        rateLimit.setLastAttemptAt(LocalDateTime.now());

        if (rateLimit.getFailedAttempts() >= MAX_FAILED_ATTEMPTS) {
            rateLimit.setLockedUntil(LocalDateTime.now().plusSeconds(LOCKOUT_DURATION_SECONDS));
        }

        rateLimitRepository.save(rateLimit);
    }

    public void resetAttempts(String clientIp, String roomName) {
        rateLimitRepository.findByClientIpAndRoomName(clientIp, roomName)
                .ifPresent(rateLimit -> {
                    rateLimit.setFailedAttempts(0);
                    rateLimit.setLockedUntil(null);
                    rateLimitRepository.save(rateLimit);
                });
    }

    public long getRemainingLockoutSeconds(String clientIp, String roomName) {
        return rateLimitRepository.findByClientIpAndRoomName(clientIp, roomName)
                .map(rateLimit -> {
                    if (rateLimit.getLockedUntil() == null) {
                        return 0L;
                    }
                    long remaining = ChronoUnit.SECONDS.between(LocalDateTime.now(), rateLimit.getLockedUntil());
                    return Math.max(0L, remaining);
                })
                .orElse(0L);
    }
}
