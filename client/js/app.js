// ======== КОНФИГУРАЦИЯ ========
const CONFIG = {
    WS_URL: 'http://localhost:8080/ws-support',
    RECONNECT_DELAY: 3000,
    MAX_RECONNECT_ATTEMPTS: 5
};

// ======== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ========
const AppState = {
    clientId: 'client_' + Math.random().toString(36).substr(2, 9),
    clientName: 'Клиент_' + Math.floor(Math.random() * 1000),
    stompClient: null,
    sessionId: null,
    currentTicketId: null,
    tickets: [],
    reconnectAttempts: 0,
    connected: false,
    typingTimer: null
};

// ======== ИНИЦИАЛИЗАЦИЯ ========
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM загружен, инициализация...');

    // Отображаем информацию о клиенте
    setElementText('clientName', AppState.clientName);
    setElementText('clientId', AppState.clientId);

    // Подключаемся к WebSocket
    connectWebSocket();

    // Загружаем историю обращений
    loadTickets();

    // Настраиваем обработчики
    setupEventListeners();
});

// Безопасная установка текста элемента
function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
    } else {
        console.warn(`Элемент с id "${id}" не найден`);
    }
}

// Безопасное добавление/удаление класса
function setElementClass(id, className, add = true) {
    const el = document.getElementById(id);
    if (el) {
        if (add) {
            el.classList.add(className);
        } else {
            el.classList.remove(className);
        }
    }
}

// ======== WEBSOCKET СОЕДИНЕНИЕ ========
function connectWebSocket() {
    updateConnectionStatus('connecting', 'Подключение...');

    const socket = new SockJS(CONFIG.WS_URL);
    AppState.stompClient = Stomp.over(socket);
    AppState.stompClient.debug = null; // Отключаем логи STOMP

    AppState.stompClient.connect({}, function(frame) {
        console.log('✅ WebSocket подключен');
        AppState.connected = true;
        AppState.reconnectAttempts = 0;
        updateConnectionStatus('connected', 'Подключен');

        // Получаем sessionId из URL
        extractSessionId(socket);

        // Подписываемся на персональные каналы
        subscribeToChannels();

        // Отправляем приветствие
        sendGreeting();

    }, function(error) {
        console.error('❌ Ошибка WebSocket:', error);
        handleDisconnect();
    });
}

function updateConnectionStatus(status, text) {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) {
        console.error('Элемент connectionStatus не найден в DOM');
        return;
    }

    // Удаляем все классы статусов
    statusEl.classList.remove('status-connected', 'status-disconnected', 'status-connecting');

    // Добавляем новый класс
    statusEl.classList.add(`status-${status}`);

    // Обновляем текст
    const statusTextEl = statusEl.querySelector('.status-text');
    if (statusTextEl) {
        statusTextEl.textContent = text;
    }

    // Обновляем точку
    const statusDotEl = statusEl.querySelector('.status-dot');
    if (statusDotEl) {
        statusDotEl.textContent = status === 'connected' ? '🟢' :
            status === 'connecting' ? '🟡' : '🔴';
    }
}

function extractSessionId(socket) {
    try {
        const url = socket._transport.url;
        // Правильно: берем предпоследний элемент (перед /websocket)
        const parts = url.split('/');
        const realSessionId = parts[parts.length - 2];

        console.log('🌐 Полный URL:', url);
        console.log('📦 server-id (для кластера):', parts[parts.length - 3]);
        console.log('🆔 Настоящий sessionId:', realSessionId);

        AppState.sessionId = realSessionId;
    } catch (e) {
        console.warn('Не удалось получить sessionId:', e);
    }
}

function subscribeToChannels() {
    if (!AppState.stompClient || !AppState.sessionId) return;

    // Персональный канал для сообщений
    AppState.stompClient.subscribe('/queue/support-user' + AppState.sessionId, function(message) {
        try {
            const msg = JSON.parse(message.body);
            handleIncomingMessage(msg);
        } catch (e) {
            console.error('Ошибка парсинга сообщения:', e);
        }
    });

    // Канал для индикатора печатания
    AppState.stompClient.subscribe('/queue/support/typing-user' + AppState.sessionId, function(message) {
        try {
            const msg = JSON.parse(message.body);
            handleTypingIndicator(msg);
        } catch (e) {
            console.error('Ошибка парсинга индикатора:', e);
        }
    });
}

function sendGreeting() {
    if (!AppState.stompClient || !AppState.connected) return;

    const greeting = {
        fromUserId: AppState.clientId,
        fromUserName: AppState.clientName,
        type: 'GREETING'
    };

    AppState.stompClient.send("/app/support.greet", {}, JSON.stringify(greeting));
}

