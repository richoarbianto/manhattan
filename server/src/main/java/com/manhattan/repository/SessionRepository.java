package com.manhattan.repository;

import com.manhattan.entity.Session;
import com.manhattan.entity.SessionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SessionRepository extends JpaRepository<Session, Long> {

    Optional<Session> findByIpAddressAndStatus(String ipAddress, SessionStatus status);

    List<Session> findByRoomNameAndStatus(String roomName, SessionStatus status);

    long countByRoomNameAndStatus(String roomName, SessionStatus status);
}
