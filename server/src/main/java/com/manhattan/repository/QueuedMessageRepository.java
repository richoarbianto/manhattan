package com.manhattan.repository;

import com.manhattan.entity.QueuedMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface QueuedMessageRepository extends JpaRepository<QueuedMessage, Long> {

    List<QueuedMessage> findByTargetIpAndRoomName(String targetIp, String roomName);

    long countByTargetIpAndRoomName(String targetIp, String roomName);

    @Modifying
    @Transactional
    @Query("DELETE FROM QueuedMessage q WHERE q.id = " +
           "(SELECT q2.id FROM QueuedMessage q2 WHERE q2.targetIp = :targetIp AND q2.roomName = :roomName ORDER BY q2.createdAt ASC LIMIT 1)")
    void deleteOldest(@Param("targetIp") String targetIp, @Param("roomName") String roomName);

    @Modifying
    @Transactional
    void deleteByTargetIpAndRoomName(String targetIp, String roomName);

    List<QueuedMessage> findByTargetIpAndRoomNameOrderByCreatedAtAsc(String targetIp, String roomName);
}
