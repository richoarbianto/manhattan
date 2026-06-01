package com.manhattan.repository;

import com.manhattan.entity.RateLimit;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RateLimitRepository extends MongoRepository<RateLimit, String> {

    Optional<RateLimit> findByClientIpAndRoomName(String clientIp, String roomName);
}
