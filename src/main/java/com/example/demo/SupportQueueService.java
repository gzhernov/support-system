package com.example.demo;

import com.example.demo.model.ChatMessage;
import com.example.demo.model.SupportTicket;
import com.example.demo.model.User;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.stream.Collectors;

@Service
public class SupportQueueService {

    // Очередь открытых тикетов (ждет оператора)
    private final Queue<SupportTicket> ticketQueue = new LinkedBlockingQueue<>();

    // Все пользователи системы
    private final Map<String, User> users = new ConcurrentHashMap<>();

    // Сотрудники поддержки (id -> User)
    private final Map<String, User> supportStaff = new ConcurrentHashMap<>();

    // Хранилище сообщений по тикетам
    private final Map<String, List<ChatMessage>> ticketMessages = new ConcurrentHashMap<>();

    // Все тикеты (и активные, и закрытые) для истории
    private final Map<String, SupportTicket> allTickets = new ConcurrentHashMap<>();

    // ========== НОВОЕ: Управление сессиями пользователей ==========

    /**
     * Карта сессий пользователей: userId -> Set<sessionId>
     * Один пользователь может иметь несколько активных сессий (разные вкладки/устройства)
     */
    private final Map<String, Set<String>> userSessions = new ConcurrentHashMap<>();

    /**
     * Обратная карта: sessionId -> userId
     * Для быстрого поиска пользователя по сессии
     */
    private final Map<String, String> sessionToUser = new ConcurrentHashMap<>();

    public SupportQueueService() {
        // Добавим несколько тестовых сотрудников поддержки
        addSupportUser("support1", "Анна", true);
        addSupportUser("support2", "Иван", true);
        addSupportUser("support3", "Мария", true); // Занята
    }

    // Добавление сотрудника поддержки
    public void addSupportUser(String id, String name, boolean available) {
        User support = new User(id, name, User.UserType.SUPPORT);
        support.setAvailable(available);
        users.put(id, support);
        supportStaff.put(id, support);
    }

    // Добавление клиента
    public User addClientUser(String id, String name) {
        User client = new User(id, name, User.UserType.CLIENT);
        users.put(id, client);
        return client;
    }

    // Создание нового тикета
    public SupportTicket createTicket(String clientId, String subject, String description) {
        User client = users.get(clientId);
        if (client == null) {
            throw new RuntimeException("Клиент не найден");
        }

        SupportTicket ticket = new SupportTicket(clientId, client.getName(), subject);
        ticket.setDescription(description);
        ticketQueue.add(ticket);

        // Сохраняем тикет в общую карту
        allTickets.put(ticket.getId(), ticket);

        // Инициализируем список сообщений для этого тикета
        ticketMessages.put(ticket.getId(), Collections.synchronizedList(new ArrayList<>()));

        // Добавляем первое сообщение от клиента
        if (description != null && !description.isEmpty()) {
            ChatMessage firstMessage = new ChatMessage(
                    client.getName(),
                    description,
                    ChatMessage.MessageType.CHAT
            );
            firstMessage.setFromUserId(clientId);
            firstMessage.setTicketId(ticket.getId());
            addMessageToTicket(ticket.getId(), firstMessage);
        }

        System.out.println("📝 Создан новый тикет #" + ticket.getId() +
                " от клиента " + client.getName());
        System.out.println("   Заголовок: " + subject);
        System.out.println("   Описание: " + description);
        System.out.println("   Текущая очередь: " + ticketQueue.size() + " тикетов");

        return ticket;
    }

    // Поиск свободного оператора
    public User findAvailableSupport() {
        return supportStaff.values().stream()
                .filter(User::isAvailable)
                .findFirst()
                .orElse(null);
    }

    // Получение всех операторов поддержки
    public Collection<User> getAllSupportOperators() {
        return supportStaff.values();
    }