function handleDisconnect() {
    AppState.connected = false;
    updateConnectionStatus('disconnected', 'Отключен');

    if (AppState.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
        AppState.reconnectAttempts++;
        console.log(`Попытка переподключения ${AppState.reconnectAttempts}...`);

        setTimeout(connectWebSocket, CONFIG.RECONNECT_DELAY);
    } else {
        showToast('Не удалось подключиться к серверу', 'error');
    }
}

// ======== ЗАГРУЗКА ДАННЫХ ========
function loadTickets() {
    // В реальном приложении здесь был бы REST запрос
    // Пока используем заглушку
    setTimeout(() => {
        // Здесь будут загруженные с сервера тикеты
        renderTicketsList();
    }, 500);
}

// ======== ОБРАБОТКА СООБЩЕНИЙ ========
function handleIncomingMessage(msg) {
    console.log('📨 Получено сообщение:', msg);

    switch(msg.type) {
        case 'TICKET_CREATED':
            handleTicketCreated(msg);
            break;
        case 'SUPPORT_JOINED':
            handleSupportJoined(msg);
            break;
        case 'CHAT':
            handleChatMessage(msg);
            break;
        case 'TICKET_CLOSED':
            handleTicketClosed(msg);
            break;
        case 'TICKET_ACCEPTED':
            handleTicketAccepted(msg);
            break;
        default:
            console.log('Неизвестный тип сообщения:', msg.type);
    }
}

function handleTicketCreated(msg) {
    // Создаем новый тикет в локальном состоянии
    const newTicket = {
        id: msg.ticketId,
        title: msg.text || 'Новое обращение',
        status: 'open',
        operator: null,
        operatorName: null,
        updatedAt: new Date().toISOString(),
        unread: 0,
        messages: []
    };

    AppState.tickets.unshift(newTicket);
    renderTicketsList();

    // Открываем созданный тикет
    openTicket(msg.ticketId);

    showToast('Обращение создано', 'success');
}

function handleSupportJoined(msg) {
    const ticket = AppState.tickets.find(t => t.id === msg.ticketId);
    if (ticket) {
        ticket.operator = msg.fromUserId;
        ticket.operatorName = msg.fromUserName;
        ticket.status = 'in-progress';

        // Добавляем системное сообщение
        addSystemMessageToTicket(ticket.id, `✅ Оператор ${msg.fromUserName} подключился`);

        if (AppState.currentTicketId === ticket.id) {
            updateCurrentTicket(ticket);
        }

        renderTicketsList();
        showToast(`Оператор ${msg.fromUserName} подключился`, 'success');
    }
}

function handleChatMessage(msg) {
    const ticket = AppState.tickets.find(t => t.id === msg.ticketId);
    if (!ticket) return;

    // Добавляем сообщение в историю
    if (!ticket.messages) ticket.messages = [];

    ticket.messages.push({
        id: ticket.messages.length + 1,
        sender: msg.fromUserId === AppState.clientId ? 'client' : 'support',
        operator: msg.fromUserId !== AppState.clientId ? msg.fromUserId : null,
        text: msg.text,
        time: msg.timestamp || new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    });

    ticket.updatedAt = new Date().toISOString();

    // Если это не текущий открытый тикет - увеличиваем счетчик непрочитанных
    if (AppState.currentTicketId !== ticket.id && msg.fromUserId !== AppState.clientId) {
        ticket.unread = (ticket.unread || 0) + 1;
    }

    if (AppState.currentTicketId === ticket.id) {
        renderMessages(ticket.messages, ticket.operator);
    }

    renderTicketsList();
}

function handleTicketClosed(msg) {
    const ticket = AppState.tickets.find(t => t.id === msg.ticketId);
    if (ticket) {
        ticket.status = 'closed';
        addSystemMessageToTicket(ticket.id, '🔒 Чат закрыт');

        if (AppState.currentTicketId === ticket.id) {
            updateCurrentTicket(ticket);
            const input = document.getElementById('messageInput');
            const btn = document.getElementById('sendButton');
            if (input) input.disabled = true;
            if (btn) btn.disabled = true;
        }

        renderTicketsList();
        showToast('Чат закрыт', 'info');
    }
}

function handleTicketAccepted(msg) {
    const ticket = AppState.tickets.find(t => t.id === msg.ticketId);
    if (ticket) {
        ticket.status = 'in-progress';

        if (AppState.currentTicketId === ticket.id) {
            updateCurrentTicket(ticket);
        }

        renderTicketsList();
    }
}

function handleTypingIndicator(msg) {
    if (msg.fromUserId === AppState.clientId) return;

    const typingEl = document.getElementById('typingIndicator');
    if (!typingEl) return;

    if (msg.text === 'stop') {
        typingEl.classList.add('hidden');
    } else {
        const typingOperator = document.getElementById('typingOperator');
        if (typingOperator) {
            typingOperator.textContent = msg.fromUserName;
        }
        typingEl.classList.remove('hidden');
    }
}

