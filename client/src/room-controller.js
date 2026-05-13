/**
 * Manhattan - RoomController (Client-Side)
 * Manages room entry flow logic: name validation, create/join flows,
 * and server response handling.
 *
 * This module handles the business logic — not the UI rendering (that's ChatUI/RoomUI).
 *
 * Requirements: 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.5, 3.6, 3.7
 */

export class RoomController {
    /**
     * @param {import('./websocket-client.js').WebSocketClient} wsClient
     * @param {import('./argon2.js').Argon2Module} argon2Module
     * @param {import('./crypto.js').CryptoModule} cryptoModule
     */
    constructor(wsClient, argon2Module, cryptoModule) {
        this._wsClient = wsClient;
        this._argon2 = argon2Module;
        this._crypto = cryptoModule;
        this._displayName = null;

        /** @type {Function|null} */
        this._onRoomCreatedCallback = null;
        /** @type {Function|null} */
        this._onRoomJoinedCallback = null;
        /** @type {Function|null} */
        this._onRoomInfoCallback = null;
        /** @type {Function|null} */
        this._onErrorCallback = null;
        /** @type {Function|null} */
        this._onGenericMessageCallback = null;

        /** @type {object|null} Private queue subscription */
        this._privateSubscription = null;
    }

    /**
     * Validate a room name against the naming rules.
     * Rules:
     *   - Must be 3-15 characters in length
     *   - Only alphanumeric characters (a-z, A-Z, 0-9)
     *   - No spaces
     *   - Case-sensitive (validation does not normalize case)
     *
     * @param {string} name - The room name to validate
     * @returns {{ valid: boolean, error: string|null }}
     */
    validateRoomName(name) {
        if (name === null || name === undefined) {
            return { valid: false, error: 'Room name is required' };
        }

        if (typeof name !== 'string') {
            return { valid: false, error: 'Room name must be a string' };
        }

        if (name.length < 3) {
            return { valid: false, error: 'Room name must be at least 3 characters' };
        }

        if (name.length > 15) {
            return { valid: false, error: 'Room name must be at most 15 characters' };
        }

        if (/\s/.test(name)) {
            return { valid: false, error: 'Room name must not contain spaces' };
        }

        if (!/^[a-zA-Z0-9]+$/.test(name)) {
            return { valid: false, error: 'Room name must contain only alphanumeric characters' };
        }

        return { valid: true, error: null };
    }

    /**
     * Subscribe to the private queue for receiving server responses.
     * Should be called after WebSocket connection is established.
     */
    subscribeToPrivateQueue() {
        if (this._privateSubscription) {
            return; // Already subscribed
        }

        this._privateSubscription = this._wsClient.subscribe(
            '/user/queue/private',
            (message) => {
                this._handleServerMessage(message);
            }
        );
    }

    /**
     * Unsubscribe from the private queue.
     */
    unsubscribeFromPrivateQueue() {
        if (this._privateSubscription) {
            this._privateSubscription.unsubscribe();
            this._privateSubscription = null;
        }
    }

    /**
     * Create a new room.
     * Flow: validate name → hash password (if provided) → send CREATE message.
     *
     * @param {string} roomName - The desired room name
     * @param {string|null} password - Optional room password (null for no password)
     * @param {string} rsaPublicKeyB64 - Base64-encoded RSA public key (SPKI format)
     * @returns {Promise<{ success: boolean, error: string|null }>}
     */
    async createRoom(roomName, password, rsaPublicKeyB64) {
        // Step 1: Validate room name
        const validation = this.validateRoomName(roomName);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        // Step 2: Check WebSocket connection
        if (!this._wsClient.isConnected()) {
            return { success: false, error: 'Not connected to server' };
        }

        // Step 3: Hash password if provided
        let passwordHash = null;
        if (password !== null && password !== undefined && password !== '') {
            try {
                passwordHash = await this._argon2.hash(password);
            } catch (err) {
                return { success: false, error: 'Password processing failed' };
            }
        }

        // Step 4: Send CREATE message via WebSocket
        try {
            this._wsClient.send('/app/room.create', {
                type: 'CREATE',
                roomName: roomName,
                passwordHash: passwordHash,
                rsaPublicKey: rsaPublicKeyB64,
                displayName: this._displayName || null,
            });
            return { success: true, error: null };
        } catch (err) {
            return { success: false, error: 'Failed to send create request' };
        }
    }

