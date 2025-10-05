// Connectra Push Notifications System
class ConnectraNotifications {
    constructor() {
        this.permission = 'default';
        this.isSupported = 'Notification' in window;
        this.init();
    }

    async init() {
        if (!this.isSupported) {
            console.log('Browser notifications not supported');
            return;
        }

        // Check current permission
        this.permission = Notification.permission;
        
        // Auto-request permission on first visit
        if (this.permission === 'default') {
            await this.requestPermission();
        }

        console.log('Notification permission:', this.permission);
    }

    async requestPermission() {
        if (!this.isSupported) return false;

        try {
            this.permission = await Notification.requestPermission();
            
            if (this.permission === 'granted') {
                this.showWelcomeNotification();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }

    showWelcomeNotification() {
        this.show('Connectra Notifications Enabled! 🎉', {
            body: 'You\'ll now receive notifications for direct messages and mentions.',
            icon: '/favicon.ico',
            tag: 'welcome'
        });
    }

    show(title, options = {}) {
        if (!this.isSupported || this.permission !== 'granted') {
            console.log('Cannot show notification - permission not granted');
            return null;
        }

        const defaultOptions = {
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            vibrate: [200, 100, 200],
            requireInteraction: false,
            silent: false,
            timestamp: Date.now(),
            actions: [
                {
                    action: 'reply',
                    title: 'Reply',
                    icon: '/favicon.ico'
                },
                {
                    action: 'view',
                    title: 'View Chat',
                    icon: '/favicon.ico'
                }
            ]
        };

        const finalOptions = { ...defaultOptions, ...options };

        try {
            const notification = new Notification(title, finalOptions);
            
            // Auto-close after 10 seconds
            setTimeout(() => {
                notification.close();
            }, 10000);

            // Handle notification clicks
            notification.onclick = () => {
                window.focus();
                notification.close();
                
                // If there's a chat_id in the options, open that chat
                if (options.data && options.data.chat_id) {
                    if (typeof joinChat === 'function') {
                        joinChat(options.data.chat_id);
                    }
                }
            };

            return notification;
        } catch (error) {
            console.error('Error showing notification:', error);
            return null;
        }
    }

    showDirectMessage(fromUser, message, chatId) {
        return this.show(`💬 New message from ${fromUser}`, {
            body: message.length > 100 ? message.substring(0, 100) + '...' : message,
            tag: `dm-${chatId}`,
            data: { chat_id: chatId, type: 'direct_message' },
            actions: [
                {
                    action: 'reply',
                    title: 'Reply',
                    icon: '/favicon.ico'
                },
                {
                    action: 'view',
                    title: 'View Chat',
                    icon: '/favicon.ico'
                }
            ]
        });
    }

    showMention(fromUser, message, chatId) {
        return this.show(`📢 ${fromUser} mentioned you`, {
            body: message.length > 100 ? message.substring(0, 100) + '...' : message,
            tag: `mention-${chatId}`,
            data: { chat_id: chatId, type: 'mention' },
            actions: [
                {
                    action: 'reply',
                    title: 'Reply',
                    icon: '/favicon.ico'
                },
                {
                    action: 'view',
                    title: 'View Chat',
                    icon: '/favicon.ico'
                }
            ]
        });
    }

    showGroupMessage(fromUser, message, chatName, chatId) {
        return this.show(`💬 ${chatName}`, {
            body: `${fromUser}: ${message.length > 80 ? message.substring(0, 80) + '...' : message}`,
            tag: `group-${chatId}`,
            data: { chat_id: chatId, type: 'group_message' }
        });
    }

    // Check if user is currently active (to avoid showing notifications when they're already chatting)
    isUserActive() {
        return document.hasFocus() && document.visibilityState === 'visible';
    }

    // Show notification only if user is not active or not in the specific chat
    showIfNeeded(type, ...args) {
        // Always show notifications for mentions
        if (type === 'mention') {
            return this.showMention(...args);
        }

        // For direct messages, show if user is not active or not in that specific chat
        if (type === 'direct_message') {
            const [fromUser, message, chatId] = args;
            if (!this.isUserActive() || (window.activeChat && window.activeChat !== chatId)) {
                return this.showDirectMessage(fromUser, message, chatId);
            }
        }

        // For group messages, only show if user is not active
        if (type === 'group_message') {
            if (!this.isUserActive()) {
                return this.showGroupMessage(...args);
            }
        }

        return null;
    }

    // Request permission with a nice UI
    async showPermissionDialog() {
        if (this.permission === 'granted') {
            return true;
        }

        // Create a nice permission dialog
        const dialog = document.createElement('div');
        dialog.className = 'notification-permission-dialog';
        dialog.innerHTML = `
            <div class="permission-content">
                <div class="permission-header">
                    <i class="fas fa-bell"></i>
                    <h3>Enable Notifications</h3>
                </div>
                <p>Get notified when you receive direct messages and mentions, even when Connectra is in the background.</p>
                <div class="permission-actions">
                    <button class="btn-secondary" onclick="this.closest('.notification-permission-dialog').remove()">
                        Maybe Later
                    </button>
                    <button class="btn-primary" onclick="connectraNotifications.handlePermissionRequest(this)">
                        <i class="fas fa-bell"></i> Enable Notifications
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        return false;
    }

    async handlePermissionRequest(button) {
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enabling...';
        button.disabled = true;

        const granted = await this.requestPermission();
        
        if (granted) {
            button.innerHTML = '<i class="fas fa-check"></i> Enabled!';
            setTimeout(() => {
                button.closest('.notification-permission-dialog').remove();
            }, 1000);
        } else {
            button.innerHTML = '<i class="fas fa-times"></i> Permission Denied';
            button.style.background = '#ff4757';
        }
    }
}

// Initialize notifications system
const connectraNotifications = new ConnectraNotifications();

// Export for global use
window.connectraNotifications = connectraNotifications;

// Add CSS for permission dialog
const style = document.createElement('style');
style.textContent = `
    .notification-permission-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    }

    .permission-content {
        background: white;
        padding: 2rem;
        border-radius: 16px;
        max-width: 400px;
        margin: 1rem;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        text-align: center;
    }

    .permission-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.8rem;
        margin-bottom: 1rem;
        color: var(--orange);
    }

    .permission-header i {
        font-size: 2rem;
    }

    .permission-header h3 {
        margin: 0;
        color: var(--black);
    }

    .permission-content p {
        color: #666;
        line-height: 1.5;
        margin-bottom: 2rem;
    }

    .permission-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
    }

    .btn-primary, .btn-secondary {
        padding: 0.8rem 1.5rem;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .btn-primary {
        background: var(--orange);
        color: white;
    }

    .btn-primary:hover {
        background: var(--red);
        transform: translateY(-1px);
    }

    .btn-secondary {
        background: #f0f0f0;
        color: #666;
    }

    .btn-secondary:hover {
        background: #e0e0e0;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`;
document.head.appendChild(style);
