/**
 * Manhattan - Client Entry Point
 * Initializes all modules and wires them together.
 */

import { CryptoModule } from './crypto.js';
import { Keystore } from './keystore.js';
import { Argon2Module } from './argon2.js';
import { WebSocketClient } from './websocket-client.js';
import { RoomController } from './room-controller.js';
import { KeyExchangeManager } from './key-exchange.js';
import { ChatController } from './chat-controller.js';
import { RoomEntryUI } from './ui/room-entry.js';
import { ChatInterfaceUI } from './ui/chat-interface.js';
import { StatusBar } from './ui/status-bar.js';

// --- Configuration ---
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

// --- Global state ---
let cryptoModule;
let keystore;
let argon2Module;
let wsClient;
let roomController;
let keyExchangeManager;
let chatController;
let roomEntryUI;
let chatInterfaceUI;
let statusBar;

// My keys
let myRsaKeyPair = null;
let myAesKey = null;
let myIp = null;
let myCountry = null;
let myDisplayName = null;

// --- DOM Elements ---
const mainContent = document.getElementById('main-content');

// --- Initialize Application ---
async function init() {
    try {
        // 1. Initialize crypto module and generate keys
        cryptoModule = new CryptoModule();
        keystore = new Keystore();
        argon2Module = new Argon2Module();

        updateStatus('Generating encryption keys...');

        myRsaKeyPair = await cryptoModule.generateRsaKeyPair();
        myAesKey = await cryptoModule.generateAesKey();

        // Fetch country/city from ipinfo.io
        try {
            const ipInfoRes = await fetch('https://ipinfo.io/json');
            if (ipInfoRes.ok) {
                const ipData = await ipInfoRes.json();
                myCountry = ipData.city || ipData.country || 'Unknown';
            }
        } catch (e) {
            console.warn('[Init] Could not fetch ipinfo:', e.message);
            myCountry = 'Unknown';
        }

        // 2. Initialize status bar
        statusBar = new StatusBar(document.body);

        // 3. Initialize WebSocket client
        wsClient = new WebSocketClient();

        // 4. Initialize room controller
        roomController = new RoomController(wsClient, argon2Module, cryptoModule);

        // 5. Initialize key exchange manager
        keyExchangeManager = new KeyExchangeManager(cryptoModule, keystore, wsClient);
        keyExchangeManager.setMyKeys(myRsaKeyPair, myAesKey);
        keyExchangeManager.onError((msg) => {
            console.error('[KeyExchange]', msg);
            statusBar.showError(msg);
        });

        // 6. Show room entry screen
        showRoomEntry();

        // 7. Connect to WebSocket server
        connectToServer();

    } catch (error) {
        console.error('[Init] Failed:', error);
        updateStatus('Initialization failed. Please refresh.');
        if (statusBar) {
            statusBar.showInitError();
        }
    }
}

function connectToServer() {
    updateStatus('Connecting to server...');

    wsClient.connect(
        WS_URL,
        // onConnect
        async (frame) => {
            const sessionId = frame?.headers?.session || frame?.headers?.['session'] || 'user-' + Date.now();
            console.log('[WS] Connected, session:', sessionId);
            myIp = sessionId;
            updateStatus('Connected');
            statusBar.showConnected();

            // Subscribe to private queue for server responses
            roomController.subscribeToPrivateQueue();

            // Auto-reconnect: check if there's a saved room in sessionStorage
            const savedRoom = sessionStorage.getItem('manhattan_room');
            const savedDisplayName = sessionStorage.getItem('manhattan_displayName');
            if (savedRoom) {
                console.log('[AutoReconnect] Rejoining room:', savedRoom);
                myDisplayName = savedDisplayName || 'Anonymous';
                roomController._displayName = `${myDisplayName} | ${myCountry || '?'}`;

                const pubKeyB64 = await cryptoModule.exportPublicKey(myRsaKeyPair.publicKey);
                const result = await roomController.joinRoom(savedRoom, null, pubKeyB64);
                if (!result.success) {
                    console.warn('[AutoReconnect] Failed to rejoin:', result.error);
                    // Clear stale session and show room entry
                    sessionStorage.removeItem('manhattan_room');
                    sessionStorage.removeItem('manhattan_displayName');
                }
            }
        },
        // onDisconnect
        () => {
            console.log('[WS] Disconnected');
            updateStatus('Disconnected');
            statusBar.showDisconnected();

            // If in a chat room, show disconnect state
            if (chatController) {
                chatController.destroy();
                chatController = null;
            }

            // Show room entry again
            showRoomEntry();
        },
        // onError
        (error) => {
            console.error('[WS] Error:', error);
            statusBar.showError('Connection error');
        }
    );
}

