import { jest } from '@jest/globals';
import { ChatController } from './chat-controller.js';

describe('ChatController', () => {
    let controller;
    let mockCrypto;
    let mockKeystore;
    let mockWsClient;
    let mockChatUI;
    let mockKeyExchangeManager;

    beforeEach(() => {
        mockCrypto = {
            encryptMessage: jest.fn().mockResolvedValue({
                ciphertext: 'encryptedBase64==',
                iv: 'ivBase64==',
            }),
            decryptMessage: jest.fn().mockResolvedValue('Hello, World!'),
        };

        mockKeystore = {
            retrieve: jest.fn().mockReturnValue('mockAesKey'),
            remove: jest.fn().mockReturnValue(true),
            has: jest.fn().mockReturnValue(true),
        };

        mockWsClient = {
            isConnected: jest.fn().mockReturnValue(true),
            send: jest.fn(),
            subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
        };

        mockChatUI = {
            displayMessage: jest.fn(),
            displayError: jest.fn(),
            updateParticipantList: jest.fn(),
        };

        mockKeyExchangeManager = {
            handleUserJoined: jest.fn(),
        };

        controller = new ChatController(
            mockCrypto,
            mockKeystore,
            mockWsClient,
            mockChatUI,
            mockKeyExchangeManager
        );
    });

    describe('init', () => {
        it('should subscribe to room topic and events topic', () => {
            controller.init('TestRoom', '192.168.1.1', 'myAesKey');

            expect(mockWsClient.subscribe).toHaveBeenCalledWith(
                '/topic/room/TestRoom',
                expect.any(Function)
            );
            expect(mockWsClient.subscribe).toHaveBeenCalledWith(
                '/topic/room/TestRoom/events',
                expect.any(Function)
            );
        });

        it('should store room name, IP, and AES key', () => {
            controller.init('TestRoom', '192.168.1.1', 'myAesKey');

            // Verify by attempting to send a message (uses stored values)
            expect(controller._roomName).toBe('TestRoom');
            expect(controller._myIp).toBe('192.168.1.1');
            expect(controller._myAesKey).toBe('myAesKey');
        });
    });

    describe('sendMessage', () => {
        beforeEach(() => {
            controller.init('TestRoom', '192.168.1.1', 'myAesKey');
        });

        it('should encrypt message with own AES key and send via WebSocket', async () => {
            const result = await controller.sendMessage('Hello!');

            expect(result).toEqual({ success: true, error: null });
            expect(mockCrypto.encryptMessage).toHaveBeenCalledWith('Hello!', 'myAesKey');
            expect(mockWsClient.send).toHaveBeenCalledWith('/app/message.send', {
                roomName: 'TestRoom',
                ciphertext: 'encryptedBase64==',
                iv: 'ivBase64==',
            });
        });

        it('should display own message optimistically in UI', async () => {
            await controller.sendMessage('Hello!');

            expect(mockChatUI.displayMessage).toHaveBeenCalledWith(
                '192.168.1.1',
                'Hello!',
                expect.any(Number)
            );
        });

        it('should return error if AES key is unavailable', async () => {
            controller._myAesKey = null;

            const result = await controller.sendMessage('Hello!');

            expect(result).toEqual({ success: false, error: 'Message could not be sent' });
            expect(mockCrypto.encryptMessage).not.toHaveBeenCalled();
            expect(mockWsClient.send).not.toHaveBeenCalled();
        });

        it('should return error if WebSocket is not connected', async () => {
            mockWsClient.isConnected.mockReturnValue(false);

            const result = await controller.sendMessage('Hello!');

            expect(result).toEqual({ success: false, error: 'Message could not be delivered' });
            expect(mockCrypto.encryptMessage).not.toHaveBeenCalled();
        });

        it('should return error if encryption fails', async () => {
            mockCrypto.encryptMessage.mockRejectedValue(new Error('Encryption failed'));

            const result = await controller.sendMessage('Hello!');

            expect(result).toEqual({ success: false, error: 'Message could not be sent' });
            expect(mockWsClient.send).not.toHaveBeenCalled();
        });
    });

    describe('handleIncomingMessage', () => {
        beforeEach(() => {
            controller.init('TestRoom', '192.168.1.1', 'myAesKey');
        });

        it('should decrypt and display message from another user', async () => {
            const payload = {
                senderIp: '192.168.1.2',
                ciphertext: 'encryptedData==',
                iv: 'ivData==',
                timestamp: 1700000000000,
            };

            await controller.handleIncomingMessage(payload);

            expect(mockKeystore.retrieve).toHaveBeenCalledWith('192.168.1.2');
            expect(mockCrypto.decryptMessage).toHaveBeenCalledWith(
                'encryptedData==',
                'ivData==',
                'mockAesKey'
            );
            expect(mockChatUI.displayMessage).toHaveBeenCalledWith(
                '192.168.1.2',
                'Hello, World!',
                1700000000000
            );
        });

        it('should skip messages from self (already displayed optimistically)', async () => {
            const payload = {
                senderIp: '192.168.1.1',
                ciphertext: 'encryptedData==',
                iv: 'ivData==',
                timestamp: 1700000000000,
            };

            await controller.handleIncomingMessage(payload);

            expect(mockKeystore.retrieve).not.toHaveBeenCalled();
            expect(mockCrypto.decryptMessage).not.toHaveBeenCalled();
            expect(mockChatUI.displayMessage).not.toHaveBeenCalled();
        });

        it('should display "Key not available for this sender" if key not in Keystore', async () => {
            mockKeystore.retrieve.mockReturnValue(null);

            const payload = {
                senderIp: '192.168.1.3',
                ciphertext: 'encryptedData==',
                iv: 'ivData==',
                timestamp: 1700000000000,
            };

            await controller.handleIncomingMessage(payload);

            expect(mockChatUI.displayError).toHaveBeenCalledWith(
                '192.168.1.3',
                'Key not available for this sender',
                1700000000000
            );
            expect(mockCrypto.decryptMessage).not.toHaveBeenCalled();
        });

        it('should display "Message could not be decrypted" on decryption failure', async () => {
            mockCrypto.decryptMessage.mockRejectedValue(new Error('Decryption failed'));

            const payload = {
                senderIp: '192.168.1.2',
                ciphertext: 'corruptedData==',
                iv: 'ivData==',
                timestamp: 1700000000000,
            };

            await controller.handleIncomingMessage(payload);

            expect(mockChatUI.displayError).toHaveBeenCalledWith(
                '192.168.1.2',
                'Message could not be decrypted',
                1700000000000
            );
        });
    });

    describe('handleParticipantList', () => {
        beforeEach(() => {
            controller.init('TestRoom', '192.168.1.1', 'myAesKey');
        });

        it('should update UI with participant list', () => {
            const event = {
                participants: [
                    { ip: '192.168.1.1', displayName: 'User1' },
                    { ip: '192.168.1.2', displayName: 'User2' },
                ],
                count: 2,
            };

            controller.handleParticipantList(event);

            expect(mockChatUI.updateParticipantList).toHaveBeenCalledWith(event.participants);
        });

        it('should not update UI if participants is not an array', () => {
            controller.handleParticipantList({ participants: null });

            expect(mockChatUI.updateParticipantList).not.toHaveBeenCalled();
        });
    });

    describe('handleUserLeft', () => {
        beforeEach(() => {
            controller.init('TestRoom', '192.168.1.1', 'myAesKey');
            controller._participants = [
                { ip: '192.168.1.1', displayName: 'User1' },
                { ip: '192.168.1.2', displayName: 'User2' },
                { ip: '192.168.1.3', displayName: 'User3' },
            ];
        });

        it('should remove departed user AES key from Keystore', () => {
            controller.handleUserLeft({ ip: '192.168.1.2' });

            expect(mockKeystore.remove).toHaveBeenCalledWith('192.168.1.2');
        });

        it('should update participant list removing the departed user', () => {
            controller.handleUserLeft({ ip: '192.168.1.2' });

            expect(mockChatUI.updateParticipantList).toHaveBeenCalledWith([
                { ip: '192.168.1.1', displayName: 'User1' },
                { ip: '192.168.1.3', displayName: 'User3' },
            ]);
        });

        it('should not crash if ip is missing from event', () => {
            expect(() => controller.handleUserLeft({})).not.toThrow();
            expect(mockKeystore.remove).not.toHaveBeenCalled();
        });
    });

    describe('handleUserJoined', () => {
        beforeEach(() => {
            controller.init('TestRoom', '192.168.1.1', 'myAesKey');
            controller._participants = [
                { ip: '192.168.1.1', displayName: 'User1' },
            ];
        });

        it('should add new participant to the list and update UI', () => {
            controller.handleUserJoined({
                ip: '192.168.1.2',
                displayName: 'User2',
                rsaPublicKey: 'key==',
            });

            expect(mockChatUI.updateParticipantList).toHaveBeenCalledWith([
                { ip: '192.168.1.1', displayName: 'User1' },
                { ip: '192.168.1.2', displayName: 'User2' },
            ]);
        });

        it('should not add duplicate participant', () => {
            controller.handleUserJoined({
                ip: '192.168.1.1',
                displayName: 'User1',
                rsaPublicKey: 'key==',
            });

            expect(mockChatUI.updateParticipantList).not.toHaveBeenCalled();
        });

        it('should use IP as displayName if displayName is missing', () => {
            controller.handleUserJoined({
                ip: '192.168.1.4',
                rsaPublicKey: 'key==',
            });

            expect(mockChatUI.updateParticipantList).toHaveBeenCalledWith([
                { ip: '192.168.1.1', displayName: 'User1' },
                { ip: '192.168.1.4', displayName: '192.168.1.4' },
            ]);
        });
    });

    describe('destroy', () => {
        it('should unsubscribe from room and events topics', () => {
            const unsubRoom = jest.fn();
            const unsubEvents = jest.fn();
            mockWsClient.subscribe
                .mockReturnValueOnce({ unsubscribe: unsubRoom })
                .mockReturnValueOnce({ unsubscribe: unsubEvents });

            controller.init('TestRoom', '192.168.1.1', 'myAesKey');
            controller.destroy();

            expect(unsubRoom).toHaveBeenCalled();
            expect(unsubEvents).toHaveBeenCalled();
        });

        it('should clear internal state', () => {
            controller.init('TestRoom', '192.168.1.1', 'myAesKey');
            controller.destroy();

            expect(controller._roomName).toBeNull();
            expect(controller._myIp).toBeNull();
            expect(controller._myAesKey).toBeNull();
            expect(controller._participants).toEqual([]);
        });

        it('should be safe to call when not initialized', () => {
            expect(() => controller.destroy()).not.toThrow();
        });
    });

    describe('STOMP message routing', () => {
        let roomMessageCallback;
        let eventsMessageCallback;

        beforeEach(() => {
            mockWsClient.subscribe.mockImplementation((dest, cb) => {
                if (dest.endsWith('/events')) {
                    eventsMessageCallback = cb;
                } else {
                    roomMessageCallback = cb;
                }
                return { unsubscribe: jest.fn() };
            });

            controller.init('TestRoom', '192.168.1.1', 'myAesKey');
        });

        it('should route MESSAGE type from room topic to handleIncomingMessage', async () => {
            const payload = {
                type: 'MESSAGE',
                senderIp: '192.168.1.2',
                ciphertext: 'data==',
                iv: 'iv==',
                timestamp: 1700000000000,
            };

            roomMessageCallback({ body: JSON.stringify(payload) });

            // Give async handler time to complete
            await new Promise((r) => setTimeout(r, 10));

            expect(mockKeystore.retrieve).toHaveBeenCalledWith('192.168.1.2');
        });

        it('should route USER_JOINED event to handleUserJoined and keyExchangeManager', () => {
            const payload = {
                type: 'USER_JOINED',
                ip: '192.168.1.5',
                displayName: 'NewUser',
                rsaPublicKey: 'publicKey==',
            };

            eventsMessageCallback({ body: JSON.stringify(payload) });

            expect(mockKeyExchangeManager.handleUserJoined).toHaveBeenCalledWith(payload);
        });

        it('should route USER_LEFT event to handleUserLeft', () => {
            controller._participants = [{ ip: '192.168.1.5', displayName: 'User5' }];

            const payload = { type: 'USER_LEFT', ip: '192.168.1.5' };
            eventsMessageCallback({ body: JSON.stringify(payload) });

            expect(mockKeystore.remove).toHaveBeenCalledWith('192.168.1.5');
        });

        it('should route PARTICIPANT_LIST event to handleParticipantList', () => {
            const payload = {
                type: 'PARTICIPANT_LIST',
                participants: [{ ip: '192.168.1.1', displayName: 'Me' }],
                count: 1,
            };

            eventsMessageCallback({ body: JSON.stringify(payload) });

            expect(mockChatUI.updateParticipantList).toHaveBeenCalledWith(payload.participants);
        });

        it('should ignore malformed JSON in room messages', () => {
            expect(() => {
                roomMessageCallback({ body: 'not valid json{{{' });
            }).not.toThrow();
        });

        it('should ignore malformed JSON in event messages', () => {
            expect(() => {
                eventsMessageCallback({ body: 'not valid json{{{' });
            }).not.toThrow();
        });

        it('should ignore unknown event types', () => {
            expect(() => {
                eventsMessageCallback({ body: JSON.stringify({ type: 'UNKNOWN' }) });
            }).not.toThrow();
        });
    });
});
