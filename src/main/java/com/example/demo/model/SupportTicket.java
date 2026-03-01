package com.example.demo.model;

import java.time.LocalDateTime;

public class SupportTicket {
    private String id;
    private String clientId;
    private String clientName;
    private String supportId;
    private String supportName;
    private LocalDateTime createdAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime closedAt;
    private TicketStatus status;
    private String subject;

    public enum TicketStatus {
        OPEN,           // Открыт, ждет оператора
        IN_PROGRESS,    // Оператор принял
        CLOSED          // Закрыт
    }

    public SupportTicket(String clientId, String clientName, String subject) {
        this.id = java.util.UUID.randomUUID().toString();
        this.clientId = clientId;
        this.clientName = clientName;
        this.subject = subject;
        this.createdAt = LocalDateTime.now();
        this.status = TicketStatus.OPEN;
    }

    // Геттеры и сеттеры
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }

    public String getClientName() { return clientName; }
    public void setClientName(String clientName) { this.clientName = clientName; }

    public String getSupportId() { return supportId; }
    public void setSupportId(String supportId) { this.supportId = supportId; }

    public String getSupportName() { return supportName; }
    public void setSupportName(String supportName) { this.supportName = supportName; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getAcceptedAt() { return acceptedAt; }
    public void setAcceptedAt(LocalDateTime acceptedAt) { this.acceptedAt = acceptedAt; }

    public LocalDateTime getClosedAt() { return closedAt; }
    public void setClosedAt(LocalDateTime closedAt) { this.closedAt = closedAt; }

    public TicketStatus getStatus() { return status; }
    public void setStatus(TicketStatus status) { this.status = status; }

    public String getSubject() { return subject; }
    public void setSubject(String subject) { this.subject = subject; }
}