function showRoomEntry() {
    // Clear main content
    mainContent.innerHTML = '';

    roomEntryUI = new RoomEntryUI(mainContent);
    roomEntryUI.render();

    // Wire up create room button
    roomEntryUI.onCreateRoom(async () => {
        const roomName = roomEntryUI.getRoomNameInput();
        const validation = roomController.validateRoomName(roomName);

        if (!validation.valid) {
            roomEntryUI.showValidationError(validation.error);
            return;
        }

        roomEntryUI.clearValidationError();
        roomEntryUI.clearServerError();

        if (!wsClient.isConnected()) {
            roomEntryUI.showServerError('Not connected to server. Please wait...');
            return;
        }

        // Capture display name
        myDisplayName = roomEntryUI.getDisplayName();
        roomController._displayName = `${myDisplayName} | ${myCountry || '?'}`;

        // Show create room modal (with optional password toggle)
        roomEntryUI.setCreateModalRoomName(roomName);
        roomEntryUI.showCreateModal(
            async ({ password }) => {
                roomEntryUI.setLoading(true);
                const pubKeyB64 = await cryptoModule.exportPublicKey(myRsaKeyPair.publicKey);
                const result = await roomController.createRoom(roomName, password, pubKeyB64);
                roomEntryUI.setLoading(false);
                if (!result.success) {
                    roomEntryUI.showServerError(result.error);
                }
            },
            () => { /* cancelled */ }
        );
    });

    // Wire up join room button
    roomEntryUI.onJoinRoom(async () => {
        const roomName = roomEntryUI.getRoomNameInput();
        const validation = roomController.validateRoomName(roomName);

        if (!validation.valid) {
            roomEntryUI.showValidationError(validation.error);
            return;
        }

        roomEntryUI.clearValidationError();
        roomEntryUI.clearServerError();

        if (!wsClient.isConnected()) {
            roomEntryUI.showServerError('Not connected to server. Please wait...');
            return;
        }

        // Capture display name
        myDisplayName = roomEntryUI.getDisplayName();
        roomController._displayName = `${myDisplayName} | ${myCountry || '?'}`;

        // Request room info first
        roomEntryUI.setLoading(true);
        await roomController.requestRoomInfo(roomName);
        roomEntryUI.setLoading(false);
    });

    // Handle server responses
    roomController.onRoomCreated((data) => {
        console.log('[Room] Created:', data.roomName, 'myIp:', data.clientIp);
        if (data.clientIp) myIp = data.clientIp;
        enterChatRoom(data.roomName);
    });

    roomController.onRoomJoined((data) => {
        console.log('[Room] Joined:', data.roomName, 'myIp:', data.clientIp);
        if (data.clientIp) myIp = data.clientIp;
        enterChatRoom(data.roomName);
    });

    // Handle AES key exchange messages from private queue
    roomController.onGenericMessage((data) => {
        if (data.type === 'AES_KEY_EXCHANGE') {
            console.log('[KeyExchange] Received AES key from:', data.senderIp);
            keyExchangeManager.handleAesKeyExchange(data);
        }
    });

    roomController.onRoomInfo((data) => {
        console.log('[Room] Info:', data);
        roomEntryUI.setLoading(false);

        if (data.hasPassword) {
            // Show password modal
            roomEntryUI.showPasswordModal(
                async (password) => {
                    if (!password || password.trim() === '') {
                        roomEntryUI.showPasswordError('Password is required');
                        return;
                    }
                    roomEntryUI.setLoading(true);
                    const pubKeyB64 = await cryptoModule.exportPublicKey(myRsaKeyPair.publicKey);
                    const result = await roomController.joinRoom(data.roomName, password, pubKeyB64);
                    roomEntryUI.setLoading(false);
                    if (!result.success) {
                        roomEntryUI.showPasswordError(result.error);
                    }
                },
                () => {
                    roomEntryUI.hidePasswordModal();
                }
            );
        } else {
            // Show confirmation modal
            roomEntryUI.showConfirmationModal(
                data.participantCount,
                async () => {
                    roomEntryUI.setLoading(true);
                    const pubKeyB64 = await cryptoModule.exportPublicKey(myRsaKeyPair.publicKey);
                    const result = await roomController.joinRoom(data.roomName, null, pubKeyB64);
                    roomEntryUI.setLoading(false);
                    if (!result.success) {
                        roomEntryUI.showServerError(result.error);
                    }
                },
                () => {
                    // User declined
                }
            );
        }
    });

    roomController.onError((data) => {
        console.error('[Room] Error:', data);
        roomEntryUI.setLoading(false);

        if (data.code === 'RATE_LIMITED') {
            const seconds = parseInt(data.message.match(/(\d+)/)?.[1] || '60');
            statusBar.showRateLimited(seconds);
            roomEntryUI.showServerError(data.message);
        } else if (data.code === 'ROOM_FULL') {
            statusBar.showRoomFull();
            roomEntryUI.showServerError(data.message);
        } else if (data.code === 'INVALID_PASSWORD') {
            roomEntryUI.showPasswordError(data.message);
        } else if (data.code === 'ROOM_CREATE_FAILED' && data.message.includes('already taken')) {
            // Room exists — auto-request room info to join instead
            const roomName = roomEntryUI.getRoomNameInput();
            roomEntryUI.showServerError('Room already exists. Use "Join Room" to enter.');
        } else {
            roomEntryUI.showServerError(data.message);
        }
    });
}

