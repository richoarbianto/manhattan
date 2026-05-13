/**
 * Manhattan - ChatInterfaceUI
 * Renders the chat interface with message display, participant sidebar,
 * and message input area. Styled with dark/hacker terminal theme.
 *
 * Requirements: 7.3, 7.4, 7.5, 9.2, 9.3
 */

export class ChatInterfaceUI {
    /**
     * @param {HTMLElement} containerElement - The DOM element to render into
     */
    constructor(containerElement) {
        this._container = containerElement;
        this._rootEl = null;
        this._messageAreaEl = null;
        this._participantListEl = null;
        this._participantCountEl = null;
        this._messageInputEl = null;
        this._sendButtonEl = null;
        this._leaveButtonEl = null;
        this._roomNameEl = null;

        /** @type {Function|null} */
        this._sendMessageCallback = null;
        /** @type {Function|null} */
        this._leaveRoomCallback = null;
    }

    /**
     * Render the full chat interface into the container.
     * @param {string} roomName - The name of the current room
     */
    render(roomName) {
        this._rootEl = document.createElement('div');
        this._rootEl.className = 'flex flex-col h-[calc(100vh-2rem)] md:h-[calc(100vh-4rem)] md:max-h-[800px] w-full';
        this._rootEl.setAttribute('data-testid', 'chat-interface');

        // Header bar
        const header = this._createHeader(roomName);

        // Main content area (messages + sidebar)
        const mainArea = this._createMainArea();

        // Message input area
        const inputArea = this._createInputArea();

        this._rootEl.appendChild(header);
        this._rootEl.appendChild(mainArea);
        this._rootEl.appendChild(inputArea);

        this._container.innerHTML = '';
        this._container.appendChild(this._rootEl);
    }

    /**
     * Remove the chat interface from the DOM and clean up.
     */
    destroy() {
        if (this._rootEl && this._rootEl.parentNode) {
            this._rootEl.parentNode.removeChild(this._rootEl);
        }
        this._rootEl = null;
        this._messageAreaEl = null;
        this._participantListEl = null;
        this._participantCountEl = null;
        this._messageInputEl = null;
        this._sendButtonEl = null;
        this._leaveButtonEl = null;
        this._roomNameEl = null;
        this._sendMessageCallback = null;
        this._leaveRoomCallback = null;
    }

    /**
     * Add a decrypted message to the display area.
     * @param {string} senderIp - The sender's IP address
     * @param {string} text - The decrypted plaintext message
     * @param {number} timestamp - Message timestamp (epoch ms)
     * @param {boolean} isOwn - Whether this message was sent by the local user
     */
    addMessage(senderIp, text, timestamp, isOwn) {
        if (!this._messageAreaEl) return;

        const messageEl = document.createElement('div');
        messageEl.className = `flex flex-col mb-2 px-3 py-1.5 rounded ${
            isOwn
                ? 'bg-terminal-panel border-l-2 border-terminal-cyan'
                : 'bg-terminal-surface border-l-2 border-terminal-green'
        }`;
        messageEl.setAttribute('data-testid', 'chat-message');

        const timeStr = this._formatTimestamp(timestamp);
        const textColor = isOwn ? 'text-terminal-cyan' : 'text-terminal-green';

        messageEl.innerHTML = `
            <div class="flex items-baseline gap-2 text-xs">
                <span class="text-terminal-muted">[${this._escapeHtml(timeStr)}]</span>
                <span class="${textColor} font-semibold">${this._escapeHtml(senderIp)}:</span>
            </div>
            <div class="text-terminal-text text-sm ml-4 mt-0.5 break-words">${this._escapeHtml(text)}</div>
        `;

        this._messageAreaEl.appendChild(messageEl);
        this.scrollToBottom();
    }

    /**
     * Add a system message (join/leave notifications) to the display area.
     * Styled as centered, muted, italic text with no sender label.
     * @param {string} text - The system message text
     */
    addSystemMessage(text) {
        if (!this._messageAreaEl) return;

        const messageEl = document.createElement('div');
        messageEl.className = 'text-terminal-muted text-xs text-center py-1 italic';
        messageEl.setAttribute('data-testid', 'system-message');
        messageEl.textContent = text;

        this._messageAreaEl.appendChild(messageEl);
        this.scrollToBottom();
    }

