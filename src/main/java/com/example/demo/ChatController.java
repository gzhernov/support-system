package com.example.demo;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.text.SimpleDateFormat;
import java.time.format.DateTimeFormatter;
import java.util.Date;

@Controller
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;

    public ChatController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }


    /**
     * Обрабатывает сообщения, отправленные на /app/send
     * И рассылает результат всем подписчикам /topic/messages
     */
    @MessageMapping("/send")                    // ← клиент шлет сюда
//    @SendTo("/topic/messages")                   // → сервер шлет сюда всем
    public void handleMessage(Message message) {
        System.out.println("📨 Получено сообщение: " + message);

        // Добавляем время к сообщению
        String currentTime = new SimpleDateFormat("HH:mm:ss").format(new Date());
        message.setTime(currentTime);

        messagingTemplate.convertAndSend("/topic/messages/"+message.getRoom(), message);


        // Возвращаем сообщение - оно уйдет всем подписанным клиентам
//        return message;
    }

    /**
     * Дополнительный метод для приветствия при подключении
     */
    @MessageMapping("/join")                     // клиент шлет сюда при подключении
//    @SendTo("/topic/messages")                    // всем придет уведомление
    public void userJoined(Message message) {
        message.setText("👋 " + message.getFrom() + " присоединился к чату!");
        message.setTime(new SimpleDateFormat("HH:mm:ss").format(new Date()));

        messagingTemplate.convertAndSend("/topic/messages/"+message.getRoom(), message);

//        return message;
    }

}