    // Назначение оператора на тикет
    public SupportTicket assignSupportToTicket(String supportId) {
        if (ticketQueue.isEmpty()) {
            return null;
        }

        User support = users.get(supportId);
        if (support == null || !support.isAvailable()) {
            return null;
        }

        // Берем первый тикет из очереди
        SupportTicket ticket = ticketQueue.poll();
        if (ticket == null) {
            return null;
        }

        // Назначаем оператора
        ticket.setSupportId(supportId);
        ticket.setSupportName(support.getName());
        ticket.setStatus(SupportTicket.TicketStatus.IN_PROGRESS);
        ticket.setAcceptedAt(java.time.LocalDateTime.now());

        // Обновляем статус оператора
        support.setAvailable(false);
        support.setCurrentTicketId(ticket.getId());

        // Обновляем тикет в общей карте
        allTickets.put(ticket.getId(), ticket);

        // Добавляем системное сообщение о подключении оператора
        ChatMessage systemMessage = new ChatMessage(
                "Система",
                "Оператор " + support.getName() + " подключился к чату",
                ChatMessage.MessageType.SUPPORT_JOINED
        );
        systemMessage.setTicketId(ticket.getId());
        systemMessage.setFromUserId(supportId);
        systemMessage.setFromUserName(support.getName());

        addMessageToTicket(ticket.getId(), systemMessage);

        System.out.println("✅ Тикет #" + ticket.getId() +
                " принял оператор " + support.getName());

        return ticket;
    }

    // Добавление сообщения в тикет
    public void addMessageToTicket(String ticketId, ChatMessage message) {
        List<ChatMessage> messages = ticketMessages.get(ticketId);
        if (messages != null) {
            messages.add(message);
        } else {
            System.err.println("❌ Тикет " + ticketId + " не найден для добавления сообщения");
        }
    }

    // Получение всех сообщений тикета
    public List<ChatMessage> getTicketMessages(String ticketId) {
        return ticketMessages.getOrDefault(ticketId, Collections.emptyList());
    }

    // Получение тикета по ID
    public SupportTicket getTicket(String ticketId) {
        return allTickets.get(ticketId);
    }

    // Получение всех тикетов (для истории)
    public Collection<SupportTicket> getAllTickets() {
        return allTickets.values();
    }

    // Получение открытых тикетов (ожидающих оператора)
    public List<SupportTicket> getOpenTickets() {
        return new ArrayList<>(ticketQueue);
    }

    // Получение активных тикетов (в работе)
    public List<SupportTicket> getActiveTickets() {
        return allTickets.values().stream()
                .filter(t -> t.getStatus() == SupportTicket.TicketStatus.IN_PROGRESS)
                .toList();
    }

    // Закрытие тикета
    public void closeTicket(String ticketId) {
        SupportTicket ticket = allTickets.get(ticketId);
        if (ticket != null) {
            ticket.setStatus(SupportTicket.TicketStatus.CLOSED);
            ticket.setClosedAt(java.time.LocalDateTime.now());

            // Освобождаем оператора
            if (ticket.getSupportId() != null) {
                User support = users.get(ticket.getSupportId());
                if (support != null) {
                    support.setAvailable(true);
                    support.setCurrentTicketId(null);
                }
            }

            // Добавляем системное сообщение о закрытии
            ChatMessage closeMessage = new ChatMessage(
                    "Система",
                    "🔒 Чат закрыт",
                    ChatMessage.MessageType.TICKET_CLOSED
            );
            closeMessage.setTicketId(ticketId);
            addMessageToTicket(ticketId, closeMessage);

            System.out.println("🔒 Тикет #" + ticketId + " закрыт");
        }
    }

    // Получить информацию о пользователе
    public User getUser(String userId) {
        return users.get(userId);
    }

    // Получить все сообщения пользователя (для истории)
    public List<ChatMessage> getUserMessages(String userId) {
        List<ChatMessage> userMessages = new ArrayList<>();
        for (List<ChatMessage> messages : ticketMessages.values()) {
            for (ChatMessage msg : messages) {
                if (userId.equals(msg.getFromUserId())) {
                    userMessages.add(msg);
                }
            }
        }
        return userMessages;
    }

