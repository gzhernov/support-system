# Исправленная версия с поддерживаемым образом Java
# Этап сборки
FROM maven:3.8.4-eclipse-temurin-17 AS build
WORKDIR /app

# Копируем файлы проекта
COPY pom.xml .
COPY src ./src

# Собираем приложение
RUN mvn clean package -DskipTests

# Этап запуска - используем готовый JRE образ для минимального размера
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Копируем собранный jar из этапа сборки
COPY --from=build /app/target/*.jar app.jar

# Создаем непривилегированного пользователя для безопасности
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

# Порт, который будет использовать приложение
EXPOSE 8080

# Команда для запуска приложения
ENTRYPOINT ["java", "-jar", "app.jar"]