/**
 * Manhattan - ChatController
 * Manages the chat interface logic: message sending/receiving, participant list,
 * and error handling for decryption failures.
 *
 * Orchestrates the flow between CryptoModule, Keystore, WebSocketClient,
 * ChatInterfaceUI, and KeyExchangeManager.
 *
 * Requirements: 6.1, 6.2, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 8.6, 9.3
 */

export class ChatController {
    /**
     * @param {import('./crypto.js').CryptoModule} cryptoModule
     * @param {import('./keystore.js').Keystore} keystore
     * @param {import('./websocket-client.js').WebSocketClient} wsClient
     * @param {object} chatUI - Chat interface UI with displayMessage, displayError, updateParticipantList methods
     * @param {import('./key-exchange.js').KeyExchangeManager} keyExchangeManager
     */
    constructor(cryptoModule, keystore, wsClient, chatUI, keyExchangeManager) {
        this._crypto = cryptoModule;
        this._keystore = keystore;
        this._wsClient = wsClient;
        this._chatUI = chatUI;
        this._keyExchangeManager = keyExchangeManager;

        /** @type {string|null} */
        this._roomName = null;

        /** @type {string|null} */
        this._myIp = null;

        /** @type {CryptoKey|null} */
        this._myAesKey = null;

        /** @type {Array<{ip: string, displayName: string}>} */
        this._participants = [];

        /** @type {{ unsubscribe: Function }|null} */
        this._roomSubscription = null;

        /** @type {{ unsubscribe: Function }|null} */
        this._eventsSubscription = null;
    }

    /**
     * Initialize the ChatController: subscribe to room topics and set up event handlers.
     *
     * @param {string} roomName - The room to join
     * @param {string} myIp - This client's IP address
     * @param {CryptoKey} myAesKey - This client's AES key for encrypting outgoing messages
     */
    init(roomName, myIp, myAesKey) {
        this._roomName = roomName;
        this._myIp = myIp;
        this._myAesKey = myAesKey;

        // Subscribe to room messages: /topic/room/{roomName}
        this._roomSubscription = this._wsClient.subscribe(
            `/topic/room/${roomName}`,
            (message) => {
                this._handleRoomMessage(message);
            }
        );

        // Subscribe to room events: /topic/room/{roomName}/events
        this._eventsSubscription = this._wsClient.subscribe(
            `/topic/room/${roomName}/events`,
            (message) => {
                this._handleRoomEvent(message);
            }
        );
    }

    /**
     * Send a message: encrypt with own AES key → send ciphertext via WebSocket.
     * Displays the message optimistically in the UI immediately.
     *
     * @param {string} plaintext - The message text to send
     * @returns {Promise<{ success: boolean, error: string|null }>}
     */
    async sendMessage(plaintext) {
        // Requirement 6.2: If AES key is unavailable, do not transmit
        if (!this._myAesKey) {
            return { success: false, error: 'Message could not be sent' };
        }

        // Requirement 6.4: If WebSocket is unavailable, display error
        if (!this._wsClient.isConnected()) {
            return { success: false, error: 'Message could not be delivered' };
        }

        try {
            // Requirement 6.1: Encrypt with own AES key
            const { ciphertext, iv } = await this._crypto.encryptMessage(plaintext, this._myAesKey);

            // Send via WebSocket to /app/message.send
            this._wsClient.send('/app/message.send', {
                roomName: this._roomName,
                ciphertext: ciphertext,
                iv: iv,
            });

            // Message will be displayed when broadcast comes back from server
            return { success: true, error: null };
        } catch (error) {
            // Requirement 6.2: encryption failure
            return { success: false, error: 'Message could not be sent' };
        }
    }

    /**
     * Handle an incoming message from the room topic.
     * Identifies sender → retrieves AES key → decrypts → displays.
     *
     * @param {object} messagePayload - Parsed MESSAGE payload { senderIp, ciphertext, iv, timestamp }
     */
    async handleIncomingMessage(messagePayload) {
        const { senderIp, senderDisplayName, ciphertext, iv, timestamp } = messagePayload;

        // Requirement 7.1: Identify sender and retrieve AES key from Keystore
        const senderAesKey = this._keystore.retrieve(senderIp);

        // Requirement 7.5: Key not found in Keystore
        if (!senderAesKey) {
            this._chatUI.displayError(senderIp, 'Key not available for this sender', timestamp);
            return;
        }

        try {
            // Requirement 7.2: Decrypt ciphertext using sender's AES key
            const plaintext = await this._crypto.decryptMessage(ciphertext, iv, senderAesKey);

            // Requirement 7.3: Display plaintext with sender info
            // Pass senderDisplayName so the UI can show "User | IP | Region"
            this._chatUI.displayMessage(senderIp, plaintext, timestamp, senderDisplayName);
        } catch (error) {
            // Requirement 7.4: Decryption failure
            this._chatUI.displayError(senderIp, 'Message could not be decrypted', timestamp);
        }
    }

