package com.example.demo;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // Для личных сообщений и очередей
        config.enableSimpleBroker("/queue", "/topic");

        // Префикс для сообщений от клиента к серверу
        config.setApplicationDestinationPrefixes("/app");

        // Префикс для личных сообщений
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Эндпоинт для подключения
        registry.addEndpoint("/ws-time")
                .setAllowedOriginPatterns("*")
                .withSockJS(); // Поддержка SockJS

        registry.addEndpoint("/ws-support")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }
}