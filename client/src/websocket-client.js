/**
 * Manhattan - WebSocketClient
 * STOMP client managing connection lifecycle and message routing.
 * Uses @stomp/stompjs with native WebSocket transport (SockJS URL pattern).
 *
 * Subscriptions:
 *   /topic/room/{roomName}        — broadcast messages
 *   /topic/room/{roomName}/events — system events (USER_JOINED, USER_LEFT, PARTICIPANT_LIST)
 *   /user/queue/private           — direct messages (key exchange, errors, room responses)
 *
 * Send destinations:
 *   /app/room.create
 *   /app/room.join
 *   /app/room.info
 *   /app/message.send
 *   /app/key.exchange
 *
 * Requirements: 8.1, 8.2, 8.7, 6.3, 6.4
 */

import { Client } from '@stomp/stompjs';

export class WebSocketClient {
    constructor() {
        /** @type {Client|null} */
        this._client = null;

        /** @type {boolean} */
        this._connected = false;

        /** @type {string|null} */
        this._sessionId = null;

        /** @type {Map<string, object>} Active subscriptions keyed by destination */
        this._subscriptions = new Map();
    }

    /**
     * Connect to the STOMP server over WebSocket.
     * Uses native WebSocket with the SockJS endpoint URL pattern.
     *
     * @param {string} serverUrl - The WebSocket server URL (e.g. 'ws://localhost:8080/ws/websocket')
     * @param {Function} [onConnect] - Callback invoked on successful connection. Receives the STOMP frame.
     * @param {Function} [onDisconnect] - Callback invoked when the connection is lost.
     * @param {Function} [onError] - Callback invoked on STOMP or WebSocket errors. Receives the error frame/event.
     */
    connect(serverUrl, onConnect, onDisconnect, onError) {
        if (this._client) {
            this.disconnect();
        }

        this._client = new Client({
            brokerURL: serverUrl,

            // Disable automatic reconnection — requirement 8.7 states the client
            // should re-initiate the join process from the beginning on disconnect.
            reconnectDelay: 0,

            onConnect: (frame) => {
                this._connected = true;
                this._sessionId = frame.headers['session'] || null;
                if (onConnect) {
                    onConnect(frame);
                }
            },

            onDisconnect: (frame) => {
                this._connected = false;
                this._sessionId = null;
                this._subscriptions.clear();
                if (onDisconnect) {
                    onDisconnect(frame);
                }
            },

            onStompError: (frame) => {
                if (onError) {
                    onError(frame);
                }
            },

            onWebSocketClose: (event) => {
                if (this._connected) {
                    // Connection was lost unexpectedly
                    this._connected = false;
                    this._sessionId = null;
                    this._subscriptions.clear();
                    if (onDisconnect) {
                        onDisconnect(event);
                    }
                }
            },

            onWebSocketError: (event) => {
                if (onError) {
                    onError(event);
                }
            },
        });

        this._client.activate();
    }

    /**
     * Gracefully disconnect from the STOMP server.
     * Unsubscribes all active subscriptions and deactivates the client.
     */
    disconnect() {
        if (this._client) {
            // Unsubscribe all active subscriptions
            for (const sub of this._subscriptions.values()) {
                try {
                    sub.unsubscribe();
                } catch (_) {
                    // Ignore errors during cleanup
                }
            }
            this._subscriptions.clear();

            this._client.deactivate();
            this._client = null;
            this._connected = false;
            this._sessionId = null;
        }
    }

    /**
     * Subscribe to a STOMP destination.
     *
     * @param {string} destination - The STOMP destination (e.g. '/topic/room/myRoom')
     * @param {Function} callback - Callback invoked with each received message. Receives the STOMP message frame.
     *                              The message body is available via frame.body (string).
     * @returns {{ unsubscribe: Function }|null} Subscription object with an unsubscribe() method, or null if not connected.
     */
    subscribe(destination, callback) {
        if (!this._client || !this._connected) {
            return null;
        }

        const subscription = this._client.subscribe(destination, (message) => {
            callback(message);
        });

        this._subscriptions.set(destination, subscription);

        return {
            unsubscribe: () => {
                subscription.unsubscribe();
                this._subscriptions.delete(destination);
            },
        };
    }

    /**
     * Send a message to a STOMP destination.
     * The payload object is serialized to JSON.
     *
     * @param {string} destination - The STOMP destination (e.g. '/app/message.send')
     * @param {object} payload - The message payload (will be JSON.stringify'd).
     */
    send(destination, payload) {
        if (!this._client || !this._connected) {
            throw new Error('WebSocket is not connected. Cannot send message.');
        }

        this._client.publish({
            destination,
            body: JSON.stringify(payload),
            headers: { 'content-type': 'application/json' },
        });
    }

    /**
     * Check if the client is currently connected to the STOMP server.
     * @returns {boolean}
     */
    isConnected() {
        return this._connected;
    }

    /**
     * Get the STOMP session ID assigned by the server.
     * Needed for user-specific destinations (/user/queue/private).
     * @returns {string|null} The session ID, or null if not connected.
     */
    getSessionId() {
        return this._sessionId;
    }
}