function enterChatRoom(roomName) {
    // Clear main content and show chat interface
    mainContent.innerHTML = '';

    // Persist room info for auto-reconnect on refresh
    sessionStorage.setItem('manhattan_room', roomName);
    sessionStorage.setItem('manhattan_displayName', myDisplayName || 'Anonymous');

    chatInterfaceUI = new ChatInterfaceUI(mainContent);
    chatInterfaceUI.render(roomName);

    // Store own AES key in keystore so own messages from broadcast can be decrypted
    keystore.store(myIp, myAesKey);

    // Create chat controller
    chatController = new ChatController(
        cryptoModule,
        keystore,
        wsClient,
        {
            displayMessage: (senderIp, text, timestamp, senderDisplayName) => {
                const isOwn = senderIp === myIp;
                let displayLabel;
                if (isOwn) {
                    displayLabel = `${myDisplayName || 'Anonymous'} | ${myIp} | ${myCountry || '?'}`;
                } else {
                    // Use senderDisplayName from server (format: "User 12345 | Region")
                    const rawName = senderDisplayName || '';
                    if (rawName && rawName.includes('|')) {
                        const parts = rawName.split('|').map(s => s.trim());
                        displayLabel = `${parts[0]} | ${senderIp} | ${parts[1] || '?'}`;
                    } else if (rawName && rawName !== senderIp) {
                        displayLabel = `${rawName} | ${senderIp}`;
                    } else {
                        displayLabel = senderIp;
                    }
                }
                chatInterfaceUI.addMessage(displayLabel, text, timestamp, isOwn);
            },
            displayError: (senderIp, errorText, timestamp) => {
                chatInterfaceUI.addErrorMessage(senderIp, errorText, timestamp);
            },
            updateParticipantList: (participants) => {
                chatInterfaceUI.updateParticipantList(participants);
            },
            displaySystemMessage: (text) => {
                chatInterfaceUI.addSystemMessage(text);
            }
        },
        keyExchangeManager
    );

    chatController.init(roomName, myIp, myAesKey);

    // Wire up send message
    chatInterfaceUI.onSendMessage(async () => {
        const text = chatInterfaceUI.getMessageInput();
        if (!text || text.trim() === '') return;

        chatInterfaceUI.clearMessageInput();
        const result = await chatController.sendMessage(text);

        if (!result.success) {
            statusBar.showError(result.error);
        }
    });

    // Wire up leave room
    chatInterfaceUI.onLeaveRoom(() => {
        if (chatController) {
            chatController.destroy();
            chatController = null;
        }
        keystore.clear();

        // Clear session storage on explicit leave
        sessionStorage.removeItem('manhattan_room');
        sessionStorage.removeItem('manhattan_displayName');

        // Disconnect and reconnect to get fresh session
        wsClient.disconnect();
        showRoomEntry();
        setTimeout(() => connectToServer(), 500);
    });

    updateStatus(`In room: ${roomName}`);
}

function updateStatus(text) {
    const el = document.getElementById('connection-status');
    if (el) el.textContent = text;
}

// --- Start the app ---
init();
