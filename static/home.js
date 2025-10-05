// --- Modern Triton Connectra Home JS ---
const socket = io();
const chatApp = document.getElementById('chat-app');
const userList = document.getElementById('user-list');
let currentUser = document.querySelector('.home-user') ? document.querySelector('.home-user').textContent.replace('@', '') : 'user';
let users = [];
let activeChat = null;
let currentChatType = 'global'; // 'global' or 'dm'
let currentChatPartner = null;
let userChats = [];
let typingUsers = new Set();

// Socket connection events
socket.on('connect', () => {
    console.log('Connected to server');
    // Join user's personal room for DM notifications
    socket.emit('join_chat', { chat_id: currentUser });
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

// Render user list with avatars, status, and click-to-chat
function renderUserList() {
    userList.innerHTML = '';
    users.forEach(u => {
        const li = document.createElement('li');
        li.className = 'user-row';
        li.innerHTML = `
            <span class="profile-thumb" style="background: #eee;">
                ${u.avatar ? `<img src="/avatars/${u.avatar}" alt="Avatar" class="profile-thumb-img">` : (u.display_name ? u.display_name[0].toUpperCase() : u.username[0].toUpperCase())}
            </span>
            <span class="user-info">
                <b>${u.display_name}</b><br>
                <span class="user-at">@${u.username}</span>
            </span>
            <span class="status-dot ${u.online ? 'online' : 'offline'}"></span>
        `;
        li.onclick = () => openChat(u.username);
        userList.appendChild(li);
    });
}

// Fetch users from API
async function fetchUsers() {
    const res = await fetch('/api/users');
    users = await res.json();
    renderUserList();
}

// Chat UI rendering
function renderChatHeader(user) {
    return `
        <header class="chat-header">
            <span class="profile-thumb" style="background: #eee;">
                ${user.avatar ? `<img src="/avatars/${user.avatar}" alt="Avatar" class="profile-thumb-img">` : (user.display_name ? user.display_name[0].toUpperCase() : user.username[0].toUpperCase())}
            </span>
            <span class="user-info">
                <b>${user.display_name}</b><br>
                <span class="user-at">@${user.username}</span>
            </span>
        </header>
    `;
}

function renderMessages(messages) {
    return messages.map(msg => renderSingleMessage(msg)).join('');
}

function renderSingleMessage(msg) {
    const user = users.find(u => u.id === msg.user_id) || users.find(u => u.username === msg.username) || {};
    let attachmentHtml = '';

    if (msg.attachments && msg.attachments.length > 0) {
        attachmentHtml = msg.attachments.map(att => {
            if (att.type === 'image') {
                return `<div class="attachment image-attachment">
                    <img src="/uploads/${att.stored_filename}" alt="${att.filename}" onclick="openImageModal(this.src)">
                </div>`;
            } else if (att.type === 'video') {
                return `<div class="attachment video-attachment">
                    <video controls>
                        <source src="/uploads/${att.stored_filename}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                </div>`;
            } else {
                return `<div class="attachment file-attachment">
                    <i class="fas fa-file"></i>
                    <a href="/uploads/${att.stored_filename}" download="${att.filename}">${att.filename}</a>
                </div>`;
            }
        }).join('');
    }

    // Format timestamp
    let timeDisplay = 'now';
    if (msg.timestamp) {
        const msgTime = new Date(msg.timestamp);
        const now = new Date();
        const diffMinutes = Math.floor((now - msgTime) / (1000 * 60));

        if (diffMinutes < 1) {
            timeDisplay = 'now';
        } else if (diffMinutes < 60) {
            timeDisplay = `${diffMinutes}m ago`;
        } else if (diffMinutes < 1440) {
            timeDisplay = `${Math.floor(diffMinutes / 60)}h ago`;
        } else {
            timeDisplay = msgTime.toLocaleDateString();
        }
    }

    return `
        <div class="message" data-message-id="${msg.id}">
            <span class="profile-thumb" style="background: #eee;">
                ${user.avatar ? `<img src="/avatars/${user.avatar}" alt="Avatar" class="profile-thumb-img">` : (user.display_name ? user.display_name[0].toUpperCase() : user.username ? user.username[0].toUpperCase() : '?')}
            </span>
            <div class="message-content">
                <div class="user-info">
                    <b>${user.display_name || user.username || msg.username || 'User'}</b>
                    <span class="user-at">@${user.username || msg.username || ''}</span>
                    <span class="timestamp">${timeDisplay}</span>
                </div>
                <div class="msg-text">${msg.content}</div>
                ${attachmentHtml}
            </div>
        </div>
    `;
}

// Toggle user directory
function toggleUserDirectory() {
    const directory = document.getElementById('user-directory');
    if (directory.style.display === 'none' || !directory.style.display) {
        directory.style.display = 'flex';
    } else {
        directory.style.display = 'none';
    }
}

// Filter users in directory
function filterUsers() {
    const searchTerm = document.getElementById('user-search').value.toLowerCase();
    const userRows = document.querySelectorAll('.directory-user-row');

    userRows.forEach(row => {
        const userName = row.querySelector('.user-info b').textContent.toLowerCase();
        const userHandle = row.querySelector('.user-at').textContent.toLowerCase();

        if (userName.includes(searchTerm) || userHandle.includes(searchTerm)) {
            row.style.display = 'flex';
        } else {
            row.style.display = 'none';
        }
    });
}

// Switch between tabs
function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab-btn');
    const globalSection = document.getElementById('global-users');
    const dmSection = document.getElementById('dm-list');

    tabs.forEach(t => t.classList.remove('active'));

    if (tab === 'global') {
        document.querySelector('.tab-btn').classList.add('active');
        globalSection.style.display = 'block';
        dmSection.style.display = 'none';
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        globalSection.style.display = 'none';
        dmSection.style.display = 'block';
        loadRecentChats();
    }
}

// Open direct message with a user
async function openDirectMessage(username, displayName, avatar, isOnline) {
    // Leave current chat room if any
    if (activeChat) {
        socket.emit('leave_chat', { chat_id: activeChat });
    }

    currentChatType = 'dm';
    currentChatPartner = username;

    // Create normalized chat ID
    const participants = [currentUser, username].sort();
    activeChat = `dm_${participants[0].toLowerCase().replace(' ', '_')}_${participants[1].toLowerCase().replace(' ', '_')}`;

    try {
        // Create or get DM chat from server
        const response = await fetch('/api/create_dm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                participant: username
            })
        });

        if (response.ok) {
            const data = await response.json();
            activeChat = data.chat_id;

            // Join the chat room for real-time updates
            socket.emit('join_chat', { chat_id: activeChat });

            // Fetch and render the chat
            await fetchDirectMessage();

            // Add to recent chats
            addToRecentChats(username, displayName, avatar, isOnline);
        }
    } catch (error) {
        console.error('Error creating DM:', error);
    }
}

