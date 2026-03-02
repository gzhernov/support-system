// ======== КОНФИГУРАЦИЯ ========
const CONFIG = {
    WS_URL: 'http://localhost:8080/ws-support',
    API_URL: 'http://localhost:8080/api',
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
    typingTimer: null,
    currentClientTab: 'current' // 'current', 'archived', 'all'
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
    loadTicketsHistory();

    // Настраиваем обработчики
    setupEventListeners();

    // Устанавливаем активную вкладку
    switchClientTab('current');
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
    AppState.stompClient.debug = null;

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
        const parts = url.split('/');
        const realSessionId = parts[parts.length - 2];

        console.log('🌐 Полный URL:', url);
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

// ======== ЗАГРУЗКА ИСТОРИИ ТИКЕТОВ ========
// ======== ЗАГРУЗКА ИСТОРИИ ТИКЕТОВ ========
async function loadTicketsHistory() {
    try {
        console.log('📡 Загрузка истории тикетов...');

        // Загружаем текущие тикеты (открытые и в работе)
        const currentResponse = await fetch(`${CONFIG.API_URL}/tickets/client/${AppState.clientId}/current`);

        if (!currentResponse.ok) {
            throw new Error(`HTTP error! status: ${currentResponse.status}`);
        }

        const currentTickets = await currentResponse.json();
        console.log(`✅ Загружено ${currentTickets.length} текущих тикетов`);

        // Загружаем архивные тикеты (закрытые)
        const archivedResponse = await fetch(`${CONFIG.API_URL}/tickets/client/${AppState.clientId}/archived`);

        if (!archivedResponse.ok) {
            throw new Error(`HTTP error! status: ${archivedResponse.status}`);
        }

        const archivedTickets = await archivedResponse.json();
        console.log(`✅ Загружено ${archivedTickets.length} архивных тикетов`);

        // Объединяем все тикеты
        const allTickets = [...currentTickets, ...archivedTickets];

        // Преобразуем серверные тикеты в формат клиента
        AppState.tickets = allTickets.map(ticket => ({
            id: ticket.id,
            title: ticket.subject || 'Обращение',
            status: mapServerStatus(ticket.status),
            operator: ticket.supportId,
            operatorName: ticket.supportName,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt || ticket.createdAt,
            unread: 0,
            messages: []
        }));

        renderTicketsList();
        updateTabBadges();

    } catch (error) {
        console.error('❌ Ошибка загрузки истории тикетов:', error);
        showToast('Не удалось загрузить историю обращений', 'error');
    }
}

// Загрузка сообщений для конкретного тикета
async function loadTicketMessages(ticketId) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/tickets/${ticketId}/messages`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const messages = await response.json();
        console.log(`✅ Загружено ${messages.length} сообщений для тикета ${ticketId}`);

        const ticket = AppState.tickets.find(t => t.id === ticketId);
        if (ticket) {
            ticket.messages = messages.map(msg => ({
                id: msg.id,
                sender: msg.fromUserId === AppState.clientId ? 'client' : 'support',
                operator: msg.fromUserId !== AppState.clientId ? msg.fromUserId : null,
                text: msg.text,
                time: msg.timestamp
            }));

            if (AppState.currentTicketId === ticketId) {
                renderMessages(ticket.messages, ticket.operator);
            }
        }

    } catch (error) {
        console.error(`❌ Ошибка загрузки сообщений для тикета ${ticketId}:`, error);
    }
}

function mapServerStatus(serverStatus) {
    const statusMap = {
        'OPEN': 'open',
        'IN_PROGRESS': 'in-progress',
        'CLOSED': 'closed'
    };
    return statusMap[serverStatus] || 'open';
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
        title: msg.title || 'Новое обращение',
        status: 'open',
        operator: null,
        operatorName: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        unread: 0,
        messages: []
    };

    // Добавляем первое сообщение если есть
    if (msg.text) {
        newTicket.messages.push({
            id: 1,
            sender: 'client',
            text: msg.text,
            time: msg.timestamp || new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
        });
    }

    AppState.tickets.unshift(newTicket);
    renderTicketsList();
    updateTabBadges();

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

            // Активируем поле ввода
            const input = document.getElementById('messageInput');
            const btn = document.getElementById('sendButton');
            if (input) {
                input.disabled = false;
                input.placeholder = "Введите сообщение...";
            }
            if (btn) btn.disabled = false;
        }

        renderTicketsList();
        updateTabBadges();
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
    updateTabBadges();
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
            if (input) {
                input.disabled = true;
                input.placeholder = "Чат закрыт";
            }
            if (btn) btn.disabled = true;
        }

        renderTicketsList();
        updateTabBadges();
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
        updateTabBadges();
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

        // Автоматически скрываем через 3 секунды
        setTimeout(() => {
            typingEl.classList.add('hidden');
        }, 3000);
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

// ======== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ========
function switchClientTab(tabName) {
    AppState.currentClientTab = tabName;

    // Обновляем активный класс у кнопок
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    renderTicketsList();
}

// ======== ОТРИСОВКА ========
function renderTicketsList() {
    const container = document.getElementById('ticketsList');
    if (!container) return;

    container.innerHTML = '';

    // Фильтруем тикеты в зависимости от выбранной вкладки
    let ticketsToShow = [];

    switch (AppState.currentClientTab) {
        case 'current':
            // Текущие: открытые и в работе
            ticketsToShow = AppState.tickets.filter(ticket => ticket.status !== 'closed');
            break;
        case 'archived':
            // Архивные: только закрытые
            ticketsToShow = AppState.tickets.filter(ticket => ticket.status === 'closed');
            break;
        case 'all':
        default:
            // Все тикеты
            ticketsToShow = [...AppState.tickets];
            break;
    }

    // Сортируем по дате обновления (новые сверху)
    ticketsToShow.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    if (ticketsToShow.length === 0) {
        container.innerHTML = '<div class="empty-list">Нет обращений</div>';
    } else {
        ticketsToShow.forEach(ticket => {
            container.appendChild(createTicketElement(ticket));
        });
    }

    // Обновляем счетчик тикетов
    setElementText('ticketCount', AppState.tickets.length);
}

function createTicketElement(ticket) {
    const ticketEl = document.createElement('div');

    // Добавляем класс для архивных тикетов
    const isArchived = ticket.status === 'closed';
    ticketEl.className = `ticket-item ${isArchived ? 'archived' : ''} ${ticket.id === AppState.currentTicketId ? 'active' : ''}`;
    ticketEl.onclick = () => openTicket(ticket.id);

    const statusText = getStatusText(ticket.status);
    const date = formatDate(ticket.updatedAt || ticket.createdAt);

    const operatorHtml = ticket.operator
        ? `<div class="ticket-operator"><span class="operator-avatar">${ticket.operatorName?.charAt(0) || '👤'}</span><span>${ticket.operatorName || 'Оператор'}</span></div>`
        : '<div class="no-operator-badge"><span>⏳</span><span>Ожидание</span></div>';

    const unreadHtml = ticket.unread > 0 && !isArchived
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
        <div class="ticket-title">${ticket.title || 'Обращение'}</div>
        <div class="ticket-preview">${ticket.title || 'Нет описания'}</div>
        <div class="ticket-meta">
            <span>#${ticket.id?.substring(0, 8) || 'новый'}</span>
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
    if (!dateString) return 'только что';
    return new Date(dateString).toLocaleString('ru', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
}

// ======== ОБНОВЛЕНИЕ БЕЙДЖЕЙ ========
function updateTabBadges() {
    const currentCount = AppState.tickets.filter(t => t.status !== 'closed').length;
    const archivedCount = AppState.tickets.filter(t => t.status === 'closed').length;

    setElementText('currentTabBadge', currentCount);
    setElementText('archivedTabBadge', archivedCount);
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

    // Обновляем статус
    const statusEl = document.getElementById('activeTicketStatus');
    if (statusEl) {
        statusEl.className = `chat-status ${getChatStatusClass(ticket.status)}`;
        statusEl.textContent = getStatusText(ticket.status);
    }

    // Обновляем информацию об операторе
    updateOperatorBadge(ticket);

    // Управление полем ввода
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendButton');

    if (input && btn) {
        const isClosed = ticket.status === 'closed';
        input.disabled = isClosed;
        btn.disabled = isClosed;
        input.placeholder = isClosed
            ? "Чат закрыт"
            : (ticket.operator ? "Введите сообщение..." : "Оператор еще не подключен, но вы можете писать...");
    }

    // Загружаем сообщения для этого тикета
    loadTicketMessages(ticketId);
}

function getChatStatusClass(status) {
    if (status === 'open') return 'status-waiting';
    if (status === 'in-progress') return 'status-active';
    if (status === 'closed') return 'status-closed';
    return 'status-waiting';
}

function updateOperatorBadge(ticket) {
    const badge = document.getElementById('operatorBadge');
    const avatar = document.getElementById('operatorAvatar');
    const nameSpan = document.getElementById('operatorName');

    if (!badge || !avatar || !nameSpan) return;

    if (ticket.operator) {
        badge.style.display = 'inline-flex';
        nameSpan.textContent = ticket.operatorName;
        avatar.textContent = ticket.operatorName?.charAt(0) || '👤';
        avatar.style.background = '#3498db';
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

    if (messages.length === 0) {
        if (!currentOperator) {
            container.appendChild(createSystemMessage(
                '⏳ Ожидание оператора',
                'Ваше обращение принято. Оператор подключится в ближайшее время.'
            ));
        } else {
            container.innerHTML = '<div class="no-messages">Нет сообщений. Напишите первое сообщение.</div>';
        }
    } else {
        messages.forEach(msg => {
            container.appendChild(createMessageElement(msg));
        });
    }

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

    // Обновляем статус
    const statusEl = document.getElementById('activeTicketStatus');
    if (statusEl) {
        statusEl.className = `chat-status ${getChatStatusClass(ticket.status)}`;
        statusEl.textContent = getStatusText(ticket.status);
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
    document.getElementById('ticketTitle').value = '';
    document.getElementById('ticketDescription').value = '';
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
        messageInput.addEventListener('keypress', handleMessageKeyPress);
        messageInput.addEventListener('input', handleTyping);
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