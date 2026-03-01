//package com.example.demo;
//
//import com.example.demo.model.ChatMessage;
//import com.example.demo.model.SupportTicket;
//import com.example.demo.model.User;
//import org.springframework.messaging.handler.annotation.MessageMapping;
//import org.springframework.messaging.handler.annotation.Payload;
//import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
//import org.springframework.messaging.simp.SimpMessagingTemplate;
//import org.springframework.stereotype.Controller;
//
//import java.time.LocalDateTime;
//import java.time.format.DateTimeFormatter;
//import java.util.Set;
//import java.util.concurrent.ConcurrentHashMap;
//
//@Controller
//public class SupportChatController2 {
//
//    private final SimpMessagingTemplate messagingTemplate;
//    private final SupportQueueService queueService;
//    private final DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss");
//
//    // Ручное хранение связей userId -> Set<sessionId>
//    private final ConcurrentHashMap<String, Set<String>> userSessions = new ConcurrentHashMap<>();
//
//
//    public SupportChatController2(SimpMessagingTemplate messagingTemplate,
//                                  SupportQueueService queueService) {
//        this.messagingTemplate = messagingTemplate;
//        this.queueService = queueService;
//    }
//
//    /**
//     * Клиент создает новое обращение
//     */
//    @MessageMapping("/support.create")
//    public void createTicket(@Payload ChatMessage message, SimpMessageHeaderAccessor headerAccessor) {
//        // Получаем sessionId из заголовков сообщения
//        String sessionId = headerAccessor.getSessionId();
//        String userId = message.getFromUserId();
//
//
//        // Регистрируем клиента, если его еще нет
//        User client = queueService.getUser(message.getFromUserId());
//        if (client == null) {
//            client = queueService.addClientUser(message.getFromUserId(),
//                    message.getFromUserName());
//        }
//
//        // 3. ЯВНО сохраняем связь userId → sessionId (ВАЖНО!)
//        userSessions.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
//
//        // Создаем тикет
//        SupportTicket ticket = queueService.createTicket(
//                client.getId(),
//                message.getText()
//        );
//
//        // Используем конструктор с параметрами
//        ChatMessage response = new ChatMessage(
//                "Система",
//                "Ваш запрос принят. Номер тикета: " + ticket.getId(),
//                ChatMessage.MessageType.TICKET_CREATED
//        );
//        response.setTicketId(ticket.getId());
//        response.setFromUserId(client.getId());
//
//        messagingTemplate.convertAndSend(
//                "/queue/support-user",  // ← Ручное формирование адреса!
//                response
//        );
//
//        // Проверяем, есть ли свободный оператор
//        User availableSupport = queueService.findAvailableSupport();
//        if (availableSupport != null) {
//            // Если есть, сразу назначаем
//            assignSupportToTicket(ticket.getId(), availableSupport.getId());
//        } else {
//            // Если нет, уведомляем операторов о новом тикете
//            ChatMessage queueMsg = new ChatMessage(
//                    "Система",
//                    "Новый запрос от " + client.getName() + ": " + message.getText(),
//                    ChatMessage.MessageType.TICKET_CREATED
//            );
//            messagingTemplate.convertAndSend("/topic/support/queue", queueMsg);
//        }
//    }
//
//    /**
//     * Оператор принимает тикет
//     */
//    @MessageMapping("/support.accept")
//    public void acceptTicket(@Payload ChatMessage message) {
//        SupportTicket ticket = queueService.assignSupportToTicket(message.getFromUserId());
//
//        if (ticket != null) {
//            assignSupportToTicket(ticket.getId(), message.getFromUserId());
//        } else {
//            // Нет тикетов в очереди
//            messagingTemplate.convertAndSendToUser(
//                    message.getFromUserId(),
//                    "/queue/support",
//                    new ChatMessage("system", "Нет ожидающих запросов", ChatMessage.MessageType.TICKET_CLOSED)
//            );
//        }
//    }
//
//    /**
//     * Назначение оператора на конкретный тикет
//     */
//    private void assignSupportToTicket(String ticketId, String supportId) {
//        SupportTicket ticket = queueService.getTicket(ticketId);
//        User support = queueService.getUser(supportId);
//
//        if (ticket == null || support == null) return;
//
//        // Уведомление для клиента - используем конструктор
//        ChatMessage clientMsg = new ChatMessage(
//                "Система",
//                "Оператор " + support.getName() + " подключился к чату",
//                ChatMessage.MessageType.SUPPORT_JOINED
//        );
//        clientMsg.setTicketId(ticketId);
//        clientMsg.setFromUserId(supportId);
//        clientMsg.setFromUserName(support.getName());
//
//        messagingTemplate.convertAndSend(
//                "/queue/support-user",
//                clientMsg
//        );
//
//        // Уведомление для оператора - используем конструктор
//        ChatMessage supportMsg = new ChatMessage(
//                "Система",
//                "Вы подключились к клиенту " + ticket.getClientName(),
//                ChatMessage.MessageType.TICKET_ACCEPTED
//        );
//        supportMsg.setTicketId(ticketId);
//        supportMsg.setFromUserId(ticket.getClientId());
//        supportMsg.setFromUserName(ticket.getClientName());
//
//        messagingTemplate.convertAndSend(
//                "/queue/support",
//                supportMsg
//        );
//    }
//
//    /**
//     * Отправка сообщения в чате (клиент или оператор)
//     */
//    @MessageMapping("/support.chat")
//    public void sendMessage(@Payload ChatMessage message) {
//        message.setTimestamp(LocalDateTime.now().format(timeFormatter));
//        message.setType(ChatMessage.MessageType.CHAT);
//
//        SupportTicket ticket = queueService.getTicket(message.getTicketId());
//
//        if (ticket == null) {
//            // Тикет не найден или закрыт
//            ChatMessage error = new ChatMessage();
//            error.setType(ChatMessage.MessageType.TICKET_CLOSED);
//            error.setText("Чат закрыт");
//
//            messagingTemplate.convertAndSend(
//                    "/queue/support",
//                    error
//            );
//            return;
//        }
//
//        // Определяем получателя
//        User sender = queueService.getUser(message.getFromUserId());
//        String recipientId = sender.getType() == User.UserType.CLIENT ?
//                ticket.getSupportId() : ticket.getClientId();
//
//
//        // Отправляем
//        messagingTemplate.convertAndSend(
//                "/queue/support-user",
//                message
//        );
//
//        // Отправляем
//        messagingTemplate.convertAndSend(
//                "/queue/support",
//                message
//        );
//
//
////        if (recipientId != null) {
////            // Отправляем сообщение получателю
////            messagingTemplate.convertAndSend(
////                    "/queue/support-user",
////                    message
////            );
////        }
////
////        // Также отправляем подтверждение отправителю (опционально)
////        messagingTemplate.convertAndSend(
////                "/queue/support-user",
////                message
////        );
//    }
//
//    /**
//     * Индикатор печатания
//     */
//    @MessageMapping("/support.typing")
//    public void typing(@Payload ChatMessage message) {
//        SupportTicket ticket = queueService.getTicket(message.getTicketId());
//
//        if (ticket != null) {
//            User sender = queueService.getUser(message.getFromUserId());
//            String recipientId = sender.getType() == User.UserType.CLIENT ?
//                    ticket.getSupportId() : ticket.getClientId();
//
//            if (recipientId != null) {
//                messagingTemplate.convertAndSendToUser(
//                        recipientId,
//                        "/queue/support/typing",
//                        message
//                );
//            }
//        }
//    }
//
//    /**
//     * Закрытие тикета
//     */
//    @MessageMapping("/support.close")
//    public void closeTicket(@Payload ChatMessage message) {
//        SupportTicket ticket = queueService.getTicket(message.getTicketId());
//
//        if (ticket != null) {
//            queueService.closeTicket(ticket.getId());
//
//            ChatMessage closeMsg = new ChatMessage();
//            closeMsg.setTicketId(ticket.getId());
//            closeMsg.setType(ChatMessage.MessageType.TICKET_CLOSED);
//            closeMsg.setText("Чат закрыт");
//            closeMsg.setTimestamp(LocalDateTime.now().format(timeFormatter));
//
//            // Уведомляем клиента
//            messagingTemplate.convertAndSendToUser(
//                    ticket.getClientId(),
//                    "/queue/support",
//                    closeMsg
//            );
//
//            // Уведомляем оператора
//            if (ticket.getSupportId() != null) {
//                messagingTemplate.convertAndSendToUser(
//                        ticket.getSupportId(),
//                        "/queue/support",
//                        closeMsg
//                );
//            }
//        }
//    }
//}