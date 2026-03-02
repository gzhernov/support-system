package com.example.demo;

import com.example.demo.model.ChatMessage;
import com.example.demo.model.SupportTicket;
import com.example.demo.model.User;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Set;

@Controller
public class SupportChatController {

    private final SimpMessagingTemplate messagingTemplate;
    private final SupportQueueService queueService;
    private final DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss");

    public SupportChatController(SimpMessagingTemplate messagingTemplate,
                                 SupportQueueService queueService) {
        this.messagingTemplate = messagingTemplate;
        this.queueService = queueService;
    }

    @MessageMapping("/support.greet")
    public void greet(@Payload ChatMessage message, StompHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        String userId = message.getFromUserId();

        System.out.println("👋 Приветствие от " + userId + " (session: " + sessionId + ")");

        // Регистрируем сессию в queueService
        queueService.registerSession(userId, sessionId);

        // Сохраняем в атрибутах сессии
        Map<String, Object> sessionAttributes = headerAccessor.getSessionAttributes();
        if (sessionAttributes != null) {
            sessionAttributes.put("userId", userId);
        }
    }

    @MessageMapping("/support.create")
    public void createTicket(@Payload ChatMessage message, StompHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        String userId = message.getFromUserId();
        String userName = message.getFromUserName();

        System.out.println("📝 Создание тикета от " + userName + " (session: " + sessionId + ")");
        System.out.println("   Заголовок: " + message.getTitle());
        System.out.println("   Описание: " + message.getText());

        // Регистрируем сессию
        queueService.registerSession(userId, sessionId);

        Map<String, Object> sessionAttributes = headerAccessor.getSessionAttributes();
        if (sessionAttributes != null) {
            sessionAttributes.put("userId", userId);
        }

        // Регистрируем или получаем клиента
        User client = queueService.getUser(userId);
        if (client == null) {
            client = queueService.addClientUser(userId, userName);
        }

        // Создаем тикет с заголовком и описанием
        SupportTicket ticket = queueService.createTicket(
                client.getId(),
                message.getTitle() != null ? message.getTitle() : "Новое обращение",
                message.getText()
        );

        // Отправляем подтверждение на ВСЕ сессии клиента
        ChatMessage response = new ChatMessage(
                "Система",
                "✅ Ваш запрос принят. Номер тикета: " + ticket.getId(),
                ChatMessage.MessageType.TICKET_CREATED
        );
        response.setTicketId(ticket.getId());
        response.setTitle(message.getTitle());
        sendToUserAllSessions(userId, "/queue/support", response);

        // Отправляем уведомление операторам о новом тикете
        notifyOperatorsAboutNewTicket(ticket, client, message.getText());

        // Проверяем, есть ли свободный оператор для немедленного назначения
//        User availableSupport = queueService.findAvailableSupport();
//        if (availableSupport != null) {
//            assignSupportToTicket(ticket.getId(), availableSupport.getId());
//        }
    }

    /**
     * Отправляет уведомление всем операторам о новом тикете
     */
    private void notifyOperatorsAboutNewTicket(SupportTicket ticket, User client, String initialMessage) {
        ChatMessage queueNotification = new ChatMessage(
                "Система",
                "Новый запрос от " + client.getName(),
                ChatMessage.MessageType.TICKET_CREATED
        );
        queueNotification.setTicketId(ticket.getId());
        queueNotification.setFromUserId(client.getId());
        queueNotification.setFromUserName(client.getName());
        queueNotification.setText(initialMessage); // текст обращения

        System.out.println("📢 Отправка уведомления операторам о новом тикете: " + ticket.getId());
        System.out.println("   Клиент: " + client.getName());
        System.out.println("   Текст: " + initialMessage);

        // Отправляем в общий топик для всех операторов
        messagingTemplate.convertAndSend("/topic/support/queue", queueNotification);
    }

    @MessageMapping("/support.accept")
    public void acceptTicket(@Payload ChatMessage message, StompHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        String supportId = message.getFromUserId();
        String supportName = message.getFromUserName();

        System.out.println("📞 Оператор " + supportName + " принимает тикет");

        // Регистрируем сессию оператора
        queueService.registerSession(supportId, sessionId);

        Map<String, Object> sessionAttributes = headerAccessor.getSessionAttributes();
        if (sessionAttributes != null) {
            sessionAttributes.put("userId", supportId);
        }

        SupportTicket ticket = queueService.assignSupportToTicket(supportId);

        if (ticket != null) {
            assignSupportToTicket(ticket.getId(), supportId);
        } else {
            ChatMessage response = new ChatMessage(
                    "Система",
                    "❌ Нет ожидающих запросов",
                    ChatMessage.MessageType.TICKET_CLOSED
            );
            sendToUserAllSessions(supportId, "/queue/support", response);
        }
    }

