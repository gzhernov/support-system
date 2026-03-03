// ======== КОНФИГУРАЦИЯ ========
const CONFIG = {
    WS_URL: 'http://localhost:8080/ws-support',
    API_URL: 'http://localhost:8080/api',
    RECONNECT_DELAY: 3000,
    MAX_RECONNECT_ATTEMPTS: 5
};

// ======== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ========
const AppState = {
    operatorId: null,
    operatorName: null,
    stompClient: null,
    sessionId: null,
    currentTicketId: null,
    tickets: new Map(),
    queueTickets: new Map(),
    activeTickets: new Map(),
    closedTickets: new Map(),
    connected: false,
    available: true,
    currentTab: 'queue',
    typingTimer: null,
    sessionsInfo: new Map(),
    unreadMessages: new Map(),
    reconnectAttempts: 0
};

// ======== ИНИЦИАЛИЗАЦИЯ ========
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM загружен, инициализация...');

    // Загружаем список операторов
    loadOperators();

    // Настраиваем обработчики
    setupEventListeners();
});

// ======== ЗАГРУЗКА ОПЕРАТОРОВ ========
async function loadOperators() {
    const select = document.getElementById('operatorSelect');
    const operatorsStatus = document.getElementById('operatorsStatus');
    const loginBtn = document.getElementById('loginBtn');

    try {
        console.log('📡 Загрузка списка операторов...');

        const response = await fetch(`${CONFIG.API_URL}/operators`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const operators = await response.json();

        if (!operators || operators.length === 0) {
            throw new Error('Список операторов пуст');
        }

        console.log(`✅ Загружено ${operators.length} операторов`);

        // Очищаем select
        select.innerHTML = '<option value="">-- Выберите оператора --</option>';

        // Добавляем операторов
        operators.forEach(op => {
            const option = document.createElement('option');
            option.value = op.id;
            option.textContent = `${op.name} ${op.available ? '🟢' : '🔴'}`;
            select.appendChild(option);
        });

        // Обновляем статус
        if (operatorsStatus) {
            operatorsStatus.innerHTML = `
                <i class="fas fa-users"></i>
                <span>Доступно операторов: ${operators.length}</span>
            `;
            operatorsStatus.classList.remove('error');
        }

        // Активируем кнопку входа
        loginBtn.disabled = true; // Все еще ждем выбора оператора

    } catch (error) {
        console.error('❌ Ошибка загрузки операторов:', error);

        // Показываем ошибку в интерфейсе
        if (operatorsStatus) {
            operatorsStatus.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span class="error-text">Ошибка подключения к серверу</span>
            `;
            operatorsStatus.classList.add('error');
        }

        // Блокируем выбор и кнопку входа
        select.innerHTML = '<option value="">Сервер недоступен</option>';
        select.disabled = true;
        loginBtn.disabled = true;

        // Показываем уведомление
        showToast('Не удалось загрузить список операторов. Проверьте подключение к серверу.', 'error');
    }
}

function validateLoginForm() {
    const select = document.getElementById('operatorSelect');
    const loginBtn = document.getElementById('loginBtn');

    if (select && loginBtn) {
        // Проверяем, что select не отключен и выбран оператор
        loginBtn.disabled = select.disabled || !select.value;
    }
}

// ======== ОБРАБОТКА ВХОДА ========
async function handleLogin() {
    const select = document.getElementById('operatorSelect');
    const statusRadios = document.getElementsByName('initialStatus');
    const spinner = document.getElementById('loginSpinner');
    const loginBtn = document.getElementById('loginBtn');

    if (!select.value) {
        showToast('Выберите оператора', 'warning');
        return;
    }

    // Получаем выбранного оператора из текста опции
    const selectedOption = select.options[select.selectedIndex];
    const operatorName = selectedOption.textContent.split(' ')[0];

    // Получаем начальный статус
    let initialStatus = true;
    for (const radio of statusRadios) {
        if (radio.checked) {
            initialStatus = radio.value === 'available';
            break;
        }
    }

    // Устанавливаем состояние оператора
    AppState.operatorId = select.value;
    AppState.operatorName = operatorName;
    AppState.available = initialStatus;

    // Показываем спиннер и блокируем кнопку
    if (spinner) spinner.classList.remove('hidden');
    loginBtn.disabled = true;

    // Скрываем экран входа
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');

    // Обновляем информацию в шапке
    setElementText('operatorName', AppState.operatorName);
    setElementText('operatorId', AppState.operatorId);
    setElementText('operatorNameHeader', AppState.operatorName);

    // Обновляем статус в шапке
    updateOperatorStatusUI();

    // Подключаемся к WebSocket
    connectWebSocket();

    // *** ВАЖНО: Загружаем историю тикетов ***
    await loadTicketsHistory();

    // Запускаем обновление статистики
    startStatsUpdates();

    // Скрываем спиннер
    if (spinner) spinner.classList.add('hidden');

    showToast(`Добро пожаловать, ${AppState.operatorName}!`, 'success');
}

function logout() {
    // Отключаем WebSocket
    if (AppState.stompClient && AppState.connected) {
        AppState.stompClient.disconnect();
    }

    // Очищаем состояние
    AppState.operatorId = null;
    AppState.operatorName = null;
    AppState.currentTicketId = null;
    AppState.tickets.clear();
    AppState.queueTickets.clear();
    AppState.activeTickets.clear();
    AppState.closedTickets.clear();
    AppState.unreadMessages.clear();
    AppState.connected = false;

    // Возвращаемся к экрану входа
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');

    // Сбрасываем форму, но сохраняем загруженных операторов
    const select = document.getElementById('operatorSelect');
    if (select) {
        select.value = '';
        select.disabled = false; // Включаем обратно, если был отключен
    }

    const spinner = document.getElementById('loginSpinner');
    if (spinner) spinner.classList.add('hidden');

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.disabled = true;

    showToast('Вы вышли из системы', 'info');
}

function updateOperatorStatusUI() {
    const statusDot = document.querySelector('#operatorStatus .status-dot');
    const statusText = document.getElementById('operatorStatusText');
    const toggleBtn = document.getElementById('toggleStatusBtn');

    if (AppState.available) {
        if (statusDot) statusDot.textContent = '🟢';
        if (statusText) statusText.textContent = 'Свободен';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fas fa-pause"></i> Занять себя';
            toggleBtn.classList.remove('busy');
        }
    } else {
        if (statusDot) statusDot.textContent = '🔴';
        if (statusText) statusText.textContent = 'Занят';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i class="fas fa-play"></i> Освободиться';
            toggleBtn.classList.add('busy');
        }
    }
}

// ======== WEBSOCKET СОЕДИНЕНИЕ ========
function connectWebSocket() {
    updateConnectionStatus('connecting', 'Подключение...');

    try {
        const socket = new SockJS(CONFIG.WS_URL);
        AppState.stompClient = Stomp.over(socket);
        AppState.stompClient.debug = null;

        AppState.stompClient.connect({}, function(frame) {
            console.log('✅ WebSocket подключен');
            AppState.connected = true;
            AppState.reconnectAttempts = 0;
            updateConnectionStatus('connected', 'Подключен');

            extractSessionId(socket);
            subscribeToChannels();
            sendGreeting();

        }, function(error) {
            console.error('❌ Ошибка WebSocket:', error);
            handleDisconnect();
        });
    } catch (error) {
        console.error('❌ Ошибка создания WebSocket:', error);
        handleDisconnect();
    }
}

function updateConnectionStatus(status, text) {
    const statusEl = document.getElementById('operatorStatus');
    if (!statusEl) return;

    const statusDot = statusEl.querySelector('.status-dot');
    const statusText = statusEl.querySelector('.status-text');

    if (statusDot) {
        statusDot.textContent = status === 'connected' ? '🟢' :
            status === 'connecting' ? '🟡' : '🔴';
    }
    if (statusText) {
        statusText.textContent = text;
    }
}

function extractSessionId(socket) {
    try {
        const url = socket._transport.url;
        const parts = url.split('/');
        const realSessionId = parts[parts.length - 2];
        AppState.sessionId = realSessionId;
        console.log('🆔 Session ID:', realSessionId);
    } catch (e) {
        console.warn('Не удалось получить sessionId:', e);
    }
}

function subscribeToChannels() {
    if (!AppState.stompClient || !AppState.sessionId) return;

    console.log('📡 Подписка на каналы с sessionId:', AppState.sessionId);

    // Персональный канал оператора
    AppState.stompClient.subscribe('/queue/support-user' + AppState.sessionId, function(message) {
        try {
            const msg = JSON.parse(message.body);
            console.log('📨 Получено сообщение в личный канал:', msg);
            handleIncomingMessage(msg);
        } catch (e) {
            console.error('Ошибка парсинга сообщения:', e);
        }
    });

    // Канал для индикатора печатания
    AppState.stompClient.subscribe('/queue/support/typing-user' + AppState.sessionId, function(message) {
        try {
            const msg = JSON.parse(message.body);
            console.log('✏️ Индикатор печатания:', msg);
            handleTypingIndicator(msg);
        } catch (e) {
            console.error('Ошибка парсинга индикатора:', e);
        }
    });

    // Канал для очереди (новые тикеты)
    AppState.stompClient.subscribe('/topic/support/queue', function(message) {
        try {
            const msg = JSON.parse(message.body);
            console.log('🆕 Обновление очереди:', msg);
            handleQueueUpdate(msg);
            handleNewTicket(msg);
        } catch (e) {
            console.error('Ошибка парсинга очереди:', e);
        }
    });
}

function sendGreeting() {
    if (!AppState.stompClient || !AppState.connected) return;

    const greeting = {
        fromUserId: AppState.operatorId,
        fromUserName: AppState.operatorName,
        type: 'GREETING'
    };

    AppState.stompClient.send("/app/support.greet", {}, JSON.stringify(greeting));
    console.log('👋 Приветствие отправлено');
}

function handleDisconnect() {
    AppState.connected = false;
    updateConnectionStatus('disconnected', 'Отключен');

    if (AppState.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
        AppState.reconnectAttempts++;
        console.log(`Попытка переподключения ${AppState.reconnectAttempts}...`);
        setTimeout(connectWebSocket, CONFIG.RECONNECT_DELAY);
    } else {
        showToast('Не удалось подключиться к серверу. Проверьте соединение.', 'error');
    }
}

// ======== ЗАГРУЗКА НАЧАЛЬНЫХ ДАННЫХ ========
async function loadInitialData() {
    try {
        // Здесь будет загрузка истории через REST API
        // Пока просто инициализируем пустые списки
        updateStats();
        renderTicketsList();
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
    }
}

// ======== ОБРАБОТКА СООБЩЕНИЙ ========
function handleIncomingMessage(msg) {
    console.log('📨 Получено сообщение:', msg);

    switch(msg.type) {
        case 'TICKET_CREATED':
            handleNewTicket(msg);
            break;
        case 'TICKET_ACCEPTED':
            handleTicketAccepted(msg);
            break;
        case 'CHAT':
            handleChatMessage(msg);
            break;
        case 'TICKET_CLOSED':
            handleTicketClosed(msg);
            break;
        case 'SUPPORT_JOINED':
            handleSupportJoined(msg);
            break;
        default:
            console.log('Неизвестный тип:', msg.type);
    }
}

function handleNewTicket(msg) {
    console.log('🆕 Новый тикет:', msg);

    if (!msg.ticketId) {
        console.error('❌ Сообщение не содержит ticketId:', msg);
        return;
    }

    const ticket = {
        id: msg.ticketId,
        clientId: msg.fromUserId,
        clientName: msg.fromUserName || 'Клиент',
        title: msg.text ? msg.text.substring(0, 50) : 'Новое обращение',
        status: 'OPEN',
        createdAt: new Date().toISOString(),
        messages: msg.text ? [{
            sender: 'client',
            text: msg.text,
            time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
        }] : [],
        unread: 1,
        clientSessions: msg.clientSessions || 1
    };

    AppState.queueTickets.set(ticket.id, ticket);
    AppState.tickets.set(ticket.id, ticket);

    renderTicketsList();
    updateStats();

    showToast(`🆕 Новый запрос от ${ticket.clientName}`, 'info');

    if (AppState.available) {
        document.getElementById('takeNextBtn')?.classList.add('pulse');
    }

    playNotificationSound();
}

function handleTicketAccepted(msg) {
    console.log('✅ Тикет принят:', msg);

    const ticket = AppState.tickets.get(msg.ticketId);
    if (!ticket) return;

    AppState.queueTickets.delete(ticket.id);
    ticket.status = 'IN_PROGRESS';
    ticket.supportId = AppState.operatorId;
    ticket.supportName = AppState.operatorName;
    ticket.acceptedAt = new Date().toISOString();
    AppState.activeTickets.set(ticket.id, ticket);

    addSystemMessage(ticket.id, `✅ Вы приняли запрос`);

    if (AppState.currentTicketId === ticket.id) {
        updateCurrentTicket(ticket);

        const input = document.getElementById('messageInput');
        const btn = document.getElementById('sendButton');
        if (input) {
            input.disabled = false;
            input.focus();
        }
        if (btn) btn.disabled = false;
    }

    renderTicketsList();
    updateStats();
    showToast(`✅ Запрос принят`, 'success');
}

function handleChatMessage(msg) {
    console.log('💬 Чат сообщение:', msg);

    const ticket = AppState.tickets.get(msg.ticketId);
    if (!ticket) return;

    if (!ticket.messages) ticket.messages = [];

    ticket.messages.push({
        id: ticket.messages.length + 1,
        sender: 'client',
        text: msg.text,
        time: msg.timestamp || new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }),
        sessionId: msg.sessionId
    });

    if (AppState.currentTicketId !== ticket.id) {
        ticket.unread = (ticket.unread || 0) + 1;
        AppState.unreadMessages.set(ticket.id, ticket.unread);
    }

    if (AppState.currentTicketId === ticket.id) {
        renderMessages(ticket.messages);
    }

    renderTicketsList();
    updateStats();
    playNotificationSound();
}

function handleTicketClosed(msg) {
    console.log('🔒 Тикет закрыт:', msg);

    const ticket = AppState.tickets.get(msg.ticketId);
    if (!ticket) return;

    AppState.activeTickets.delete(ticket.id);
    ticket.status = 'CLOSED';
    ticket.closedAt = new Date().toISOString();
    AppState.closedTickets.set(ticket.id, ticket);

    addSystemMessage(ticket.id, '🔒 Чат закрыт');

    if (AppState.currentTicketId === ticket.id) {
        setElementClass('emptyState', 'hidden', false);
        setElementClass('activeChat', 'hidden', true);
        AppState.currentTicketId = null;
    }

    renderTicketsList();
    updateStats();
    showToast('🔒 Чат закрыт', 'info');
}

function handleSupportJoined(msg) {
    console.log('👥 Оператор подключился:', msg);

    const ticket = AppState.tickets.get(msg.ticketId);
    if (ticket) {
        addSystemMessage(ticket.id, `👨‍💼 ${msg.fromUserName} подключился`);

        if (AppState.currentTicketId === ticket.id) {
            renderMessages(ticket.messages);
        }
    }
}

function handleTypingIndicator(msg) {
    if (msg.fromUserId === AppState.operatorId) return;

    const typingEl = document.getElementById('typingIndicator');
    if (!typingEl) return;

    if (msg.text === 'stop') {
        typingEl.classList.add('hidden');
    } else {
        const typingClient = document.getElementById('typingClient');
        if (typingClient) {
            typingClient.textContent = msg.fromUserName || 'Клиент';
        }
        typingEl.classList.remove('hidden');

        setTimeout(() => {
            typingEl.classList.add('hidden');
        }, 3000);
    }
}

function handleQueueUpdate(msg) {
    console.log('📊 Обновление очереди:', msg);
    updateStats();
}

function addSystemMessage(ticketId, text) {
    const ticket = AppState.tickets.get(ticketId);
    if (!ticket) return;

    if (!ticket.messages) ticket.messages = [];
    ticket.messages.push({
        id: ticket.messages.length + 1,
        sender: 'system',
        text: text,
        time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    });

    if (AppState.currentTicketId === ticketId) {
        renderMessages(ticket.messages);
    }
}

// ======== ОТРИСОВКА ТИКЕТОВ ========
function renderTicketsList() {
    const container = document.getElementById('ticketsList');
    if (!container) return;

    container.innerHTML = '';

    let ticketsToShow = [];

    switch (AppState.currentTab) {
        case 'queue':
            ticketsToShow = Array.from(AppState.queueTickets.values());
            break;
        case 'active':
            ticketsToShow = Array.from(AppState.activeTickets.values());
            break;
        case 'closed':
            ticketsToShow = Array.from(AppState.closedTickets.values());
            break;
        case 'all':
            ticketsToShow = Array.from(AppState.tickets.values());
            break;
    }

    ticketsToShow.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (ticketsToShow.length === 0) {
        container.innerHTML = '<div class="empty-list">Нет обращений</div>';
    } else {
        ticketsToShow.forEach(ticket => {
            container.appendChild(createTicketElement(ticket));
        });
    }

    setElementText('queueTabBadge', AppState.queueTickets.size);
    setElementText('activeTabBadge', AppState.activeTickets.size);
    setElementText('closedTabBadge', AppState.closedTickets.size);
}

function createTicketElement(ticket) {
    const ticketEl = document.createElement('div');
    ticketEl.className = `ticket-item ${getTicketClassByStatus(ticket.status)} ${ticket.id === AppState.currentTicketId ? 'active' : ''}`;
    ticketEl.onclick = (e) => {
        if (!e.target.closest('.ticket-details-btn')) {
            openTicket(ticket.id);
        }
    };

    const statusText = getStatusText(ticket.status);
    const timeAgo = getTimeAgo(ticket.createdAt);

    const unreadHtml = ticket.unread > 0
        ? `<span class="unread-badge">${ticket.unread}</span>`
        : '';

    const detailsBtn = ticket.status !== 'CLOSED'
        ? `<button class="ticket-details-btn" onclick="event.stopPropagation(); showTicketDetails('${ticket.id}')">
             <i class="fas fa-info-circle"></i>
           </button>`
        : '';

    ticketEl.innerHTML = `
        <div class="ticket-header">
            <span class="ticket-status status-${ticket.status}">${statusText}</span>
            <div class="ticket-header-actions">
                ${unreadHtml}
                ${detailsBtn}
            </div>
        </div>
        <div class="client-info">
            <span class="client-avatar-small">${ticket.clientName?.charAt(0) || '👤'}</span>
            <span class="client-name">${ticket.clientName || 'Клиент'}</span>
            <span class="client-sessions-badge">
                <i class="fas fa-globe"></i> ${ticket.clientSessions || 1}
            </span>
        </div>
        <div class="ticket-title">${ticket.title || 'Обращение'}</div>
        <div class="ticket-meta">
            <span class="ticket-time-badge">
                <i class="far fa-clock"></i> ${timeAgo}
            </span>
            <span>#${ticket.id?.substring(0, 6) || 'новый'}</span>
        </div>
    `;

    return ticketEl;
}

function getTicketClassByStatus(status) {
    switch(status) {
        case 'OPEN': return 'queue-item';
        case 'IN_PROGRESS': return 'active-item';
        case 'CLOSED': return 'closed-item';
        default: return '';
    }
}

function getStatusText(status) {
    const statusMap = {
        'OPEN': '📝 В очереди',
        'IN_PROGRESS': '💬 В работе',
        'CLOSED': '✅ Закрыто'
    };
    return statusMap[status] || status;
}

function getTimeAgo(dateString) {
    if (!dateString) return 'только что';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} ч назад`;
    return `${Math.floor(diffHours / 24)} д назад`;
}

// ======== УПРАВЛЕНИЕ ТИКЕТАМИ ========
function takeNextTicket() {
    if (!AppState.available) {
        showToast('Вы заняты. Сначала освободитесь', 'warning');
        return;
    }

    if (AppState.queueTickets.size === 0) {
        showToast('Очередь пуста', 'info');
        return;
    }

    const message = {
        fromUserId: AppState.operatorId,
        fromUserName: AppState.operatorName,
        type: 'ACCEPT_TICKET'
    };

    AppState.stompClient.send("/app/support.accept", {}, JSON.stringify(message));
    console.log('📞 Отправлен запрос на принятие тикета');
}

function openTicket(ticketId) {
    const ticket = AppState.tickets.get(ticketId);
    if (!ticket) return;

    AppState.currentTicketId = ticketId;
    ticket.unread = 0;
    AppState.unreadMessages.delete(ticketId);

    renderTicketsList();

    setElementClass('emptyState', 'hidden', true);
    setElementClass('activeChat', 'hidden', false);

    setElementText('activeTicketTitle', ticket.title || 'Обращение');
    setElementText('activeTicketId', `#${ticket.id?.substring(0, 8) || 'новый'}`);
    setElementText('clientName', ticket.clientName || 'Клиент');
    setElementText('activeTicketTime', `открыт: ${formatTime(ticket.createdAt)}`);

    const statusEl = document.getElementById('activeTicketStatus');
    if (statusEl) {
        statusEl.className = `chat-status status-${ticket.status}`;
        statusEl.textContent = getStatusText(ticket.status);
    }

    const clientAvatar = document.getElementById('clientAvatar');
    if (clientAvatar) {
        clientAvatar.textContent = ticket.clientName?.charAt(0) || '👤';
    }

    const sessionsCount = document.getElementById('clientSessionsCount');
    if (sessionsCount) {
        sessionsCount.textContent = ticket.clientSessions || 1;
    }

    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendButton');
    const closeBtn = document.getElementById('closeTicketBtn');

    if (ticket.status === 'CLOSED') {
        if (input) input.disabled = true;
        if (btn) btn.disabled = true;
        if (closeBtn) closeBtn.disabled = true;
    } else {
        if (input) {
            input.disabled = false;
            input.focus();
        }
        if (btn) btn.disabled = false;
        if (closeBtn) closeBtn.disabled = false;
    }

    renderMessages(ticket.messages || []);

    // Загружаем сообщения для этого тикета
    loadTicketMessages(ticketId);
}

function closeCurrentTicket() {
    if (!AppState.currentTicketId) return;

    if (!confirm('Закрыть текущий чат?')) return;

    const message = {
        ticketId: AppState.currentTicketId,
        fromUserId: AppState.operatorId,
        fromUserName: AppState.operatorName,
        type: 'CLOSE_TICKET'
    };

    AppState.stompClient.send("/app/support.close", {}, JSON.stringify(message));
    console.log('🔒 Отправлен запрос на закрытие тикета');
}

function renderMessages(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    container.innerHTML = '';

    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="no-messages">Нет сообщений. Напишите первое сообщение.</div>';
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
        msgEl.innerHTML = `
            <div class="message-bubble">
                ${msg.text}
                <div class="message-time">${msg.time}</div>
            </div>
        `;
    } else {
        msgEl.className = `message message-${msg.sender}`;

        const senderName = msg.sender === 'client' ? 'Клиент' : 'Вы';
        const sessionHtml = msg.sessionId
            ? `<span class="message-session" title="ID сессии">📱 ${msg.sessionId.substring(0,6)}</span>`
            : '';

        msgEl.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${senderName}</span>
                ${sessionHtml}
            </div>
            <div class="message-bubble">${msg.text}</div>
            <div class="message-time">${msg.time}</div>
        `;
    }

    return msgEl;
}

function updateCurrentTicket(ticket) {
    setElementText('activeTicketTitle', ticket.title || 'Обращение');
    setElementText('clientName', ticket.clientName || 'Клиент');

    const statusEl = document.getElementById('activeTicketStatus');
    if (statusEl) {
        statusEl.className = `chat-status status-${ticket.status}`;
        statusEl.textContent = getStatusText(ticket.status);
    }

    renderMessages(ticket.messages || []);
}

function formatTime(dateString) {
    if (!dateString) return '--:--';
    return new Date(dateString).toLocaleTimeString('ru', {
        hour: '2-digit', minute: '2-digit'
    });
}

// ======== ОТПРАВКА СООБЩЕНИЙ ========
function setupEventListeners() {
    const sendButton = document.getElementById('sendButton');
    if (sendButton) sendButton.onclick = sendMessage;

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', handleMessageKeyPress);
        messageInput.addEventListener('input', handleTyping);
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeTicketDetailsModal();
        }
    });

    const takeNextBtn = document.getElementById('takeNextBtn');
    if (takeNextBtn) takeNextBtn.onclick = takeNextTicket;
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text || !AppState.currentTicketId || !AppState.connected) return;

    const message = {
        ticketId: AppState.currentTicketId,
        fromUserId: AppState.operatorId,
        fromUserName: AppState.operatorName,
        text: text,
        type: 'CHAT'
    };

    AppState.stompClient.send("/app/support.chat", {}, JSON.stringify(message));
    console.log('📤 Отправлено сообщение:', text);

    const ticket = AppState.tickets.get(AppState.currentTicketId);
    if (ticket) {
        if (!ticket.messages) ticket.messages = [];
        ticket.messages.push({
            id: ticket.messages.length + 1,
            sender: 'support',
            text: text,
            time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
        });

        renderMessages(ticket.messages);
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

    AppState.stompClient.send("/app/support.typing", {}, JSON.stringify({
        ticketId: AppState.currentTicketId,
        fromUserId: AppState.operatorId,
        fromUserName: AppState.operatorName
    }));

    clearTimeout(AppState.typingTimer);

    AppState.typingTimer = setTimeout(() => {
        AppState.stompClient.send("/app/support.typing", {}, JSON.stringify({
            ticketId: AppState.currentTicketId,
            fromUserId: AppState.operatorId,
            fromUserName: AppState.operatorName,
            text: 'stop'
        }));
    }, 1000);
}

// ======== УПРАВЛЕНИЕ СОСТОЯНИЕМ ОПЕРАТОРА ========
function toggleOperatorStatus() {
    AppState.available = !AppState.available;
    updateOperatorStatusUI();
    showToast(AppState.available ? 'Вы снова свободны' : 'Вы заняты', 'info');
}

// ======== УПРАВЛЕНИЕ ТАБАМИ ========
function switchTab(tabName) {
    AppState.currentTab = tabName;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    renderTicketsList();
}

// ======== МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ ========
function showTicketDetails(ticketId) {
    const ticket = AppState.tickets.get(ticketId);
    if (!ticket) return;

    setElementText('detailTicketId', ticket.id);
    setElementText('detailClientName', ticket.clientName);
    setElementText('detailClientId', ticket.clientId);
    setElementText('detailStatus', getStatusText(ticket.status));
    setElementText('detailCreatedAt', ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : '-');
    setElementText('detailAcceptedAt', ticket.acceptedAt ? new Date(ticket.acceptedAt).toLocaleString() : '-');
    setElementText('detailMessagesCount', ticket.messages?.length || 0);
    setElementText('detailClientSessions', ticket.clientSessions || 1);

    document.getElementById('ticketDetailsModal').classList.add('active');
}

function closeTicketDetailsModal() {
    document.getElementById('ticketDetailsModal').classList.remove('active');
}

// ======== СТАТИСТИКА ========
function updateStats() {
    setElementText('queueCount', AppState.queueTickets.size);
    setElementText('activeCount', AppState.activeTickets.size);
    setElementText('closedCount', AppState.closedTickets.size);
    setElementText('sessionsCount', AppState.sessionsInfo.size);
    setElementText('nextTicketBadge', AppState.queueTickets.size);
}

function startStatsUpdates() {
    setInterval(() => {
        updateStats();
    }, 5000);
}

// ======== УВЕДОМЛЕНИЯ ========
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;
    toast.className = `toast show ${type}`;

    if (toastIcon) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };
        toastIcon.className = `fas ${icons[type] || 'fa-info-circle'}`;
    }

    setTimeout(() => toast.classList.remove('show'), 3000);
}

function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (e) {
        console.log('Аудио уведомления не поддерживаются');
    }
}

// ======== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ========
function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setElementClass(id, className, add = true) {
    const el = document.getElementById(id);
    if (el) {
        if (add) el.classList.add(className);
        else el.classList.remove(className);
    }
}


// ======== ЗАГРУЗКА ИСТОРИИ ТИКЕТОВ ========
async function loadTicketsHistory() {
    try {
        // Загружаем существующие тикеты из очереди
        const queueResponse = await fetch(`${CONFIG.API_URL}/tickets/queue`);
        if (queueResponse.ok) {
            const queueTickets = await queueResponse.json();
            queueTickets.forEach(ticket => {
                const formattedTicket = formatTicketFromServer(ticket);
                AppState.queueTickets.set(ticket.id, formattedTicket);
                AppState.tickets.set(ticket.id, formattedTicket);
            });
        }

        // Загружаем активные тикеты
        const activeResponse = await fetch(`${CONFIG.API_URL}/tickets/active`);
        if (activeResponse.ok) {
            const activeTickets = await activeResponse.json();
            activeTickets.forEach(ticket => {
                const formattedTicket = formatTicketFromServer(ticket);
                AppState.activeTickets.set(ticket.id, formattedTicket);
                AppState.tickets.set(ticket.id, formattedTicket);
            });
        }

        renderTicketsList();
        updateStats();

    } catch (error) {
        console.error('❌ Ошибка загрузки истории:', error);
    }
}

// Форматирование тикета с сервера в формат клиента
function formatTicketFromServer(ticket) {
    return {
        id: ticket.id,
        clientId: ticket.clientId,
        clientName: ticket.clientName,
        supportId: ticket.supportId,
        supportName: ticket.supportName,
        title: ticket.subject || 'Обращение',
        status: ticket.status,
        createdAt: ticket.createdAt,
        acceptedAt: ticket.acceptedAt,
        closedAt: ticket.closedAt,
        messages: [], // Сообщения нужно загружать отдельно
        unread: 0,
        clientSessions: 1
    };
}

// Загрузка сообщений для конкретного тикета
async function loadTicketMessages(ticketId) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/tickets/${ticketId}/messages`);
        if (response.ok) {
            const messages = await response.json();
            const ticket = AppState.tickets.get(ticketId);
            if (ticket) {
                ticket.messages = messages.map(msg => ({
                    id: msg.id,
                    sender: msg.fromUserId === ticket.clientId ? 'client' : 'support',
                    text: msg.text,
                    time: msg.timestamp,
                    sessionId: msg.sessionId
                }));

                if (AppState.currentTicketId === ticketId) {
                    renderMessages(ticket.messages);
                }
            }
        }
    } catch (error) {
        console.error(`❌ Ошибка загрузки сообщений для тикета ${ticketId}:`, error);
    }
}

// ======== ЭКСПОРТ ФУНКЦИЙ ДЛЯ ГЛОБАЛЬНОГО ИСПОЛЬЗОВАНИЯ ========
window.toggleOperatorStatus = toggleOperatorStatus;
window.takeNextTicket = takeNextTicket;
window.switchTab = switchTab;
window.showTicketDetails = showTicketDetails;
window.closeTicketDetailsModal = closeTicketDetailsModal;
window.closeCurrentTicket = closeCurrentTicket;
window.handleLogin = handleLogin;
window.validateLoginForm = validateLoginForm;
window.logout = logout;