// Open chat (global or specific)
function openChat(chatId) {
    // Leave current chat room if any
    if (activeChat) {
        socket.emit('leave_chat', { chat_id: activeChat });
    }

    if (chatId === 'global') {
        currentChatType = 'global';
        currentChatPartner = null;
        activeChat = 'global';

        // Join global chat room
        socket.emit('join_chat', { chat_id: activeChat });
        fetchChat();
    } else {
        // Handle other chat types if needed
        activeChat = chatId;
        socket.emit('join_chat', { chat_id: activeChat });
        fetchChat();
    }
}

// Fetch direct message chat
async function fetchDirectMessage() {
    try {
        const response = await fetch(`/api/dm/${activeChat}`);
        if (response.ok) {
            const chat = await response.json();
            renderDirectMessageChat(chat);
        }
    } catch (error) {
        console.error('Error fetching DM:', error);
    }
}

// Render direct message chat
function renderDirectMessageChat(chat) {
    const otherParticipant = chat.participants.find(p => p !== currentUser);
    const otherUser = users.find(u => u.username === otherParticipant) || {
        username: otherParticipant,
        display_name: otherParticipant,
        avatar: null,
        online: false
    };

    chatApp.innerHTML = `
        <header class="chat-header dm-header">
            <span class="profile-thumb" style="background: #eee;">
                ${otherUser.avatar ? `<img src="/photos/${otherUser.avatar}" alt="Avatar" class="profile-thumb-img">` : otherUser.display_name[0].toUpperCase()}
            </span>
            <div class="user-info">
                <b>${otherUser.display_name}</b>
                <span class="user-at">@${otherUser.username}</span>
                <span class="user-status ${otherUser.online ? 'online' : 'offline'}">
                    ${otherUser.online ? 'Online' : 'Offline'}
                </span>
            </div>
            <div class="chat-actions">
                <button class="action-btn" title="User Profile">
                    <i class="fas fa-user"></i>
                </button>
                <button class="action-btn" title="Call">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="action-btn" title="Video Call">
                    <i class="fas fa-video"></i>
                </button>
            </div>
        </header>
        <main id="chat-window">
            ${renderMessages(chat.messages)}
            <div id="typing-indicator" style="display: none;">
                <div class="typing-message">
                    <span class="typing-dots">
                        <span></span><span></span><span></span>
                    </span>
                    <span class="typing-text">Someone is typing...</span>
                </div>
            </div>
        </main>
        <form id="chat-form" autocomplete="off" enctype="multipart/form-data">
            <div class="chat-input-container">
                <input type="file" id="file-input" accept="image/*,video/*,.pdf,.doc,.docx,.txt" style="display: none;">
                <button type="button" id="file-btn" title="Attach file">
                    <i class="fas fa-paperclip"></i>
                </button>
                <input type="text" id="chat-input" placeholder="Type a message to ${otherUser.display_name}...">
                <button type="submit" id="send-btn">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </form>
    `;

    const chatWindow = document.getElementById('chat-window');
    chatWindow.scrollTop = chatWindow.scrollHeight;
    setupChatForm();
}