    // Удалить тикет (если нужно)
    public void deleteTicket(String ticketId) {
        allTickets.remove(ticketId);
        ticketMessages.remove(ticketId);
        ticketQueue.removeIf(t -> t.getId().equals(ticketId));
    }

    // Получить статистику по тикету
    public Map<String, Object> getTicketStats(String ticketId) {
        SupportTicket ticket = allTickets.get(ticketId);
        List<ChatMessage> messages = ticketMessages.get(ticketId);

        if (ticket == null) return null;

        Map<String, Object> stats = new HashMap<>();
        stats.put("ticket", ticket);
        stats.put("messageCount", messages != null ? messages.size() : 0);
        stats.put("clientMessages", messages != null ?
                messages.stream().filter(m -> m.getFromUserId().equals(ticket.getClientId())).count() : 0);
        stats.put("supportMessages", messages != null && ticket.getSupportId() != null ?
                messages.stream().filter(m -> m.getFromUserId().equals(ticket.getSupportId())).count() : 0);

        return stats;
    }

    // ========== НОВЫЕ МЕТОДЫ ДЛЯ РАБОТЫ С СЕССИЯМИ ==========

    /**
     * Регистрация сессии пользователя
     * @param userId ID пользователя
     * @param sessionId ID сессии
     */
    public void registerSession(String userId, String sessionId) {
        // Добавляем в прямую карту
        userSessions.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet()).add(sessionId);

        // Добавляем в обратную карту
        sessionToUser.put(sessionId, userId);

