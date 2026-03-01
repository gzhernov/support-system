//package com.example.demo;
//
//import org.springframework.messaging.simp.SimpMessagingTemplate;
//import org.springframework.scheduling.annotation.EnableScheduling;
//import org.springframework.scheduling.annotation.Scheduled;
//import org.springframework.stereotype.Controller;
//
//import java.time.LocalTime;
//import java.time.format.DateTimeFormatter;
//
//@Controller
//@EnableScheduling
//public class WebSocketCounterController {
//
//    private final SimpMessagingTemplate messagingTemplate;
//    private final DateTimeFormatter formatter = DateTimeFormatter.ofPattern("HH:mm:ss");
//
//    public WebSocketCounterController(SimpMessagingTemplate messagingTemplate) {
//        this.messagingTemplate = messagingTemplate;
//    }
//
//    /**
//     * Каждую секунду отправляем текущее время всем подключенным клиентам
//     */
//    @Scheduled(fixedRate = 1000) // Каждую секунду
//    public void sendTimeToAll() {
//        String currentTime = LocalTime.now().format(formatter);
//
//        // Отправляем всем, кто подписан на /topic/time
//        messagingTemplate.convertAndSend("/topic/time", currentTime);
//
//        // Для отладки в консоли
//        System.out.println("Отправлено время: " + currentTime);
//    }
//}