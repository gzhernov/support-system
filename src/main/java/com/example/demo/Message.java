package com.example.demo;

public class Message {
    private String room;
    private String from;
    private String text;
    private String time;

    // Обязательно нужен пустой конструктор для JSON
    public Message() {}

    public Message(String room, String from, String text, String time) {
        this.room = room;
        this.from = from;
        this.text = text;
        this.time = time;
    }

    // Геттеры и сеттеры (обязательно!)
    public String getFrom() { return from; }
    public void setFrom(String from) { this.from = from; }

    public String getText() { return text; }
    public void setText(String text) { this.text = text; }

    public String getTime() { return time; }
    public void setTime(String time) { this.time = time; }

    public String getRoom() {
        return room;
    }

    public void setRoom(String room) {
        this.room = room;
    }

    @Override
    public String toString() {
        return "Message{from='" + from + "', text='" + text + "', time='" + time + "'}";
    }
}