// Fetch and render chat
async function fetchChat() {
    if (currentChatType === 'dm') {
        // For DM, we use local storage for now
        const messages = directMessages[activeChat] ? directMessages[activeChat].messages : [];
        const user = users.find(u => u.username === currentChatPartner) || {};
        renderDirectMessageChat(currentChatPartner, user.display_name || currentChatPartner, user.avatar, user.online);
        return;
    }

    const res = await fetch('/api/chats');
    const chats = await res.json();
    const chat = chats.find(c => c.id === activeChat);
    if (!chat) return;
    const user = users.find(u => u.username === currentUser) || {};

    chatApp.innerHTML = `
        ${renderChatHeader(user)}
        <main id="chat-window">${renderMessages(chat.messages)}</main>
        <form id="chat-form" autocomplete="off" enctype="multipart/form-data">
            <div class="chat-input-container">
                <input type="file" id="file-input" accept="image/*,video/*,.pdf,.doc,.docx,.txt" style="display: none;">
                <button type="button" id="file-btn" title="Attach file">
                    <i class="fas fa-paperclip"></i>
                </button>
                <input type="text" id="chat-input" placeholder="Type a message...">
                <button type="submit" id="send-btn">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </form>
    `;

    const chatWindow = document.getElementById('chat-window');
    chatWindow.scrollTop = chatWindow.scrollHeight;
    setupChatForm();
}

// Setup chat form handlers
function setupChatForm() {
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');

    form.onsubmit = sendMessage;

    // Setup typing indicators
    let typingTimer;
    input.addEventListener('input', () => {
        socket.emit('typing', { chat_id: activeChat });
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            socket.emit('stop_typing', { chat_id: activeChat });
        }, 1000);
    });

    // Setup file upload
    document.getElementById('file-btn').onclick = () => {
        document.getElementById('file-input').click();
    };

    document.getElementById('file-input').onchange = (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            sendMessageWithFile(file);
        }
    };
}

// Socket event handlers for real-time updates
socket.on('new_message', (data) => {
    console.log('🔥 REAL-TIME MESSAGE RECEIVED:', data);

    // Check if message is for current chat
    if (data.chat_id === activeChat) {
        console.log('✅ Adding message to current chat');
        // Add message to current chat instantly
        addMessageToChat(data.message);
    } else {
        console.log('📱 Message for different chat:', data.chat_id, 'vs current:', activeChat);
    }

    // Update recent chats list
    loadUserChats();

    // Show browser notification for messages not in current chat
    if (data.chat_id !== activeChat && data.message.username !== currentUser) {
        // Determine notification type
        const isDirectMessage = data.chat_id.includes('dm_') || data.chat_id.startsWith('direct_');
        const isMention = data.message.mentions && data.message.mentions.includes(currentUser);

        if (window.connectraNotifications) {
            if (isMention) {
                connectraNotifications.showIfNeeded('mention', data.message.username, data.message.raw_content || data.message.content, data.chat_id);
            } else if (isDirectMessage) {
                connectraNotifications.showIfNeeded('direct_message', data.message.username, data.message.raw_content || data.message.content, data.chat_id);
            } else {
                // Group message
                const chatName = getChatName(data.chat_id);
                connectraNotifications.showIfNeeded('group_message', data.message.username, data.message.raw_content || data.message.content, chatName, data.chat_id);
            }
        }

        // Fallback in-app notification
        showNotification(`New message from ${data.message.username || 'Someone'}`);
    }
});

