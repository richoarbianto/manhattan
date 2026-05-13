package com.manhattan.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Global exception handler that catches exceptions thrown by controllers
 * and returns appropriate HTTP error responses to clients.
 * 
 * Handles DatabaseUnavailableException (thrown after all retries are exhausted)
 * by returning a 503 Service Unavailable response.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Handles DatabaseUnavailableException when all database retry attempts fail.
     * Returns HTTP 503 Service Unavailable with error details.
     */
    @ExceptionHandler(DatabaseUnavailableException.class)
    public ResponseEntity<Map<String, Object>> handleDatabaseUnavailable(DatabaseUnavailableException ex) {
        Map<String, Object> errorBody = Map.of(
                "code", "SERVICE_UNAVAILABLE",
                "message", ex.getMessage(),
                "timestamp", LocalDateTime.now().toString()
        );
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(errorBody);
    }

    /**
     * Handles generic IllegalStateException (e.g., duplicate IP session).
     * Returns HTTP 409 Conflict.
     */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalState(IllegalStateException ex) {
        Map<String, Object> errorBody = Map.of(
                "code", "CONFLICT",
                "message", ex.getMessage(),
                "timestamp", LocalDateTime.now().toString()
        );
        return ResponseEntity.status(HttpStatus.CONFLICT).body(errorBody);
    }
}
