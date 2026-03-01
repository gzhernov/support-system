package com.example.demo;

import com.example.demo.model.User;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collection;

@RestController
@RequestMapping("/api/operators")
@CrossOrigin(origins = "*")
public class OperatorController {

    private final SupportQueueService queueService;

    public OperatorController(SupportQueueService queueService) {
        this.queueService = queueService;
    }

    @GetMapping
    public Collection<User> getOperators() {
        return queueService.getAllSupportOperators();
    }
}