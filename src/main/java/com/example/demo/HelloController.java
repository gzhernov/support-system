package com.example.demo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {

    @GetMapping("/hello")
    public String hello() {
        return "Hello, World!";
    }

    @GetMapping("/")
    public String home() {

//        try {
//            Thread.sleep(100*1000);
//        } catch (InterruptedException e) {
//            throw new RuntimeException(e);
//        }

        return "Добро пожаловать в Hello World приложение!XXXXXXX";
    }
}