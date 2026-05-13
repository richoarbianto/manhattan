package com.manhattan.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.retry.annotation.EnableRetry;

/**
 * Spring Retry configuration for database operations.
 * 
 * The @EnableRetry annotation is already present on ManhattanApplication,
 * so this class serves as a centralized documentation point for retry behavior.
 * 
 * Retry policy for database write operations:
 * - maxAttempts: 3 (initial attempt + 2 retries)
 * - backoff delay: 1000ms (1 second between attempts)
 * - retryFor: DataAccessException and its subclasses
 * 
 * Usage on service methods:
 * <pre>
 * {@code
 * @Retryable(
 *     retryFor = DataAccessException.class,
 *     maxAttempts = 3,
 *     backoff = @Backoff(delay = 1000)
 * )
 * public void someDbWriteOperation() { ... }
 * 
 * @Recover
 * public void someDbWriteOperationRecover(DataAccessException e) {
 *     throw new DatabaseUnavailableException("Database unavailable after retries", e);
 * }
 * }
 * </pre>
 */
@Configuration
public class RetryConfig {
    // @EnableRetry is on ManhattanApplication.
    // This configuration class exists for organizational clarity and
    // can be extended with custom RetryTemplate beans if needed.
}
