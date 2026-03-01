package com.example.demo.model;

public class User {
    private String id;
    private String name;
    private UserType type;
    private boolean available; // для сотрудников поддержки
    private String currentTicketId; // текущий тикет, который обрабатывает

    public enum UserType {
        CLIENT,      // Клиент
        SUPPORT      // Сотрудник поддержки
    }

    public User(String id, String name, UserType type) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.available = (type == UserType.SUPPORT); // Поддержка по умолчанию свободна
    }

    // Геттеры и сеттеры
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public UserType getType() { return type; }
    public void setType(UserType type) { this.type = type; }

    public boolean isAvailable() { return available; }
    public void setAvailable(boolean available) { this.available = available; }

    public String getCurrentTicketId() { return currentTicketId; }
    public void setCurrentTicketId(String currentTicketId) { this.currentTicketId = currentTicketId; }
}