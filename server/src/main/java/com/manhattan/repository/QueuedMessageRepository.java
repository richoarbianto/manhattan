package com.manhattan.repository;

import com.manhattan.entity.QueuedMessage;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface QueuedMessageRepository extends MongoRepository<QueuedMessage, String> {

    List<QueuedMessage> findByTargetIpAndRoomName(String targetIp, String roomName);

    long countByTargetIpAndRoomName(String targetIp, String roomName);

    void deleteByTargetIpAndRoomName(String targetIp, String roomName);

    List<QueuedMessage> findByTargetIpAndRoomNameOrderByCreatedAtAsc(String targetIp, String roomName);

    default void deleteOldest(String targetIp, String roomName) {
        List<QueuedMessage> messages = findByTargetIpAndRoomName(targetIp, roomName);
        if (!messages.isEmpty()) {
            messages.sort((a, b) -> a.getCreatedAt().compareTo(b.getCreatedAt()));
            deleteById(messages.get(0).getId());
        }
    }
}
