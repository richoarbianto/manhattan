package com.manhattan.config;

import com.manhattan.interceptor.IpGuardInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * WebSocket/STOMP message broker configuration for Manhattan.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final IpGuardInterceptor ipGuardInterceptor;

    public WebSocketConfig(IpGuardInterceptor ipGuardInterceptor) {
        this.ipGuardInterceptor = ipGuardInterceptor;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        ThreadPoolTaskScheduler taskScheduler = new ThreadPoolTaskScheduler();
        taskScheduler.setPoolSize(1);
        taskScheduler.setThreadNamePrefix("ws-heartbeat-");
        taskScheduler.initialize();

        config.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(new long[]{25000, 10000})
                .setTaskScheduler(taskScheduler);

        config.setApplicationDestinationPrefixes("/app");
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Native WebSocket endpoint (for @stomp/stompjs client)
        registry.addEndpoint("/ws")
                .addInterceptors(ipGuardInterceptor)
                .setAllowedOriginPatterns("*");

        // SockJS fallback endpoint (for older browsers)
        registry.addEndpoint("/ws-sockjs")
                .addInterceptors(ipGuardInterceptor)
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }
}