    /**
     * Request room info from the server.
     * Used to check if a room exists and whether it has a password before joining.
     *
     * @param {string} roomName - The room name to query
     * @returns {Promise<{ success: boolean, error: string|null }>}
     */
    async requestRoomInfo(roomName) {
        // Validate room name
        const validation = this.validateRoomName(roomName);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        // Check WebSocket connection
        if (!this._wsClient.isConnected()) {
            return { success: false, error: 'Not connected to server' };
        }

        // Send room.info request
        try {
            this._wsClient.send('/app/room.info', {
                type: 'ROOM_INFO',
                roomName: roomName,
            });
            return { success: true, error: null };
        } catch (err) {
            return { success: false, error: 'Failed to send room info request' };
        }
    }

    /**
     * Join an existing room.
     * Flow: validate name → send JOIN message with plaintext password.
     * The server handles password verification against the stored Argon2 hash.
     * The caller is responsible for first requesting room info and showing
     * the appropriate UI (confirmation modal or password prompt).
     *
     * @param {string} roomName - The room name to join
     * @param {string|null} password - Room password in plaintext (null for unprotected rooms)
     * @param {string} rsaPublicKeyB64 - Base64-encoded RSA public key (SPKI format)
     * @returns {Promise<{ success: boolean, error: string|null }>}
     */
    async joinRoom(roomName, password, rsaPublicKeyB64) {
        // Step 1: Validate room name
        const validation = this.validateRoomName(roomName);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        // Step 2: Check WebSocket connection
        if (!this._wsClient.isConnected()) {
            return { success: false, error: 'Not connected to server' };
        }

        // Step 3: Send JOIN message via WebSocket
        // Send plaintext password — the server verifies it against the stored Argon2 hash
        try {
            this._wsClient.send('/app/room.join', {
                type: 'JOIN',
                roomName: roomName,
                password: password || null,
                rsaPublicKey: rsaPublicKeyB64,
                displayName: this._displayName || null,
            });
            return { success: true, error: null };
        } catch (err) {
            return { success: false, error: 'Failed to send join request' };
        }
    }

    /**
     * Register a callback for ROOM_CREATED server responses.
     * @param {Function} callback - Receives the parsed response payload
     */
    onRoomCreated(callback) {
        this._onRoomCreatedCallback = callback;
    }

    /**
     * Register a callback for ROOM_JOINED server responses.
     * @param {Function} callback - Receives the parsed response payload
     */
    onRoomJoined(callback) {
        this._onRoomJoinedCallback = callback;
    }

    /**
     * Register a callback for ROOM_INFO server responses.
     * @param {Function} callback - Receives the parsed response payload
     */
    onRoomInfo(callback) {
        this._onRoomInfoCallback = callback;
    }

    /**
     * Register a callback for ERROR server responses.
     * Error codes: ROOM_EXISTS, ROOM_NOT_FOUND, INVALID_PASSWORD, RATE_LIMITED, ROOM_FULL
     * @param {Function} callback - Receives the parsed error payload { code, message, retryAfter? }
     */
    onError(callback) {
        this._onErrorCallback = callback;
    }

    /**
     * Register a callback for unhandled message types (e.g., AES_KEY_EXCHANGE).
     * @param {Function} callback - Receives the parsed payload
     */
    onGenericMessage(callback) {
        this._onGenericMessageCallback = callback;
    }

    /**
     * Handle incoming messages from the private queue.
     * Routes to the appropriate callback based on message type.
     * @param {object} message - STOMP message frame
     * @private
     */
    _handleServerMessage(message) {
        let payload;
        try {
            payload = JSON.parse(message.body);
        } catch (err) {
            // Ignore malformed messages
            return;
        }

        switch (payload.type) {
            case 'ROOM_CREATED':
                if (this._onRoomCreatedCallback) {
                    this._onRoomCreatedCallback(payload);
                }
                break;

            case 'ROOM_JOINED':
                if (this._onRoomJoinedCallback) {
                    this._onRoomJoinedCallback(payload);
                }
                break;

            case 'ROOM_INFO':
                if (this._onRoomInfoCallback) {
                    this._onRoomInfoCallback(payload);
                }
                break;

            case 'ERROR':
                if (this._onErrorCallback) {
                    this._onErrorCallback(payload);
                }
                break;

            default:
                // Forward unhandled message types to generic handler
                if (this._onGenericMessageCallback) {
                    this._onGenericMessageCallback(payload);
                }
                break;
        }
    }
}