    private void assignSupportToTicket(String ticketId, String supportId) {
        SupportTicket ticket = queueService.getTicket(ticketId);
        User support = queueService.getUser(supportId);

        if (ticket == null || support == null) return;

        System.out.println("✅ Назначение оператора " + support.getName() + " на тикет " + ticketId);

        // Клиенту - на ВСЕ его сессии
        ChatMessage clientMsg = new ChatMessage(
                "Система",
                "👨‍💼 Оператор " + support.getName() + " подключился к чату",
                ChatMessage.MessageType.SUPPORT_JOINED
        );
        clientMsg.setTicketId(ticketId);
        clientMsg.setFromUserId(supportId);
        clientMsg.setFromUserName(support.getName());

        sendToUserAllSessions(ticket.getClientId(), "/queue/support", clientMsg);

        // Оператору - на ВСЕ его сессии
        ChatMessage supportMsg = new ChatMessage(
                "Система",
                "✅ Вы подключились к клиенту " + ticket.getClientName(),
                ChatMessage.MessageType.TICKET_ACCEPTED
        );
        supportMsg.setTicketId(ticketId);
        supportMsg.setFromUserId(ticket.getClientId());
        supportMsg.setFromUserName(ticket.getClientName());

        sendToUserAllSessions(supportId, "/queue/support", supportMsg);
    }

    @MessageMapping("/support.chat")
    public void sendMessage(@Payload ChatMessage message) {
        SupportTicket ticket = queueService.getTicket(message.getTicketId());

        if (ticket == null) {
            ChatMessage error = new ChatMessage(
                    "Система",
                    "❌ Чат закрыт",
                    ChatMessage.MessageType.TICKET_CLOSED
            );
            sendToUserAllSessions(message.getFromUserId(), "/queue/support", error);
            return;
        }

        message.setTimestamp(LocalDateTime.now().format(timeFormatter));
        queueService.addMessageToTicket(message.getTicketId(), message);

        User sender = queueService.getUser(message.getFromUserId());
        if (sender == null) return;

        String recipientId = sender.getType() == User.UserType.CLIENT ?
                ticket.getSupportId() : ticket.getClientId();

        // Отправляем получателю на ВСЕ его сессии
        if (recipientId != null) {
            System.out.println("💬 Отправка сообщения от " + sender.getName() + " к " + recipientId);
            sendToUserAllSessions(recipientId, "/queue/support", message);
        }
    }

    @MessageMapping("/support.typing")
    public void typing(@Payload ChatMessage message) {
        SupportTicket ticket = queueService.getTicket(message.getTicketId());
        if (ticket == null) return;

        User sender = queueService.getUser(message.getFromUserId());
        if (sender == null) return;

        String recipientId = sender.getType() == User.UserType.CLIENT ?
                ticket.getSupportId() : ticket.getClientId();

        if (recipientId != null) {
            sendToUserAllSessions(recipientId, "/queue/support/typing", message);
        }
    }

    @MessageMapping("/support.close")
    public void closeTicket(@Payload ChatMessage message) {
        SupportTicket ticket = queueService.getTicket(message.getTicketId());

        if (ticket != null) {
            queueService.closeTicket(ticket.getId());

            ChatMessage closeMsg = new ChatMessage(
                    "Система",
                    "🔒 Чат закрыт",
                    ChatMessage.MessageType.TICKET_CLOSED
            );
            closeMsg.setTicketId(ticket.getId());

            if (ticket.getClientId() != null) {
                sendToUserAllSessions(ticket.getClientId(), "/queue/support", closeMsg);
            }
            if (ticket.getSupportId() != null) {
                sendToUserAllSessions(ticket.getSupportId(), "/queue/support", closeMsg);
            }

            System.out.println("🔒 Тикет " + ticket.getId() + " закрыт");
        }
    }

    /**
     * Отправка сообщения на ВСЕ активные сессии пользователя
     */
    private void sendToUserAllSessions(String userId, String destination, Object message) {
        Set<String> sessions = queueService.getUserSessions(userId);

        if (sessions.isEmpty()) {
            System.out.println("⚠️ Пользователь " + userId + " не имеет активных сессий");
            return;
        }

        System.out.println("📤 Отправка сообщения пользователю " + userId +
                " на " + sessions.size() + " сессий");

        for (String sessionId : sessions) {
            // Формируем персональный адрес для каждой сессии
            String personalDestination = destination + "-user" + sessionId;
            messagingTemplate.convertAndSend(personalDestination, message);
        }
    }

    /**
     * Обработка отключения сессии
     */
    @MessageMapping("/support.disconnect")
    public void handleDisconnect(@Payload ChatMessage message, StompHeaderAccessor headerAccessor) {
        String sessionId = headerAccessor.getSessionId();
        String userId = queueService.getUserIdBySession(sessionId);

        if (userId != null) {
            queueService.unregisterSession(sessionId);
            System.out.println("👋 Пользователь " + userId + " отключился (сессия: " + sessionId + ")");
        }
    }
}