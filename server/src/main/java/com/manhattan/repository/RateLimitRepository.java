package com.manhattan.repository;

import com.manhattan.entity.RateLimit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RateLimitRepository extends JpaRepository<RateLimit, Long> {

    Optional<RateLimit> findByClientIpAndRoomName(String clientIp, String roomName);
}
