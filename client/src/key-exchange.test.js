/**
 * Unit tests for KeyExchangeManager
 * Tests the E2EE key distribution protocol on the client side.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7
 */

import { jest } from '@jest/globals';
import { KeyExchangeManager } from './key-exchange.js';
import { CryptoModule } from './crypto.js';
import { Keystore } from './keystore.js';

// Use real Web Crypto API via Node's crypto module
import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

describe('KeyExchangeManager', () => {
    let cryptoModule;
    let keystore;
    let wsClient;
    let manager;
    let rsaKeyPair;
    let aesKey;

    beforeEach(async () => {
        cryptoModule = new CryptoModule();
        keystore = new Keystore();
        wsClient = { send: jest.fn() };

        manager = new KeyExchangeManager(cryptoModule, keystore, wsClient);

        // Generate real keys for testing
        rsaKeyPair = await cryptoModule.generateRsaKeyPair();
        aesKey = await cryptoModule.generateAesKey();
        manager.setMyKeys(rsaKeyPair, aesKey);
    });

    describe('setMyKeys', () => {
        it('should store RSA key pair and AES key', () => {
            const mgr = new KeyExchangeManager(cryptoModule, keystore, wsClient);
            mgr.setMyKeys(rsaKeyPair, aesKey);
            // Verify by calling getMyPublicKeyB64 which requires keys to be set
            expect(mgr.getMyPublicKeyB64()).resolves.toBeDefined();
        });
    });

    describe('getMyPublicKeyB64', () => {
        it('should return a base64-encoded SPKI public key', async () => {
            const pubKeyB64 = await manager.getMyPublicKeyB64();
            expect(typeof pubKeyB64).toBe('string');
            expect(pubKeyB64.length).toBeGreaterThan(0);

            // Verify it can be re-imported (valid format)
            const reimported = await cryptoModule.importPublicKey(pubKeyB64);
            expect(reimported).toBeDefined();
        });

        it('should throw if RSA key pair is not initialized', async () => {
            const mgr = new KeyExchangeManager(cryptoModule, keystore, wsClient);
            await expect(mgr.getMyPublicKeyB64()).rejects.toThrow('RSA key pair not initialized');
        });
    });

    describe('handleUserJoined', () => {
        it('should encrypt own AES key and send to server', async () => {
            // Generate a "new user" RSA key pair
            const newUserKeyPair = await cryptoModule.generateRsaKeyPair();
            const newUserPubKeyB64 = await cryptoModule.exportPublicKey(newUserKeyPair.publicKey);

            await manager.handleUserJoined({
                ip: '192.168.1.100',
                rsaPublicKey: newUserPubKeyB64,
            });

            // Verify wsClient.send was called with correct destination
            expect(wsClient.send).toHaveBeenCalledWith('/app/key.exchange', {
                targetIp: '192.168.1.100',
                encryptedAesKey: expect.any(String),
            });

            // Verify the encrypted AES key can be decrypted by the new user
            const sentPayload = wsClient.send.mock.calls[0][1];
            const decryptedKey = await cryptoModule.decryptAesKeyWithRsa(
                sentPayload.encryptedAesKey,
                newUserKeyPair.privateKey
            );

            // Export both keys and compare
            const originalRaw = await crypto.subtle.exportKey('raw', aesKey);
            const decryptedRaw = await crypto.subtle.exportKey('raw', decryptedKey);
            expect(Buffer.from(decryptedRaw)).toEqual(Buffer.from(originalRaw));
        });

        it('should emit error for invalid event (missing ip)', async () => {
            const errorCallback = jest.fn();
            manager.onError(errorCallback);

            await manager.handleUserJoined({ rsaPublicKey: 'somekey' });

            expect(errorCallback).toHaveBeenCalledWith(
                expect.stringContaining('Invalid USER_JOINED event')
            );
            expect(wsClient.send).not.toHaveBeenCalled();
        });

        it('should emit error for invalid event (missing rsaPublicKey)', async () => {
            const errorCallback = jest.fn();
            manager.onError(errorCallback);

            await manager.handleUserJoined({ ip: '192.168.1.100' });

            expect(errorCallback).toHaveBeenCalledWith(
                expect.stringContaining('Invalid USER_JOINED event')
            );
            expect(wsClient.send).not.toHaveBeenCalled();
        });

        it('should emit error if own AES key is not initialized', async () => {
            const mgr = new KeyExchangeManager(cryptoModule, keystore, wsClient);
            mgr.setMyKeys(rsaKeyPair, null);

            const errorCallback = jest.fn();
            mgr.onError(errorCallback);

            const newUserKeyPair = await cryptoModule.generateRsaKeyPair();
            const newUserPubKeyB64 = await cryptoModule.exportPublicKey(newUserKeyPair.publicKey);

            await mgr.handleUserJoined({
                ip: '192.168.1.100',
                rsaPublicKey: newUserPubKeyB64,
            });

            expect(errorCallback).toHaveBeenCalledWith(
                expect.stringContaining('own AES key not initialized')
            );
            expect(wsClient.send).not.toHaveBeenCalled();
        });

        it('should emit error for invalid RSA public key', async () => {
            const errorCallback = jest.fn();
            manager.onError(errorCallback);

            await manager.handleUserJoined({
                ip: '192.168.1.100',
                rsaPublicKey: 'not-a-valid-base64-key!!!',
            });

            expect(errorCallback).toHaveBeenCalledWith(
                expect.stringContaining('Key exchange with 192.168.1.100 failed')
            );
            expect(wsClient.send).not.toHaveBeenCalled();
        });
    });

    describe('handleAesKeyExchange', () => {
        it('should decrypt AES key and store in keystore', async () => {
            // Simulate another user encrypting their AES key with our public key
            const otherUserAesKey = await cryptoModule.generateAesKey();
            const myPubKeyB64 = await manager.getMyPublicKeyB64();
            const myPubKey = await cryptoModule.importPublicKey(myPubKeyB64);
            const encryptedAesKey = await cryptoModule.encryptAesKeyWithRsa(otherUserAesKey, myPubKey);

            await manager.handleAesKeyExchange({
                senderIp: '10.0.0.5',
                encryptedAesKey: encryptedAesKey,
            });

            // Verify key was stored in keystore
            expect(keystore.has('10.0.0.5')).toBe(true);

            // Verify the stored key matches the original
            const storedKey = keystore.retrieve('10.0.0.5');
            const originalRaw = await crypto.subtle.exportKey('raw', otherUserAesKey);
            const storedRaw = await crypto.subtle.exportKey('raw', storedKey);
            expect(Buffer.from(storedRaw)).toEqual(Buffer.from(originalRaw));
        });

        it('should emit error for invalid event (missing senderIp)', async () => {
            const errorCallback = jest.fn();
            manager.onError(errorCallback);

            await manager.handleAesKeyExchange({ encryptedAesKey: 'somedata' });

            expect(errorCallback).toHaveBeenCalledWith(
                expect.stringContaining('Invalid AES_KEY_EXCHANGE event')
            );
            expect(keystore.size()).toBe(0);
        });

        it('should emit error for invalid event (missing encryptedAesKey)', async () => {
            const errorCallback = jest.fn();
            manager.onError(errorCallback);

            await manager.handleAesKeyExchange({ senderIp: '10.0.0.5' });

            expect(errorCallback).toHaveBeenCalledWith(
                expect.stringContaining('Invalid AES_KEY_EXCHANGE event')
            );
            expect(keystore.size()).toBe(0);
        });

        it('should emit error if RSA key pair is not initialized', async () => {
            const mgr = new KeyExchangeManager(cryptoModule, keystore, wsClient);
            // Don't call setMyKeys

            const errorCallback = jest.fn();
            mgr.onError(errorCallback);

            await mgr.handleAesKeyExchange({
                senderIp: '10.0.0.5',
                encryptedAesKey: 'somedata',
            });

            expect(errorCallback).toHaveBeenCalledWith(
                expect.stringContaining('RSA key pair not initialized')
            );
            expect(keystore.size()).toBe(0);
        });

        it('should emit error and discard payload on decryption failure (requirement 5.7)', async () => {
            const errorCallback = jest.fn();
            manager.onError(errorCallback);

            // Send garbage encrypted data
            await manager.handleAesKeyExchange({
                senderIp: '10.0.0.5',
                encryptedAesKey: 'dGhpcyBpcyBub3QgYSB2YWxpZCBlbmNyeXB0ZWQga2V5',
            });

            expect(errorCallback).toHaveBeenCalledWith(
                expect.stringContaining('Key exchange with 10.0.0.5 failed')
            );
            // Key should NOT be stored
            expect(keystore.has('10.0.0.5')).toBe(false);
        });
    });

    describe('handleUserLeft', () => {
        it('should remove the departed user key from keystore', async () => {
            // Pre-populate keystore
            const otherAesKey = await cryptoModule.generateAesKey();
            keystore.store('192.168.1.50', otherAesKey);
            expect(keystore.has('192.168.1.50')).toBe(true);

            manager.handleUserLeft({ ip: '192.168.1.50' });

            expect(keystore.has('192.168.1.50')).toBe(false);
        });

        it('should not affect other keys in keystore', async () => {
            const key1 = await cryptoModule.generateAesKey();
            const key2 = await cryptoModule.generateAesKey();
            keystore.store('192.168.1.50', key1);
            keystore.store('192.168.1.51', key2);

            manager.handleUserLeft({ ip: '192.168.1.50' });

            expect(keystore.has('192.168.1.50')).toBe(false);
            expect(keystore.has('192.168.1.51')).toBe(true);
        });

        it('should handle missing ip gracefully', () => {
            // Should not throw
            manager.handleUserLeft({});
            manager.handleUserLeft({ ip: null });
        });
    });

    describe('onError', () => {
        it('should register and invoke error callback', async () => {
            const errorCallback = jest.fn();
            manager.onError(errorCallback);

            await manager.handleUserJoined({ ip: null, rsaPublicKey: null });

            expect(errorCallback).toHaveBeenCalled();
        });

        it('should not throw if no error callback is registered', async () => {
            // No onError registered — should not throw
            await expect(
                manager.handleUserJoined({ ip: null, rsaPublicKey: null })
            ).resolves.toBeUndefined();
        });
    });

    describe('full key exchange round-trip', () => {
        it('should complete a full key exchange between two clients', async () => {
            // Setup "Client B" (existing user)
            const clientBCrypto = new CryptoModule();
            const clientBKeystore = new Keystore();
            const clientBWs = { send: jest.fn() };
            const clientBManager = new KeyExchangeManager(clientBCrypto, clientBKeystore, clientBWs);

            const clientBRsaKeyPair = await clientBCrypto.generateRsaKeyPair();
            const clientBAesKey = await clientBCrypto.generateAesKey();
            clientBManager.setMyKeys(clientBRsaKeyPair, clientBAesKey);

            // Client A (new user) joins — gets their public key
            const clientAPubKeyB64 = await manager.getMyPublicKeyB64();

            // Client B receives USER_JOINED event with Client A's public key
            await clientBManager.handleUserJoined({
                ip: '10.0.0.1', // Client A's IP
                rsaPublicKey: clientAPubKeyB64,
            });

            // Client B sent encrypted AES key to server
            expect(clientBWs.send).toHaveBeenCalledWith('/app/key.exchange', {
                targetIp: '10.0.0.1',
                encryptedAesKey: expect.any(String),
            });

            // Server forwards to Client A — simulate AES_KEY_EXCHANGE event
            const forwardedPayload = clientBWs.send.mock.calls[0][1];
            await manager.handleAesKeyExchange({
                senderIp: '10.0.0.2', // Client B's IP
                encryptedAesKey: forwardedPayload.encryptedAesKey,
            });

            // Client A should now have Client B's AES key in keystore
            expect(keystore.has('10.0.0.2')).toBe(true);

            // Verify the stored key matches Client B's original AES key
            const storedKey = keystore.retrieve('10.0.0.2');
            const originalRaw = await crypto.subtle.exportKey('raw', clientBAesKey);
            const storedRaw = await crypto.subtle.exportKey('raw', storedKey);
            expect(Buffer.from(storedRaw)).toEqual(Buffer.from(originalRaw));
        });
    });
});
