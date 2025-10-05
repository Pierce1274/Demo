// Splash screen transition
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        document.getElementById('splash').style.display = 'none';
        document.getElementById('chat-app').style.display = 'flex';
    }, 2200); // matches CSS animation duration
});

// Chat functionality
const socket = io();
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatWindow = document.getElementById('chat-window');

// Generate a random username (simple, for demo)
const username = 'User' + Math.floor(Math.random() * 10000);

function appendMessage(msg, self = false) {
    const div = document.createElement('div');
    div.className = 'message' + (self ? ' self' : '');
    div.textContent = msg;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text) {
        const msg = username + ': ' + text;
        appendMessage(msg, true);
        socket.emit('send_message', msg);
        chatInput.value = '';
    }
});

socket.on('receive_message', msg => {
    // Don't duplicate your own message
    if (!msg.startsWith(username + ':')) {
        appendMessage(msg);
    }
});

