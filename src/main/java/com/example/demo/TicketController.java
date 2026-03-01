package com.example.demo;

import com.example.demo.model.SupportTicket;
import org.springframework.web.bind.annotation.*;
import java.util.Collection;

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

    @GetMapping("/all")
    public Collection<SupportTicket> getAllTickets() {
        System.out.println("📡 Запрос всех тикетов");
        return queueService.getAllTickets();
    }
}