    /**
     * Add an error indicator message (decryption failure or missing key).
     * @param {string} senderIp - The sender's IP address
     * @param {string} errorText - The error description
     * @param {number} timestamp - Message timestamp (epoch ms)
     */
    addErrorMessage(senderIp, errorText, timestamp) {
        if (!this._messageAreaEl) return;

        const messageEl = document.createElement('div');
        messageEl.className = 'flex flex-col mb-2 px-3 py-1.5 rounded bg-terminal-surface border-l-2 border-terminal-red';
        messageEl.setAttribute('data-testid', 'chat-error-message');

        const timeStr = this._formatTimestamp(timestamp);

        messageEl.innerHTML = `
            <div class="flex items-baseline gap-2 text-xs">
                <span class="text-terminal-muted">[${this._escapeHtml(timeStr)}]</span>
                <span class="text-terminal-red font-semibold">${this._escapeHtml(senderIp)}:</span>
            </div>
            <div class="flex items-center gap-1.5 ml-4 mt-0.5">
                <span class="text-terminal-red text-sm">⚠</span>
                <span class="text-terminal-red text-sm italic">${this._escapeHtml(errorText)}</span>
            </div>
        `;

        this._messageAreaEl.appendChild(messageEl);
        this.scrollToBottom();
    }

    /**
     * Update the participant list sidebar.
     * @param {Array<{ip: string, displayName: string}>} participants
     */
    updateParticipantList(participants) {
        if (!this._participantListEl || !this._participantCountEl) return;

        this._participantCountEl.textContent = `Online: ${participants.length}`;

        this._participantListEl.innerHTML = '';
        participants.forEach((p) => {
            const item = document.createElement('div');
            item.className = 'flex items-center gap-2 px-2 py-1.5 rounded hover:bg-terminal-panel transition-colors';
            item.setAttribute('data-testid', 'participant-item');

            item.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-terminal-green shadow-glow-green flex-shrink-0"></span>
                <span class="text-terminal-green text-xs truncate">${this._escapeHtml(p.displayName)}</span>
            `;

            this._participantListEl.appendChild(item);
        });
    }

    /**
     * Get the current value of the message input field.
     * @returns {string}
     */
    getMessageInput() {
        if (!this._messageInputEl) return '';
        return this._messageInputEl.value;
    }

    /**
     * Clear the message input field after sending.
     */
    clearMessageInput() {
        if (this._messageInputEl) {
            this._messageInputEl.value = '';
        }
    }

    /**
     * Register a callback for when the user sends a message (button click or Enter key).
     * @param {Function} callback - Called with no arguments; use getMessageInput() to get text
     */
    onSendMessage(callback) {
        this._sendMessageCallback = callback;
    }

    /**
     * Register a callback for when the user clicks the Leave button.
     * @param {Function} callback - Called with no arguments
     */
    onLeaveRoom(callback) {
        this._leaveRoomCallback = callback;
    }

    /**
     * Enable or disable the message input and send button.
     * @param {boolean} enabled
     */
    setInputEnabled(enabled) {
        if (this._messageInputEl) {
            this._messageInputEl.disabled = !enabled;
            if (enabled) {
                this._messageInputEl.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                this._messageInputEl.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
        if (this._sendButtonEl) {
            this._sendButtonEl.disabled = !enabled;
            if (enabled) {
                this._sendButtonEl.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                this._sendButtonEl.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }

    /**
     * Scroll the message display area to the bottom.
     */
    scrollToBottom() {
        if (this._messageAreaEl) {
            this._messageAreaEl.scrollTop = this._messageAreaEl.scrollHeight;
        }
    }

    // ─── Private Methods ─────────────────────────────────────────────────

    /**
     * Create the header bar with room name, participant count, and leave button.
     * @param {string} roomName
     * @returns {HTMLElement}
     * @private
     */
    _createHeader(roomName) {
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between px-4 py-3 bg-terminal-surface border-b border-terminal-border rounded-t-lg';
        header.setAttribute('data-testid', 'chat-header');

        // Left: Room name
        this._roomNameEl = document.createElement('div');
        this._roomNameEl.className = 'flex items-center gap-2';
        this._roomNameEl.innerHTML = `
            <span class="text-terminal-green font-semibold terminal-text-glow">▸</span>
            <span class="text-terminal-green font-semibold text-sm">${this._escapeHtml(roomName)}</span>
        `;

        // Center: Participant count (shown in header for compact view)
        this._participantCountEl = document.createElement('span');
        this._participantCountEl.className = 'text-terminal-muted text-xs';
        this._participantCountEl.setAttribute('data-testid', 'participant-count');
        this._participantCountEl.textContent = 'Online: 0';

        // Right: Leave button
        this._leaveButtonEl = document.createElement('button');
        this._leaveButtonEl.className = 'text-terminal-red text-xs border border-terminal-red px-3 py-1 rounded hover:bg-terminal-red hover:text-terminal-bg transition-all duration-200';
        this._leaveButtonEl.setAttribute('data-testid', 'leave-button');
        this._leaveButtonEl.textContent = 'Leave';
        this._leaveButtonEl.addEventListener('click', () => {
            if (this._leaveRoomCallback) {
                this._leaveRoomCallback();
            }
        });

        header.appendChild(this._roomNameEl);
        header.appendChild(this._participantCountEl);
        header.appendChild(this._leaveButtonEl);

        return header;
    }

    /**
     * Create the main content area with message display and participant sidebar.
     * @returns {HTMLElement}
     * @private
     */
    _createMainArea() {
        const mainArea = document.createElement('div');
        mainArea.className = 'flex flex-1 overflow-hidden border-x border-terminal-border';

        // Left: Message display area (~75%)
        this._messageAreaEl = document.createElement('div');
        this._messageAreaEl.className = 'flex-1 overflow-y-auto p-3 bg-terminal-bg space-y-1';
        this._messageAreaEl.setAttribute('data-testid', 'message-area');

        // Welcome message
        const welcomeEl = document.createElement('div');
        welcomeEl.className = 'text-terminal-muted text-xs text-center py-4';
        welcomeEl.textContent = '--- Encrypted channel established ---';
        this._messageAreaEl.appendChild(welcomeEl);

        // Right: Participant sidebar (~25%)
        const sidebar = document.createElement('div');
        sidebar.className = 'hidden md:flex w-48 border-l border-terminal-border bg-terminal-surface p-3 overflow-y-auto flex-col';
        sidebar.setAttribute('data-testid', 'participant-sidebar');

        const sidebarHeader = document.createElement('div');
        sidebarHeader.className = 'text-terminal-muted text-xs font-semibold uppercase mb-2 pb-2 border-b border-terminal-border';
        sidebarHeader.textContent = 'Participants';

        this._participantListEl = document.createElement('div');
        this._participantListEl.className = 'flex flex-col gap-1';
        this._participantListEl.setAttribute('data-testid', 'participant-list');

        sidebar.appendChild(sidebarHeader);
        sidebar.appendChild(this._participantListEl);

        mainArea.appendChild(this._messageAreaEl);
        mainArea.appendChild(sidebar);

        return mainArea;
    }

    /**
     * Create the message input area with text input and send button.
     * @returns {HTMLElement}
     * @private
     */
    _createInputArea() {
        const inputArea = document.createElement('div');
        inputArea.className = 'flex items-center gap-2 px-4 py-3 bg-terminal-surface border border-terminal-border rounded-b-lg';
        inputArea.setAttribute('data-testid', 'input-area');

        // Prompt indicator
        const prompt = document.createElement('span');
        prompt.className = 'text-terminal-green text-sm font-semibold flex-shrink-0';
        prompt.textContent = '>';

        // Text input
        this._messageInputEl = document.createElement('input');
        this._messageInputEl.type = 'text';
        this._messageInputEl.className = 'terminal-input flex-1 text-sm';
        this._messageInputEl.placeholder = 'Type a message...';
        this._messageInputEl.setAttribute('data-testid', 'message-input');
        this._messageInputEl.setAttribute('autocomplete', 'off');

        // Enter key to send
        this._messageInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._handleSend();
            }
        });

        // Send button
        this._sendButtonEl = document.createElement('button');
        this._sendButtonEl.className = 'terminal-button text-sm px-4 py-2';
        this._sendButtonEl.setAttribute('data-testid', 'send-button');
        this._sendButtonEl.textContent = 'Send';
        this._sendButtonEl.addEventListener('click', () => {
            this._handleSend();
        });

        inputArea.appendChild(prompt);
        inputArea.appendChild(this._messageInputEl);
        inputArea.appendChild(this._sendButtonEl);

        return inputArea;
    }

    /**
     * Handle send action (button click or Enter key).
     * @private
     */
    _handleSend() {
        if (this._messageInputEl && this._messageInputEl.disabled) return;
        if (this._sendMessageCallback) {
            this._sendMessageCallback();
        }
    }

    /**
     * Format a timestamp (epoch ms) into a readable time string.
     * @param {number} timestamp
     * @returns {string}
     * @private
     */
    _formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    /**
     * Escape HTML special characters to prevent XSS.
     * @param {string} str
     * @returns {string}
     * @private
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