        System.out.println("✅ Зарегистрирована сессия " + sessionId + " для пользователя " + userId);
        System.out.println("   Активных сессий у пользователя: " + getActiveSessionsCount(userId));
    }

    /**
     * Удаление сессии пользователя
     * @param sessionId ID сессии
     * @return ID пользователя, которому принадлежала сессия, или null
     */
    public String unregisterSession(String sessionId) {
        String userId = sessionToUser.remove(sessionId);

        if (userId != null) {
            Set<String> sessions = userSessions.get(userId);
            if (sessions != null) {
                sessions.remove(sessionId);
                if (sessions.isEmpty()) {
                    userSessions.remove(userId);
                    System.out.println("   Пользователь " + userId + " больше не имеет активных сессий");

                    // Опционально: пометить пользователя как офлайн
                    User user = users.get(userId);
                    if (user != null) {
                        // Можно добавить поле isOnline в User
                        System.out.println("   Пользователь " + user.getName() + " вышел из системы");
                    }
                }
            }
            System.out.println("❌ Удалена сессия " + sessionId + " для пользователя " + userId);
        }

        return userId;
    }

    /**
     * Получение всех активных сессий пользователя
     * @param userId ID пользователя
     * @return Set с ID сессий или пустой Set
     */
    public Set<String> getUserSessions(String userId) {
        return userSessions.getOrDefault(userId, Collections.emptySet());
    }

    /**
     * Проверка, имеет ли пользователь активные сессии
     * @param userId ID пользователя
     * @return true если есть хотя бы одна активная сессия
     */
    public boolean hasActiveSessions(String userId) {
        Set<String> sessions = userSessions.get(userId);
        return sessions != null && !sessions.isEmpty();
    }

    /**
     * Получение количества активных сессий пользователя
     * @param userId ID пользователя
     * @return количество активных сессий
     */
    public int getActiveSessionsCount(String userId) {
        Set<String> sessions = userSessions.get(userId);
        return sessions != null ? sessions.size() : 0;
    }

    /**
     * Получение ID пользователя по сессии
     * @param sessionId ID сессии
     * @return ID пользователя или null
     */
    public String getUserIdBySession(String sessionId) {
        return sessionToUser.get(sessionId);
    }

    /**
     * Получение всех активных пользователей (с хотя бы одной сессией)
     * @return Set ID пользователей
     */
    public Set<String> getActiveUsers() {
        return userSessions.keySet();
    }

    /**
     * Получение всех активных сессий в системе
     * @return Map: sessionId -> userId
     */
    public Map<String, String> getAllActiveSessions() {
        return Collections.unmodifiableMap(sessionToUser);
    }

    /**
     * Получение информации о всех активных сессиях с деталями пользователей
     * @return List объектов с информацией о сессиях
     */
    public List<Map<String, Object>> getActiveSessionsInfo() {
        return sessionToUser.entrySet().stream()
                .map(entry -> {
                    Map<String, Object> info = new HashMap<>();
                    info.put("sessionId", entry.getKey());
                    info.put("userId", entry.getValue());

                    User user = users.get(entry.getValue());
                    if (user != null) {
                        info.put("userName", user.getName());
                        info.put("userType", user.getType());
                        info.put("currentTicketId", user.getCurrentTicketId());
                    }

                    return info;
                })
                .collect(Collectors.toList());
    }

    /**
     * Очистка всех сессий пользователя (например, при принудительном выходе)
     * @param userId ID пользователя
     * @return количество удаленных сессий
     */
    public int clearUserSessions(String userId) {
        Set<String> sessions = userSessions.remove(userId);

        if (sessions != null) {
            for (String sessionId : sessions) {
                sessionToUser.remove(sessionId);
            }
            System.out.println("🗑️ Очищено " + sessions.size() + " сессий пользователя " + userId);
            return sessions.size();
        }

        return 0;
    }

    /**
     * Получение статистики по сессиям
     * @return Map со статистикой
     */
    public Map<String, Object> getSessionsStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalActiveSessions", sessionToUser.size());
        stats.put("totalActiveUsers", userSessions.size());

        // Распределение по типам пользователей
        long clientSessions = sessionToUser.entrySet().stream()
                .filter(entry -> {
                    User user = users.get(entry.getValue());
                    return user != null && user.getType() == User.UserType.CLIENT;
                })
                .count();

        long supportSessions = sessionToUser.size() - clientSessions;

        stats.put("clientSessions", clientSessions);
        stats.put("supportSessions", supportSessions);

        // Пользователи с несколькими сессиями
        long multiSessionUsers = userSessions.values().stream()
                .filter(sessions -> sessions.size() > 1)
                .count();

        stats.put("multiSessionUsers", multiSessionUsers);

        return stats;
    }


    // Получение закрытых тикетов (для оператора)
    public List<SupportTicket> getClosedTickets() {
        return allTickets.values().stream()
                .filter(t -> t.getStatus() == SupportTicket.TicketStatus.CLOSED)
                .collect(Collectors.toList());
    }

    // Получение всех тикетов для конкретного клиента
    public Collection<SupportTicket> getClientTickets(String clientId) {
        System.out.println("📊 Поиск всех тикетов для клиента: " + clientId);

        return allTickets.values().stream()
                .filter(ticket -> ticket.getClientId().equals(clientId))
                .collect(Collectors.toList());
    }

    // Получение ТЕКУЩИХ (открытых и в работе) тикетов для клиента
    public Collection<SupportTicket> getClientCurrentTickets(String clientId) {
        System.out.println("📊 Поиск текущих тикетов для клиента: " + clientId);

        return allTickets.values().stream()
                .filter(ticket -> ticket.getClientId().equals(clientId))
                .filter(ticket -> ticket.getStatus() != SupportTicket.TicketStatus.CLOSED)
                .collect(Collectors.toList());
    }

    // Получение АРХИВНЫХ (закрытых) тикетов для клиента
    public Collection<SupportTicket> getClientArchivedTickets(String clientId) {
        System.out.println("📊 Поиск архивных тикетов для клиента: " + clientId);

        return allTickets.values().stream()
                .filter(ticket -> ticket.getClientId().equals(clientId))
                .filter(ticket -> ticket.getStatus() == SupportTicket.TicketStatus.CLOSED)
                .collect(Collectors.toList());
    }

}