    /**
     * Handle participant list update event (PARTICIPANT_LIST).
     * Updates the UI with the current list of participants.
     *
     * @param {object} event - PARTICIPANT_LIST event { participants: [{ip, displayName}], count }
     */
    handleParticipantList(event) {
        const { participants } = event;

        if (Array.isArray(participants)) {
            this._participants = participants;
            // Requirement 9.3: Display the list of online participants
            this._chatUI.updateParticipantList(participants);
        }
    }

    /**
     * Handle USER_LEFT event: remove key from keystore and update UI.
     *
     * @param {object} event - USER_LEFT event { ip }
     */
    handleUserLeft(event) {
        const { ip } = event;

        if (ip) {
            // Get display name before removing from participant list
            const participant = this._participants.find((p) => p.ip === ip);
            const displayName = participant?.displayName || ip;

            // Display system message for user leaving
            if (this._chatUI.displaySystemMessage) {
                this._chatUI.displaySystemMessage(`◂ ${displayName} disconnected`);
            }

            // Requirement 8.6: Remove departed user's AES key from Keystore
            this._keystore.remove(ip);

            // Update participant list by removing the departed user
            this._participants = this._participants.filter((p) => p.ip !== ip);
            this._chatUI.updateParticipantList(this._participants);
        }
    }

    /**
     * Handle USER_JOINED event: update participant list.
     *
     * @param {object} event - USER_JOINED event { ip, displayName, rsaPublicKey }
     */
    handleUserJoined(event) {
        const { ip, displayName } = event;

        if (ip) {
            // Add new participant to the list (avoid duplicates)
            const exists = this._participants.some((p) => p.ip === ip);
            if (!exists) {
                this._participants.push({ ip, displayName: displayName || ip });
                this._chatUI.updateParticipantList(this._participants);
            }

            // Display system message for user joining
            if (this._chatUI.displaySystemMessage) {
                this._chatUI.displaySystemMessage(`▸ ${displayName || ip} has joined`);
            }
        }
    }

    /**
     * Cleanup: unsubscribe from room topics.
     */
    destroy() {
        if (this._roomSubscription) {
            this._roomSubscription.unsubscribe();
            this._roomSubscription = null;
        }

        if (this._eventsSubscription) {
            this._eventsSubscription.unsubscribe();
            this._eventsSubscription = null;
        }

        this._roomName = null;
        this._myIp = null;
        this._myAesKey = null;
        this._participants = [];
    }

    /**
     * Handle raw STOMP message from room topic subscription.
     * Parses the message body and delegates to handleIncomingMessage.
     *
     * @param {object} message - STOMP message frame
     * @private
     */
    _handleRoomMessage(message) {
        let payload;
        try {
            payload = JSON.parse(message.body);
        } catch (err) {
            // Ignore malformed messages
            return;
        }

        if (payload.type === 'MESSAGE') {
            this.handleIncomingMessage(payload);
        }
    }

    /**
     * Handle raw STOMP message from room events topic subscription.
     * Routes to the appropriate handler based on event type.
     *
     * @param {object} message - STOMP message frame
     * @private
     */
    _handleRoomEvent(message) {
        let payload;
        try {
            payload = JSON.parse(message.body);
        } catch (err) {
            // Ignore malformed messages
            return;
        }

        switch (payload.type) {
            case 'USER_JOINED':
                this.handleUserJoined(payload);
                // Delegate key exchange handling to KeyExchangeManager
                this._keyExchangeManager.handleUserJoined(payload);
                break;

            case 'USER_LEFT':
                this.handleUserLeft(payload);
                break;

            case 'PARTICIPANT_LIST':
                this.handleParticipantList(payload);
                break;

            default:
                // Unknown event type — ignore
                break;
        }
    }
}
