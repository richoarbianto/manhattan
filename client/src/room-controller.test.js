import { jest } from '@jest/globals';
import { RoomController } from './room-controller.js';

describe('RoomController', () => {
    let controller;
    let mockWsClient;
    let mockArgon2;
    let mockCrypto;

    beforeEach(() => {
        mockWsClient = {
            isConnected: jest.fn().mockReturnValue(true),
            send: jest.fn(),
            subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
        };

        mockArgon2 = {
            hash: jest.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$salt$hash'),
        };

        mockCrypto = {};

        controller = new RoomController(mockWsClient, mockArgon2, mockCrypto);
    });

    describe('validateRoomName', () => {
        it('should accept a valid alphanumeric name (3-15 chars)', () => {
            expect(controller.validateRoomName('abc')).toEqual({ valid: true, error: null });
            expect(controller.validateRoomName('Room1')).toEqual({ valid: true, error: null });
            expect(controller.validateRoomName('abcdefghijklmno')).toEqual({ valid: true, error: null }); // 15 chars
            expect(controller.validateRoomName('A1b2C3')).toEqual({ valid: true, error: null });
        });

        it('should reject null or undefined', () => {
            expect(controller.validateRoomName(null)).toEqual({ valid: false, error: 'Room name is required' });
            expect(controller.validateRoomName(undefined)).toEqual({ valid: false, error: 'Room name is required' });
        });

        it('should reject non-string values', () => {
            expect(controller.validateRoomName(123)).toEqual({ valid: false, error: 'Room name must be a string' });
            expect(controller.validateRoomName({})).toEqual({ valid: false, error: 'Room name must be a string' });
        });

        it('should reject names shorter than 3 characters', () => {
            expect(controller.validateRoomName('')).toEqual({ valid: false, error: 'Room name must be at least 3 characters' });
            expect(controller.validateRoomName('ab')).toEqual({ valid: false, error: 'Room name must be at least 3 characters' });
        });

        it('should reject names longer than 15 characters', () => {
            expect(controller.validateRoomName('abcdefghijklmnop')).toEqual({ valid: false, error: 'Room name must be at most 15 characters' }); // 16 chars
        });

        it('should reject names with spaces', () => {
            expect(controller.validateRoomName('my room')).toEqual({ valid: false, error: 'Room name must not contain spaces' });
            expect(controller.validateRoomName(' abc')).toEqual({ valid: false, error: 'Room name must not contain spaces' });
            expect(controller.validateRoomName('abc ')).toEqual({ valid: false, error: 'Room name must not contain spaces' });
        });

        it('should reject names with non-alphanumeric characters', () => {
            expect(controller.validateRoomName('room-1')).toEqual({ valid: false, error: 'Room name must contain only alphanumeric characters' });
            expect(controller.validateRoomName('room_1')).toEqual({ valid: false, error: 'Room name must contain only alphanumeric characters' });
            expect(controller.validateRoomName('room@1')).toEqual({ valid: false, error: 'Room name must contain only alphanumeric characters' });
            expect(controller.validateRoomName('room.1')).toEqual({ valid: false, error: 'Room name must contain only alphanumeric characters' });
        });

        it('should be case-sensitive (both Room1 and room1 are valid but different)', () => {
            expect(controller.validateRoomName('Room1')).toEqual({ valid: true, error: null });
            expect(controller.validateRoomName('room1')).toEqual({ valid: true, error: null });
            expect(controller.validateRoomName('ROOM1')).toEqual({ valid: true, error: null });
        });
    });

    describe('createRoom', () => {
        const rsaKey = 'base64EncodedPublicKey==';

        it('should return error if room name is invalid', async () => {
            const result = await controller.createRoom('ab', null, rsaKey);
            expect(result).toEqual({ success: false, error: 'Room name must be at least 3 characters' });
            expect(mockWsClient.send).not.toHaveBeenCalled();
        });

        it('should return error if not connected', async () => {
            mockWsClient.isConnected.mockReturnValue(false);
            const result = await controller.createRoom('TestRoom', null, rsaKey);
            expect(result).toEqual({ success: false, error: 'Not connected to server' });
        });

        it('should send CREATE message without password hash when no password', async () => {
            const result = await controller.createRoom('TestRoom', null, rsaKey);
            expect(result).toEqual({ success: true, error: null });
            expect(mockWsClient.send).toHaveBeenCalledWith('/app/room.create', {
                type: 'CREATE',
                roomName: 'TestRoom',
                passwordHash: null,
                rsaPublicKey: rsaKey,
            });
        });

        it('should send CREATE message with empty string password as no password', async () => {
            const result = await controller.createRoom('TestRoom', '', rsaKey);
            expect(result).toEqual({ success: true, error: null });
            expect(mockWsClient.send).toHaveBeenCalledWith('/app/room.create', {
                type: 'CREATE',
                roomName: 'TestRoom',
                passwordHash: null,
                rsaPublicKey: rsaKey,
            });
        });

        it('should hash password with Argon2id before sending CREATE', async () => {
            const result = await controller.createRoom('TestRoom', 'mySecret', rsaKey);
            expect(result).toEqual({ success: true, error: null });
            expect(mockArgon2.hash).toHaveBeenCalledWith('mySecret');
            expect(mockWsClient.send).toHaveBeenCalledWith('/app/room.create', {
                type: 'CREATE',
                roomName: 'TestRoom',
                passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
                rsaPublicKey: rsaKey,
            });
        });

        it('should return error if Argon2 hashing fails', async () => {
            mockArgon2.hash.mockRejectedValue(new Error('WASM error'));
            const result = await controller.createRoom('TestRoom', 'mySecret', rsaKey);
            expect(result).toEqual({ success: false, error: 'Password processing failed' });
            expect(mockWsClient.send).not.toHaveBeenCalled();
        });

        it('should return error if WebSocket send throws', async () => {
            mockWsClient.send.mockImplementation(() => { throw new Error('send failed'); });
            const result = await controller.createRoom('TestRoom', null, rsaKey);
            expect(result).toEqual({ success: false, error: 'Failed to send create request' });
        });
    });

    describe('requestRoomInfo', () => {
        it('should return error if room name is invalid', async () => {
            const result = await controller.requestRoomInfo('ab');
            expect(result).toEqual({ success: false, error: 'Room name must be at least 3 characters' });
        });

        it('should return error if not connected', async () => {
            mockWsClient.isConnected.mockReturnValue(false);
            const result = await controller.requestRoomInfo('TestRoom');
            expect(result).toEqual({ success: false, error: 'Not connected to server' });
        });

        it('should send ROOM_INFO request', async () => {
            const result = await controller.requestRoomInfo('TestRoom');
            expect(result).toEqual({ success: true, error: null });
            expect(mockWsClient.send).toHaveBeenCalledWith('/app/room.info', {
                type: 'ROOM_INFO',
                roomName: 'TestRoom',
            });
        });

        it('should return error if WebSocket send throws', async () => {
            mockWsClient.send.mockImplementation(() => { throw new Error('send failed'); });
            const result = await controller.requestRoomInfo('TestRoom');
            expect(result).toEqual({ success: false, error: 'Failed to send room info request' });
        });
    });

    describe('joinRoom', () => {
        const rsaKey = 'base64EncodedPublicKey==';

        it('should return error if room name is invalid', async () => {
            const result = await controller.joinRoom('ab', null, rsaKey);
            expect(result).toEqual({ success: false, error: 'Room name must be at least 3 characters' });
            expect(mockWsClient.send).not.toHaveBeenCalled();
        });

        it('should return error if not connected', async () => {
            mockWsClient.isConnected.mockReturnValue(false);
            const result = await controller.joinRoom('TestRoom', null, rsaKey);
            expect(result).toEqual({ success: false, error: 'Not connected to server' });
        });

        it('should send JOIN message without password for unprotected rooms', async () => {
            const result = await controller.joinRoom('TestRoom', null, rsaKey);
            expect(result).toEqual({ success: true, error: null });
            expect(mockWsClient.send).toHaveBeenCalledWith('/app/room.join', {
                type: 'JOIN',
                roomName: 'TestRoom',
                passwordHash: null,
                rsaPublicKey: rsaKey,
            });
        });

        it('should hash password with Argon2id before sending JOIN', async () => {
            const result = await controller.joinRoom('TestRoom', 'secret123', rsaKey);
            expect(result).toEqual({ success: true, error: null });
            expect(mockArgon2.hash).toHaveBeenCalledWith('secret123');
            expect(mockWsClient.send).toHaveBeenCalledWith('/app/room.join', {
                type: 'JOIN',
                roomName: 'TestRoom',
                passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
                rsaPublicKey: rsaKey,
            });
        });

        it('should return error if Argon2 hashing fails', async () => {
            mockArgon2.hash.mockRejectedValue(new Error('WASM error'));
            const result = await controller.joinRoom('TestRoom', 'secret123', rsaKey);
            expect(result).toEqual({ success: false, error: 'Password processing failed' });
            expect(mockWsClient.send).not.toHaveBeenCalled();
        });

        it('should return error if WebSocket send throws', async () => {
            mockWsClient.send.mockImplementation(() => { throw new Error('send failed'); });
            const result = await controller.joinRoom('TestRoom', null, rsaKey);
            expect(result).toEqual({ success: false, error: 'Failed to send join request' });
        });
    });

    describe('server response handling', () => {
        let messageCallback;

        beforeEach(() => {
            // Capture the subscribe callback
            mockWsClient.subscribe.mockImplementation((dest, cb) => {
                messageCallback = cb;
                return { unsubscribe: jest.fn() };
            });
            controller.subscribeToPrivateQueue();
        });

        it('should invoke onRoomCreated callback for ROOM_CREATED messages', () => {
            const callback = jest.fn();
            controller.onRoomCreated(callback);

            messageCallback({ body: JSON.stringify({ type: 'ROOM_CREATED', roomName: 'TestRoom' }) });

            expect(callback).toHaveBeenCalledWith({ type: 'ROOM_CREATED', roomName: 'TestRoom' });
        });

        it('should invoke onRoomJoined callback for ROOM_JOINED messages', () => {
            const callback = jest.fn();
            controller.onRoomJoined(callback);

            messageCallback({ body: JSON.stringify({ type: 'ROOM_JOINED', roomName: 'TestRoom' }) });

            expect(callback).toHaveBeenCalledWith({ type: 'ROOM_JOINED', roomName: 'TestRoom' });
        });

        it('should invoke onRoomInfo callback for ROOM_INFO messages', () => {
            const callback = jest.fn();
            controller.onRoomInfo(callback);

            const payload = { type: 'ROOM_INFO', roomName: 'TestRoom', hasPassword: true, participantCount: 3 };
            messageCallback({ body: JSON.stringify(payload) });

            expect(callback).toHaveBeenCalledWith(payload);
        });

        it('should invoke onError callback for ERROR messages with ROOM_EXISTS', () => {
            const callback = jest.fn();
            controller.onError(callback);

            const payload = { type: 'ERROR', code: 'ROOM_EXISTS', message: 'Room name is already taken' };
            messageCallback({ body: JSON.stringify(payload) });

            expect(callback).toHaveBeenCalledWith(payload);
        });

        it('should invoke onError callback for ROOM_NOT_FOUND', () => {
            const callback = jest.fn();
            controller.onError(callback);

            const payload = { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'Room not found' };
            messageCallback({ body: JSON.stringify(payload) });

            expect(callback).toHaveBeenCalledWith(payload);
        });

        it('should invoke onError callback for INVALID_PASSWORD', () => {
            const callback = jest.fn();
            controller.onError(callback);

            const payload = { type: 'ERROR', code: 'INVALID_PASSWORD', message: 'Incorrect password' };
            messageCallback({ body: JSON.stringify(payload) });

            expect(callback).toHaveBeenCalledWith(payload);
        });

        it('should invoke onError callback for RATE_LIMITED with retryAfter', () => {
            const callback = jest.fn();
            controller.onError(callback);

            const payload = { type: 'ERROR', code: 'RATE_LIMITED', message: 'Too many attempts', retryAfter: 45 };
            messageCallback({ body: JSON.stringify(payload) });

            expect(callback).toHaveBeenCalledWith(payload);
        });

        it('should invoke onError callback for ROOM_FULL', () => {
            const callback = jest.fn();
            controller.onError(callback);

            const payload = { type: 'ERROR', code: 'ROOM_FULL', message: 'Room is full' };
            messageCallback({ body: JSON.stringify(payload) });

            expect(callback).toHaveBeenCalledWith(payload);
        });

        it('should ignore malformed JSON messages', () => {
            const callback = jest.fn();
            controller.onError(callback);
            controller.onRoomCreated(callback);

            messageCallback({ body: 'not valid json{{{' });

            expect(callback).not.toHaveBeenCalled();
        });

        it('should ignore unknown message types', () => {
            const errorCb = jest.fn();
            const createdCb = jest.fn();
            controller.onError(errorCb);
            controller.onRoomCreated(createdCb);

            messageCallback({ body: JSON.stringify({ type: 'UNKNOWN_TYPE', data: 'test' }) });

            expect(errorCb).not.toHaveBeenCalled();
            expect(createdCb).not.toHaveBeenCalled();
        });

        it('should not throw if no callback is registered', () => {
            expect(() => {
                messageCallback({ body: JSON.stringify({ type: 'ROOM_CREATED', roomName: 'Test' }) });
            }).not.toThrow();
        });
    });

    describe('subscribeToPrivateQueue', () => {
        it('should subscribe to /user/queue/private', () => {
            controller.subscribeToPrivateQueue();
            expect(mockWsClient.subscribe).toHaveBeenCalledWith('/user/queue/private', expect.any(Function));
        });

        it('should not subscribe twice', () => {
            controller.subscribeToPrivateQueue();
            controller.subscribeToPrivateQueue();
            expect(mockWsClient.subscribe).toHaveBeenCalledTimes(1);
        });
    });

    describe('unsubscribeFromPrivateQueue', () => {
        it('should unsubscribe from the private queue', () => {
            const unsubFn = jest.fn();
            mockWsClient.subscribe.mockReturnValue({ unsubscribe: unsubFn });

            controller.subscribeToPrivateQueue();
            controller.unsubscribeFromPrivateQueue();

            expect(unsubFn).toHaveBeenCalled();
        });

        it('should be safe to call when not subscribed', () => {
            expect(() => controller.unsubscribeFromPrivateQueue()).not.toThrow();
        });
    });
});