function addSystemMessageToTicket(ticketId, text) {
    const ticket = AppState.tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    if (!ticket.messages) ticket.messages = [];
    ticket.messages.push({
        id: ticket.messages.length + 1,
        sender: 'system',
        text: text,
        time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    });
}

// ======== ОТРИСОВКА ========
function renderTicketsList() {
    const container = document.getElementById('ticketsList');
    if (!container) return;

    container.innerHTML = '';

    // Сортируем по дате обновления
    const sortedTickets = [...AppState.tickets].sort((a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    sortedTickets.forEach(ticket => {
        const ticketEl = createTicketElement(ticket);
        container.appendChild(ticketEl);
    });

    setElementText('ticketCount', AppState.tickets.length);
}

function createTicketElement(ticket) {
    const ticketEl = document.createElement('div');
    ticketEl.className = `ticket-item ${ticket.id === AppState.currentTicketId ? 'active' : ''}`;
    ticketEl.onclick = () => openTicket(ticket.id);

    const statusText = getStatusText(ticket.status);
    const date = formatDate(ticket.updatedAt);

    const operatorHtml = ticket.operator
        ? `<div class="ticket-operator"><span>${ticket.operatorName}</span></div>`
        : '<div class="no-operator-badge"><span>⏳</span><span>Ожидание</span></div>';

    const unreadHtml = ticket.unread > 0
        ? `<span class="unread-indicator">${ticket.unread}</span>`
        : '';

    ticketEl.innerHTML = `
        <div class="ticket-header">
            <span class="ticket-status status-${ticket.status}">${statusText}</span>
            <div class="ticket-right-info">
                ${operatorHtml}
                ${unreadHtml}
            </div>
        </div>
        <div class="ticket-title">${ticket.title}</div>
        <div class="ticket-preview">${ticket.title}</div>
        <div class="ticket-meta">
            <span>#${ticket.id.substring(0, 8)}</span>
            <span>${date}</span>
        </div>
    `;

    return ticketEl;
}

function getStatusText(status) {
    const statusMap = {
        'open': '📝 Открыто',
        'in-progress': '💬 В работе',
        'closed': '✅ Закрыто',
        'waiting': '⏳ Ожидание'
    };
    return statusMap[status] || status;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString('ru', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
}

// ======== УПРАВЛЕНИЕ ТИКЕТАМИ ========
function openTicket(ticketId) {
    const ticket = AppState.tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    AppState.currentTicketId = ticketId;
    ticket.unread = 0;

    renderTicketsList();

    // Показываем чат, скрываем пустое состояние
    setElementClass('emptyState', 'hidden', true);
    setElementClass('activeChat', 'hidden', false);

    // Заполняем информацию
    setElementText('activeTicketTitle', ticket.title);
    setElementText('activeTicketId', `#${ticket.id.substring(0, 8)}`);
    setElementText('activeTicketStatus', getStatusText(ticket.status));

    const statusEl = document.getElementById('activeTicketStatus');
    if (statusEl) {
        statusEl.className = `chat-status status-${ticket.status}`;
    }

    // Обновляем информацию об операторе
    updateOperatorBadge(ticket);

    // *** ЕДИНСТВЕННОЕ ИЗМЕНЕНИЕ ***
    // Всегда разрешаем ввод, независимо от наличия оператора
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendButton');
    if (input) {
        input.disabled = false;  // Убрали условие ticket.operator
        // Меняем плейсхолдер в зависимости от ситуации
        input.placeholder = ticket.operator
            ? "Введите сообщение..."
            : "Оператор еще не подключен, но вы можете писать...";
    }
    if (btn) btn.disabled = false;  // Убрали условие ticket.operator

    // Отображаем сообщения
    renderMessages(ticket.messages || [], ticket.operator);
}

function updateOperatorBadge(ticket) {
    const badge = document.getElementById('operatorBadge');
    const avatar = document.getElementById('operatorAvatar');
    const nameSpan = document.getElementById('operatorName');

    if (!badge || !avatar || !nameSpan) return;

    if (ticket.operator) {
        badge.style.display = 'inline-flex';
        nameSpan.textContent = ticket.operatorName;
        avatar.textContent = ticket.operatorName.charAt(0);
        avatar.style.background = '#667eea';
        avatar.style.color = 'white';
    } else {
        badge.style.display = 'inline-flex';
        nameSpan.innerHTML = '<span class="waiting-operator">Ожидание оператора</span>';
        avatar.textContent = '⏳';
        avatar.style.background = '#fef3c7';
        avatar.style.color = '#92400e';
    }
}

function renderMessages(messages, currentOperator) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    container.innerHTML = '';

    if (!currentOperator && messages.length === 0) {
        container.appendChild(createSystemMessage(
            '⏳ Ожидание оператора',
            'Ваше обращение принято. Оператор подключится в ближайшее время.'
        ));
    }

    messages.forEach(msg => {
        container.appendChild(createMessageElement(msg));
    });

    container.scrollTop = container.scrollHeight;
}

function createMessageElement(msg) {
    const msgEl = document.createElement('div');

    if (msg.sender === 'system') {
        msgEl.className = 'message message-system';
        msgEl.innerHTML = `<div class="message-bubble">${msg.text}</div>`;
    } else {
        msgEl.className = `message message-${msg.sender}`;

        const senderName = msg.sender === 'client' ? 'Вы' : 'Оператор';
        msgEl.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${senderName}</span>
            </div>
            <div class="message-bubble">${msg.text}</div>
            <div class="message-time">${msg.time}</div>
        `;
    }

    return msgEl;
}

function createSystemMessage(title, text) {
    const div = document.createElement('div');
    div.className = 'message message-system';
    div.innerHTML = `<div class="message-bubble"><strong>${title}</strong><br>${text}</div>`;
    return div;
}

function updateCurrentTicket(ticket) {
    setElementText('activeTicketTitle', ticket.title);
    setElementText('activeTicketId', `#${ticket.id.substring(0, 8)}`);
    setElementText('activeTicketStatus', getStatusText(ticket.status));

    const statusEl = document.getElementById('activeTicketStatus');
    if (statusEl) {
        statusEl.className = `chat-status status-${ticket.status}`;
    }

    updateOperatorBadge(ticket);
    renderMessages(ticket.messages || [], ticket.operator);
}

// ======== СОЗДАНИЕ НОВОГО ОБРАЩЕНИЯ ========
function openNewTicketModal() {
    const modal = document.getElementById('newTicketModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeNewTicketModal() {
    const modal = document.getElementById('newTicketModal');
    if (modal) {
        modal.classList.remove('active');
    }
    setElementText('ticketTitle', '');
    setElementText('ticketDescription', '');
}

function createNewTicket() {
    const titleEl = document.getElementById('ticketTitle');
    const descEl = document.getElementById('ticketDescription');

    if (!titleEl || !descEl) return;

    const title = titleEl.value.trim();
    const description = descEl.value.trim();

    if (!title || !description) {
        showToast('Заполните все поля!', 'error');
        return;
    }

    if (!AppState.connected) {
        showToast('Нет подключения к серверу', 'error');
        return;
    }

    const message = {
        fromUserId: AppState.clientId,
        fromUserName: AppState.clientName,
        text: description,
        title: title
    };

    AppState.stompClient.send("/app/support.create", {}, JSON.stringify(message));

    closeNewTicketModal();
}

// ======== ОТПРАВКА СООБЩЕНИЯ ========
function setupEventListeners() {
    const sendButton = document.getElementById('sendButton');
    if (sendButton) {
        sendButton.onclick = sendMessage;
    }

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.onkeypress = handleMessageKeyPress;
        messageInput.oninput = handleTyping;
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input) return;

    const text = input.value.trim();

    if (!text || !AppState.currentTicketId || !AppState.connected) return;

    const message = {
        ticketId: AppState.currentTicketId,
        fromUserId: AppState.clientId,
        fromUserName: AppState.clientName,
        text: text,
        type: 'CHAT'
    };

    AppState.stompClient.send("/app/support.chat", {}, JSON.stringify(message));

    // Оптимистичное обновление
    const ticket = AppState.tickets.find(t => t.id === AppState.currentTicketId);
    if (ticket) {
        if (!ticket.messages) ticket.messages = [];
        ticket.messages.push({
            id: ticket.messages.length + 1,
            sender: 'client',
            text: text,
            time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
        });

        renderMessages(ticket.messages, ticket.operator);
    }

    input.value = '';
}

function handleMessageKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const btn = document.getElementById('sendButton');
        if (btn && !btn.disabled) btn.click();
    }
}

function handleTyping() {
    if (!AppState.stompClient || !AppState.connected || !AppState.currentTicketId) return;

    const ticket = AppState.tickets.find(t => t.id === AppState.currentTicketId);
    if (!ticket || !ticket.operator) return;

    AppState.stompClient.send("/app/support.typing", {}, JSON.stringify({
        ticketId: AppState.currentTicketId,
        fromUserId: AppState.clientId,
        fromUserName: AppState.clientName
    }));

    clearTimeout(AppState.typingTimer);
    AppState.typingTimer = setTimeout(() => {
        AppState.stompClient.send("/app/support.typing", {}, JSON.stringify({
            ticketId: AppState.currentTicketId,
            fromUserId: AppState.clientId,
            fromUserName: AppState.clientName,
            text: 'stop'
        }));
    }, 1000);
}

// ======== УВЕДОМЛЕНИЯ ========
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => toast.classList.remove('show'), 3000);
}