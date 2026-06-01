package com.manhattan.repository;

import com.manhattan.entity.Session;
import com.manhattan.entity.SessionStatus;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SessionRepository extends MongoRepository<Session, String> {

    Optional<Session> findByIpAddressAndStatus(String ipAddress, SessionStatus status);

    List<Session> findByRoomNameAndStatus(String roomName, SessionStatus status);

    long countByRoomNameAndStatus(String roomName, SessionStatus status);
}
