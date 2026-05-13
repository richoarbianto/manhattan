package com.manhattan.exception;

/**
 * Exception thrown when a database write operation fails after all retry attempts
 * have been exhausted (3 attempts with 1-second delay between each).
 * 
 * This exception is thrown from @Recover methods in service classes and is
 * handled by the GlobalExceptionHandler to return an appropriate error response
 * to the client.
 * 
 * @see com.manhattan.exception.GlobalExceptionHandler
 */
public class DatabaseUnavailableException extends RuntimeException {

    public DatabaseUnavailableException(String message) {
        super(message);
    }

    public DatabaseUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