// Handle mention notifications
socket.on('mention_notification', (data) => {
    console.log('📢 MENTION NOTIFICATION:', data);

    // Show browser notification for mention
    if (window.connectraNotifications) {
        connectraNotifications.showMention(data.from_user, data.message, data.chat_id);
    }

    // Show in-app mention notification
    showMentionNotification(data.from_user, data.message);

    // Play mention sound (if enabled)
    playMentionSound();
});

// Show mention notification
function showMentionNotification(fromUser, message) {
    const notification = document.createElement('div');
    notification.className = 'mention-notification';
    notification.innerHTML = `
        <div class="mention-header">
            <i class="fas fa-at"></i>
            <strong>${fromUser}</strong> mentioned you
        </div>
        <div class="mention-content">${message}</div>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);

    // Click to dismiss
    notification.onclick = () => notification.remove();
}

// Play mention sound
function playMentionSound() {
    // Create audio element for mention sound
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
    audio.volume = 0.3;
    audio.play().catch(() => {}); // Ignore errors if audio fails
}

// Add message to current chat display
function addMessageToChat(message) {
    console.log('🎯 Adding message to chat UI:', message);
    const chatWindow = document.getElementById('chat-window');
    if (!chatWindow) {
        console.log('❌ No chat window found');
        return;
    }

    // Check if message already exists (prevent duplicates)
    const existingMessage = chatWindow.querySelector(`[data-message-id="${message.id}"]`);
    if (existingMessage) {
        console.log('⚠️ Message already exists, skipping');
        return;
    }

    // Remove typing indicator if present
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.style.display = 'none';
    }

    // Create message element
    const messageHtml = renderSingleMessage(message);
    const messageDiv = document.createElement('div');
    messageDiv.innerHTML = messageHtml;

    // Insert before typing indicator if it exists, otherwise append
    if (typingIndicator) {
        chatWindow.insertBefore(messageDiv.firstElementChild, typingIndicator);
    } else {
        chatWindow.appendChild(messageDiv.firstElementChild);
    }

    // Scroll to bottom with smooth animation
    chatWindow.scrollTo({
        top: chatWindow.scrollHeight,
        behavior: 'smooth'
    });

    console.log('✅ Message added to UI successfully');
}

// Show notification
function showNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Connectra', {
            body: message,
            icon: '/favicon.ico'
        });
    }
}

socket.on('user_status', (data) => {
    // Update user online status
    const user = users.find(u => u.username === data.username);
    if (user) {
        user.online = data.online;
        renderUserList();
    }
});

socket.on('user_typing', (data) => {
    if (data.chat_id === activeChat) {
        typingUsers.add(data.username);
        showTypingIndicator();
    }
});

socket.on('user_stop_typing', (data) => {
    if (data.chat_id === activeChat) {
        typingUsers.delete(data.username);
        if (typingUsers.size === 0) {
            hideTypingIndicator();
        }
    }
});

function showTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'block';
        const chatWindow = document.getElementById('chat-window');
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// @ Mention autocomplete functionality
let mentionDropdown = null;
let mentionStartPos = -1;

function setupMentionAutocomplete() {
    const input = document.getElementById('chat-input');
    if (!input) return;

    input.addEventListener('input', handleMentionInput);
    input.addEventListener('keydown', handleMentionKeydown);
}

function handleMentionInput(e) {
    const input = e.target;
    const value = input.value;
    const cursorPos = input.selectionStart;

    // Find @ symbol before cursor
    const beforeCursor = value.substring(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
        const afterAt = beforeCursor.substring(atIndex + 1);

        // Check if we're in a mention (no spaces after @)
        if (!afterAt.includes(' ') && afterAt.length >= 0) {
            mentionStartPos = atIndex;
            showMentionDropdown(afterAt, input);
        } else {
            hideMentionDropdown();
        }
    } else {
        hideMentionDropdown();
    }
}

function handleMentionKeydown(e) {
    if (mentionDropdown && mentionDropdown.style.display !== 'none') {
        const items = mentionDropdown.querySelectorAll('.mention-item');
        const selected = mentionDropdown.querySelector('.mention-item.selected');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = selected ? selected.nextElementSibling : items[0];
            if (next) {
                if (selected) selected.classList.remove('selected');
                next.classList.add('selected');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = selected ? selected.previousElementSibling : items[items.length - 1];
            if (prev) {
                if (selected) selected.classList.remove('selected');
                prev.classList.add('selected');
            }
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            if (selected) {
                selectMention(selected.dataset.username);
            }
        } else if (e.key === 'Escape') {
            hideMentionDropdown();
        }
    }
}

function showMentionDropdown(query, input) {
    // Filter users based on query
    const filteredUsers = users.filter(user =>
        user.username.toLowerCase().includes(query.toLowerCase()) &&
        user.username !== currentUser
    );

    if (filteredUsers.length === 0) {
        hideMentionDropdown();
        return;
    }

    // Create or update dropdown
    if (!mentionDropdown) {
        mentionDropdown = document.createElement('div');
        mentionDropdown.className = 'mention-dropdown';
        document.body.appendChild(mentionDropdown);
    }

    mentionDropdown.innerHTML = filteredUsers.map(user => `
        <div class="mention-item" data-username="${user.username}">
            <div class="mention-avatar">
                ${user.avatar ? `<img src="/photos/${user.avatar}" alt="Avatar">` : '<i class="fas fa-user-circle"></i>'}
            </div>
            <div class="mention-info">
                <div class="mention-name">${user.display_name}</div>
                <div class="mention-username">@${user.username}</div>
            </div>
        </div>
    `).join('');

    // Position dropdown
    const rect = input.getBoundingClientRect();
    mentionDropdown.style.left = rect.left + 'px';
    mentionDropdown.style.top = (rect.top - mentionDropdown.offsetHeight - 5) + 'px';
    mentionDropdown.style.display = 'block';

    // Add click handlers
    mentionDropdown.querySelectorAll('.mention-item').forEach(item => {
        item.onclick = () => selectMention(item.dataset.username);
    });
}

function selectMention(username) {
    const input = document.getElementById('chat-input');
    const value = input.value;
    const beforeMention = value.substring(0, mentionStartPos);
    const afterCursor = value.substring(input.selectionStart);

    input.value = beforeMention + `@${username} ` + afterCursor;
    input.focus();

    // Set cursor position after mention
    const newPos = beforeMention.length + username.length + 2;
    input.setSelectionRange(newPos, newPos);

    hideMentionDropdown();
}

function hideMentionDropdown() {
    if (mentionDropdown) {
        mentionDropdown.style.display = 'none';
    }
    mentionStartPos = -1;
}

// Send message
async function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const content = input.value.trim();
    if (!content) return;

    console.log('📤 Sending message:', content, 'to chat:', activeChat);

    // Hide mention dropdown if open
    hideMentionDropdown();

    // Clear input immediately for better UX
    input.value = '';

    // Show sending state
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    sendBtn.disabled = true;

    try {
        const response = await fetch('/api/send_message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                chat_id: activeChat,
                content: content
            })
        });

        if (response.ok) {
            // Stop typing indicator
            socket.emit('stop_typing', { chat_id: activeChat });

            // Message will be added via WebSocket event, no need to refresh
            console.log('✅ Message sent successfully');
        } else {
            // If failed, restore the message in input
            input.value = content;
            console.error('❌ Failed to send message');
        }
    } catch (error) {
        console.error('💥 Error sending message:', error);
        // Restore message in input on error
        input.value = content;
    } finally {
        // Restore send button
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        sendBtn.disabled = false;
    }
}

// Send message with file
async function sendMessageWithFile(file) {
    try {
        const formData = new FormData();
        formData.append('chat_id', activeChat);
        formData.append('file', file);
        formData.append('content', ''); // Empty content, will be set by server

        const response = await fetch('/api/send_message', {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            // Reset file input
            document.getElementById('file-input').value = '';

            // Message will be added via WebSocket event, no need to refresh
            console.log('File sent successfully');
        }
    } catch (error) {
        console.error('Error sending file:', error);
    }
}

// Real-time updates
socket.on('receive_message', data => {
    if (data.room === activeChat) fetchChat();
});

// Add to recent chats
function addToRecentChats(username, displayName, avatar, isOnline) {
    const recentChats = document.getElementById('recent-chats');

    // Check if chat already exists
    const existingChat = document.querySelector(`[data-username="${username}"]`);
    if (existingChat) {
        // Move to top
        recentChats.insertBefore(existingChat, recentChats.firstChild);
        return;
    }

    const chatItem = document.createElement('li');
    chatItem.className = 'user-row recent-chat';
    chatItem.setAttribute('data-username', username);
    chatItem.onclick = () => openDirectMessage(username, displayName, avatar, isOnline);

    chatItem.innerHTML = `
        <span class="profile-thumb" style="background: #eee;">
            ${avatar ? `<img src="/photos/${avatar}" alt="Avatar" class="profile-thumb-img">` : displayName[0].toUpperCase()}
        </span>
        <span class="user-info">
            <b>${displayName}</b><br>
            <span class="user-at">@${username}</span>
        </span>
        <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
        <div class="unread-indicator" style="display: none;">
            <span class="unread-count">1</span>
        </div>
    `;

    recentChats.insertBefore(chatItem, recentChats.firstChild);
}

// Load user chats from server
async function loadUserChats() {
    try {
        const response = await fetch('/api/user_chats');
        if (response.ok) {
            userChats = await response.json();
            renderRecentChats();
        }
    } catch (error) {
        console.error('Error loading user chats:', error);
    }
}

// Render recent chats
function renderRecentChats() {
    const recentChats = document.getElementById('recent-chats');
    const dmChats = userChats.filter(chat => chat.type === 'direct');

    if (dmChats.length === 0) {
        recentChats.innerHTML = `
            <li class="no-chats">
                <div class="no-chats-content">
                    <i class="fas fa-comment-slash"></i>
                    <p>No recent chats</p>
                    <small>Click on a user to start chatting</small>
                </div>
            </li>
        `;
        return;
    }

    recentChats.innerHTML = dmChats.map(chat => {
        const otherUser = chat.other_user;
        const lastMessage = chat.last_message;

        return `
            <li class="user-row recent-chat" onclick="openDirectMessage('${otherUser.username}', '${otherUser.display_name}', '${otherUser.avatar || ''}', ${otherUser.online})">
                <span class="profile-thumb" style="background: #eee;">
                    ${otherUser.avatar ? `<img src="/photos/${otherUser.avatar}" alt="Avatar" class="profile-thumb-img">` : otherUser.display_name[0].toUpperCase()}
                </span>
                <div class="user-info">
                    <b>${otherUser.display_name}</b>
                    <span class="user-at">@${otherUser.username}</span>
                    ${lastMessage ? `<div class="last-message">${lastMessage.content.substring(0, 30)}${lastMessage.content.length > 30 ? '...' : ''}</div>` : ''}
                </div>
                <span class="status-dot ${otherUser.online ? 'online' : 'offline'}"></span>
                ${chat.unread_count > 0 ? `<div class="unread-indicator"><span class="unread-count">${chat.unread_count}</span></div>` : ''}
            </li>
        `;
    }).join('');
}

// Load recent chats (legacy function for compatibility)
function loadRecentChats() {
    loadUserChats();
}

// Image modal for viewing images
function openImageModal(src) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <img src="${src}" alt="Full size image">
        </div>
    `;
    document.body.appendChild(modal);

    modal.onclick = (e) => {
        if (e.target === modal || e.target.className === 'close-modal') {
            document.body.removeChild(modal);
        }
    };
}

// Get chat display name
function getChatName(chatId) {
    if (chatId === 'global') return 'Global Chat';
    if (chatId.startsWith('dm_') || chatId.startsWith('direct_')) {
        // Extract other user's name from DM chat ID
        const parts = chatId.split('_');
        const otherUser = parts.find(part => part !== currentUser);
        return otherUser || 'Direct Message';
    }
    return chatId;
}

// Request notification permission
function requestNotificationPermission() {
    if (window.connectraNotifications && connectraNotifications.permission === 'default') {
        // Show permission dialog after a short delay
        setTimeout(() => {
            connectraNotifications.showPermissionDialog();
        }, 5000);
    }
}

// Initial load
async function initializeApp() {
    console.log('🚀 Initializing Connectra app...');

    // Request notification permission
    requestNotificationPermission();

    await fetchUsers();
    await loadUserChats();

    // Set up mention autocomplete
    setupMentionAutocomplete();

    // Set up periodic updates
    setInterval(fetchUsers, 10000); // Update users every 10 seconds
    setInterval(loadUserChats, 30000); // Update chats every 30 seconds

    console.log('✅ Connectra app initialized successfully');
}

// Start the app
initializeApp();
