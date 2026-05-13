/**
 * Unit tests for WebSocketClient module.
 * Tests connection lifecycle, subscribe, send, and error handling.
 */

import { Client } from '@stomp/stompjs';
import { WebSocketClient } from './websocket-client.js';

// Mock @stomp/stompjs
jest.mock('@stomp/stompjs', () => {
    const mockSubscription = { unsubscribe: jest.fn() };

    return {
        __esModule: true,
        Client: jest.fn().mockImplementation((config) => ({
            _config: config,
            activate: jest.fn().mockImplementation(() => {
                if (config.onConnect) {
                    config.onConnect({ headers: { session: 'test-session-123' } });
                }
            }),
            deactivate: jest.fn(),
            subscribe: jest.fn().mockReturnValue(mockSubscription),
            publish: jest.fn(),
        })),
        _getMockSubscription: () => mockSubscription,
    };
});

describe('WebSocketClient', () => {
    let wsClient;

    beforeEach(() => {
        jest.clearAllMocks();
        wsClient = new WebSocketClient();
    });

    afterEach(() => {
        wsClient.disconnect();
    });

    describe('constructor', () => {
        it('should initialize with disconnected state', () => {
            expect(wsClient.isConnected()).toBe(false);
            expect(wsClient.getSessionId()).toBeNull();
        });
    });

    describe('connect', () => {
        it('should establish connection and set connected state', () => {
            const onConnect = jest.fn();
            wsClient.connect('ws://localhost:8080/ws/websocket', onConnect);

            expect(wsClient.isConnected()).toBe(true);
            expect(onConnect).toHaveBeenCalledWith(
                expect.objectContaining({ headers: { session: 'test-session-123' } })
            );
        });

        it('should store the session ID from the CONNECTED frame', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            expect(wsClient.getSessionId()).toBe('test-session-123');
        });

        it('should disconnect existing connection before reconnecting', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            expect(wsClient.isConnected()).toBe(true);

            wsClient.connect('ws://localhost:8080/ws/websocket');
            expect(wsClient.isConnected()).toBe(true);
            // Client constructor should have been called twice
            expect(Client).toHaveBeenCalledTimes(2);
        });

        it('should invoke onError callback on STOMP error', () => {
            Client.mockImplementationOnce((config) => ({
                _config: config,
                activate: jest.fn().mockImplementation(() => {
                    if (config.onStompError) {
                        config.onStompError({ headers: { message: 'Auth failed' } });
                    }
                }),
                deactivate: jest.fn(),
                subscribe: jest.fn(),
                publish: jest.fn(),
            }));

            const onError = jest.fn();
            wsClient.connect('ws://localhost:8080/ws/websocket', null, null, onError);

            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({ headers: { message: 'Auth failed' } })
            );
        });

        it('should invoke onDisconnect callback on unexpected WebSocket close', () => {
            let capturedConfig;
            Client.mockImplementationOnce((config) => {
                capturedConfig = config;
                return {
                    _config: config,
                    activate: jest.fn().mockImplementation(() => {
                        if (config.onConnect) {
                            config.onConnect({ headers: { session: 'sess-1' } });
                        }
                    }),
                    deactivate: jest.fn(),
                    subscribe: jest.fn(),
                    publish: jest.fn(),
                };
            });

            const onDisconnect = jest.fn();
            wsClient.connect('ws://localhost:8080/ws/websocket', null, onDisconnect);

            // Simulate unexpected WebSocket close
            capturedConfig.onWebSocketClose({ code: 1006 });

            expect(wsClient.isConnected()).toBe(false);
            expect(wsClient.getSessionId()).toBeNull();
            expect(onDisconnect).toHaveBeenCalled();
        });

        it('should invoke onError callback on WebSocket error', () => {
            let capturedConfig;
            Client.mockImplementationOnce((config) => {
                capturedConfig = config;
                return {
                    _config: config,
                    activate: jest.fn().mockImplementation(() => {
                        if (config.onConnect) {
                            config.onConnect({ headers: { session: 'sess-1' } });
                        }
                    }),
                    deactivate: jest.fn(),
                    subscribe: jest.fn(),
                    publish: jest.fn(),
                };
            });

            const onError = jest.fn();
            wsClient.connect('ws://localhost:8080/ws/websocket', null, null, onError);

            capturedConfig.onWebSocketError({ type: 'error' });
            expect(onError).toHaveBeenCalledWith({ type: 'error' });
        });

        it('should handle missing session header gracefully', () => {
            Client.mockImplementationOnce((config) => ({
                _config: config,
                activate: jest.fn().mockImplementation(() => {
                    if (config.onConnect) {
                        config.onConnect({ headers: {} });
                    }
                }),
                deactivate: jest.fn(),
                subscribe: jest.fn(),
                publish: jest.fn(),
            }));

            wsClient.connect('ws://localhost:8080/ws/websocket');
            expect(wsClient.getSessionId()).toBeNull();
            expect(wsClient.isConnected()).toBe(true);
        });

        it('should set reconnectDelay to 0 (no auto-reconnect per requirement 8.7)', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            expect(Client).toHaveBeenCalledWith(
                expect.objectContaining({ reconnectDelay: 0 })
            );
        });
    });

    describe('disconnect', () => {
        it('should set connected state to false', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            expect(wsClient.isConnected()).toBe(true);

            wsClient.disconnect();
            expect(wsClient.isConnected()).toBe(false);
            expect(wsClient.getSessionId()).toBeNull();
        });

        it('should be safe to call when not connected', () => {
            expect(() => wsClient.disconnect()).not.toThrow();
        });

        it('should call deactivate on the STOMP client', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            const clientInstance = Client.mock.results[Client.mock.results.length - 1].value;

            wsClient.disconnect();
            expect(clientInstance.deactivate).toHaveBeenCalled();
        });
    });

    describe('subscribe', () => {
        it('should return a subscription object with unsubscribe method', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');

            const callback = jest.fn();
            const sub = wsClient.subscribe('/topic/room/testRoom', callback);

            expect(sub).not.toBeNull();
            expect(sub.unsubscribe).toBeInstanceOf(Function);
        });

        it('should return null when not connected', () => {
            const callback = jest.fn();
            const sub = wsClient.subscribe('/topic/room/testRoom', callback);
            expect(sub).toBeNull();
        });

        it('should call unsubscribe on the STOMP subscription when unsubscribe is called', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');

            const sub = wsClient.subscribe('/topic/room/testRoom', jest.fn());

            const { _getMockSubscription } = require('@stomp/stompjs');
            const mockSub = _getMockSubscription();

            sub.unsubscribe();
            expect(mockSub.unsubscribe).toHaveBeenCalled();
        });

        it('should pass the destination to the STOMP client subscribe', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            const clientInstance = Client.mock.results[Client.mock.results.length - 1].value;

            wsClient.subscribe('/topic/room/testRoom', jest.fn());

            expect(clientInstance.subscribe).toHaveBeenCalledWith(
                '/topic/room/testRoom',
                expect.any(Function)
            );
        });
    });

    describe('send', () => {
        it('should publish a JSON-serialized message to the destination', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            const clientInstance = Client.mock.results[Client.mock.results.length - 1].value;

            const payload = { type: 'MESSAGE', content: 'hello' };
            wsClient.send('/app/message.send', payload);

            expect(clientInstance.publish).toHaveBeenCalledWith({
                destination: '/app/message.send',
                body: JSON.stringify(payload),
                headers: { 'content-type': 'application/json' },
            });
        });

        it('should throw an error when not connected', () => {
            expect(() => {
                wsClient.send('/app/message.send', { type: 'MESSAGE' });
            }).toThrow('WebSocket is not connected. Cannot send message.');
        });

        it('should handle complex payload objects', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            const clientInstance = Client.mock.results[Client.mock.results.length - 1].value;

            const payload = {
                type: 'JOIN',
                roomName: 'TestRoom',
                passwordHash: null,
                rsaPublicKey: 'MIIBIjANBgkqhki...',
            };
            wsClient.send('/app/room.join', payload);

            expect(clientInstance.publish).toHaveBeenCalledWith({
                destination: '/app/room.join',
                body: JSON.stringify(payload),
                headers: { 'content-type': 'application/json' },
            });
        });
    });

    describe('isConnected', () => {
        it('should return true when connected', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            expect(wsClient.isConnected()).toBe(true);
        });

        it('should return false when not connected', () => {
            expect(wsClient.isConnected()).toBe(false);
        });

        it('should return false after disconnect is called', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            wsClient.disconnect();
            expect(wsClient.isConnected()).toBe(false);
        });
    });

    describe('getSessionId', () => {
        it('should return session ID when connected', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            expect(wsClient.getSessionId()).toBe('test-session-123');
        });

        it('should return null when not connected', () => {
            expect(wsClient.getSessionId()).toBeNull();
        });

        it('should return null after disconnect', () => {
            wsClient.connect('ws://localhost:8080/ws/websocket');
            wsClient.disconnect();
            expect(wsClient.getSessionId()).toBeNull();
        });
    });
});
