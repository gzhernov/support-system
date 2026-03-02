package com.example.demo;

import com.example.demo.model.ChatMessage;
import com.example.demo.model.SupportTicket;
import com.example.demo.model.User;
import org.springframework.web.bind.annotation.*;
import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/tickets")
@CrossOrigin(origins = "*")
public class TicketController {

    private final SupportQueueService queueService;

    public TicketController(SupportQueueService queueService) {
        this.queueService = queueService;
    }

    @GetMapping("/queue")
    public Collection<SupportTicket> getQueueTickets() {
        System.out.println("📡 Запрос тикетов в очереди");
        return queueService.getOpenTickets();
    }

    @GetMapping("/active")
    public Collection<SupportTicket> getActiveTickets() {
        System.out.println("📡 Запрос активных тикетов");
        return queueService.getActiveTickets();
    }

    @GetMapping("/closed")
    public Collection<SupportTicket> getClosedTickets() {
        System.out.println("📡 Запрос закрытых тикетов");
        return queueService.getClosedTickets();
    }

    @GetMapping("/all")
    public Collection<SupportTicket> getAllTickets() {
        System.out.println("📡 Запрос всех тикетов");
        return queueService.getAllTickets();
    }

    @GetMapping("/client/{clientId}")
    public Collection<SupportTicket> getClientTickets(@PathVariable String clientId) {
        System.out.println("📡 Запрос всех тикетов для клиента: " + clientId);
        return queueService.getClientTickets(clientId);
    }

    @GetMapping("/client/{clientId}/current")
    public Collection<SupportTicket> getClientCurrentTickets(@PathVariable String clientId) {
        System.out.println("📡 Запрос текущих тикетов для клиента: " + clientId);
        return queueService.getClientCurrentTickets(clientId);
    }

    @GetMapping("/client/{clientId}/archived")
    public Collection<SupportTicket> getClientArchivedTickets(@PathVariable String clientId) {
        System.out.println("📡 Запрос архивных тикетов для клиента: " + clientId);
        return queueService.getClientArchivedTickets(clientId);
    }

    @GetMapping("/{ticketId}/messages")
    public List<ChatMessage> getTicketMessages(@PathVariable String ticketId) {
        System.out.println("📡 Запрос сообщений для тикета: " + ticketId);
        return queueService.getTicketMessages(ticketId);
    }
}