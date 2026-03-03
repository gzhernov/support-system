package com.example.demo.model;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class ChatMessage {
    private String id;
    private String title;
    private String ticketId;
    private String fromUserId;
    private String fromUserName;
    private String toUserId;      // Получатель (ID оператора или клиента, кому адресовано сообщение)
    private String text;
    private String timestamp;
    private MessageType type;

    public enum MessageType {
        CHAT,           // Обычное сообщение
        TICKET_CREATED, // Тикет создан
        TICKET_ACCEPTED, // Оператор принял
        TICKET_CLOSED,  // Тикет закрыт
        SUPPORT_JOINED, // Оператор подключился
        TYPING,          // Печатает...
        GREETING
    }

    public ChatMessage() {
        this.id = java.util.UUID.randomUUID().toString();
        this.timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
    }

    // Конструктор для простых системных сообщений
    public ChatMessage(String fromUserName, String text, MessageType type) {
        this();
        this.fromUserName = fromUserName;
        this.text = text;
        this.type = type;
    }

    // Геттеры и сеттеры
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTicketId() { return ticketId; }
    public void setTicketId(String ticketId) { this.ticketId = ticketId; }

    public String getFromUserId() { return fromUserId; }
    public void setFromUserId(String fromUserId) { this.fromUserId = fromUserId; }

    public String getFromUserName() { return fromUserName; }
    public void setFromUserName(String fromUserName) { this.fromUserName = fromUserName; }

    public String getToUserId() { return toUserId; }
    public void setToUserId(String toUserId) { this.toUserId = toUserId; }

    public String getText() { return text; }
    public void setText(String text) { this.text = text; }

    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }

    public MessageType getType() { return type; }
    public void setType(MessageType type) { this.type = type; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
}