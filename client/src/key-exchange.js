/**
 * Manhattan - KeyExchangeManager
 * Handles the E2EE key distribution protocol on the client side.
 *
 * Flow:
 * 1. On join: send RSA public key to server within 5 seconds
 * 2. On USER_JOINED: encrypt own AES key with new user's RSA public key, send to server
 * 3. On AES_KEY_EXCHANGE: decrypt encrypted AES key with own RSA private key, store in Keystore
 * 4. On USER_LEFT: remove departed user's key from Keystore
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7
 */

import { CryptoModule } from './crypto.js';
import { Keystore } from './keystore.js';

/** Timeout for key exchange operations (5 seconds) */
const KEY_EXCHANGE_TIMEOUT_MS = 5000;

export class KeyExchangeManager {
    /**
     * @param {CryptoModule} cryptoModule - The crypto module for RSA/AES operations
     * @param {Keystore} keystore - The in-memory keystore for AES keys
     * @param {object} wsClient - The WebSocket/STOMP client with send(destination, payload) method
     */
    constructor(cryptoModule, keystore, wsClient) {
        this._crypto = cryptoModule;
        this._keystore = keystore;
        this._wsClient = wsClient;

        /** @type {{publicKey: CryptoKey, privateKey: CryptoKey}|null} */
        this._rsaKeyPair = null;

        /** @type {CryptoKey|null} */
        this._aesKey = null;

        /** @type {Function|null} */
        this._errorCallback = null;
    }

    /**
     * Initialize with the client's own keys (called after crypto init).
     * @param {{publicKey: CryptoKey, privateKey: CryptoKey}} rsaKeyPair - The client's RSA key pair
     * @param {CryptoKey} aesKey - The client's own AES key for encrypting outgoing messages
     */
    setMyKeys(rsaKeyPair, aesKey) {
        this._rsaKeyPair = rsaKeyPair;
        this._aesKey = aesKey;
    }

    /**
     * Get the exported RSA public key (base64 SPKI) for sending during join.
     * Must complete within 5 seconds per requirement 5.1.
     * @returns {Promise<string>} Base64-encoded SPKI public key
     * @throws {Error} If keys are not initialized or export fails
     */
    async getMyPublicKeyB64() {
        if (!this._rsaKeyPair) {
            throw new Error('RSA key pair not initialized');
        }
        return await this._crypto.exportPublicKey(this._rsaKeyPair.publicKey);
    }

    /**
     * Handle USER_JOINED event from server.
     * 1. Import the new user's RSA public key
     * 2. Encrypt own AES key with their RSA public key
     * 3. Send encrypted AES key to server for forwarding
     *
     * Must complete within 5 seconds per requirement 5.4.
     *
     * @param {{ip: string, rsaPublicKey: string}} event - The USER_JOINED event payload
     */
    async handleUserJoined(event) {
        const { ip, rsaPublicKey } = event;

        if (!ip || !rsaPublicKey) {
            this._emitError(`Invalid USER_JOINED event: missing ip or rsaPublicKey`);
            return;
        }

        if (!this._aesKey) {
            this._emitError(`Cannot handle USER_JOINED: own AES key not initialized`);
            return;
        }

        try {
            // 1. Import the new user's RSA public key
            const importedPublicKey = await this._withTimeout(
                this._crypto.importPublicKey(rsaPublicKey),
                KEY_EXCHANGE_TIMEOUT_MS,
                `Importing RSA public key for ${ip} timed out`
            );

            // 2. Encrypt own AES key with their RSA public key
            const encryptedAesKey = await this._withTimeout(
                this._crypto.encryptAesKeyWithRsa(this._aesKey, importedPublicKey),
                KEY_EXCHANGE_TIMEOUT_MS,
                `Encrypting AES key for ${ip} timed out`
            );

            // 3. Send encrypted AES key to server for forwarding
            // Also include own RSA public key so receiver can send their key back
            const myPubKeyB64 = await this._crypto.exportPublicKey(this._rsaKeyPair.publicKey);
            this._wsClient.send('/app/key.exchange', {
                targetIp: ip,
                encryptedAesKey: encryptedAesKey,
                rsaPublicKey: myPubKeyB64,
            });
        } catch (error) {
            this._emitError(`Key exchange with ${ip} failed: ${error.message}`);
        }
    }

    /**
     * Handle AES_KEY_EXCHANGE event from server.
     * 1. Decrypt the encrypted AES key with own RSA private key
     * 2. Store in Keystore associated with the sender IP
     *
     * @param {{senderIp: string, encryptedAesKey: string}} event - The AES_KEY_EXCHANGE event payload
     */
    async handleAesKeyExchange(event) {
        const { senderIp, encryptedAesKey, rsaPublicKey } = event;

        if (!senderIp || !encryptedAesKey) {
            this._emitError(`Invalid AES_KEY_EXCHANGE event: missing senderIp or encryptedAesKey`);
            return;
        }

        if (!this._rsaKeyPair) {
            this._emitError(`Cannot handle AES_KEY_EXCHANGE: RSA key pair not initialized`);
            return;
        }

        try {
            // 1. Decrypt the encrypted AES key with own RSA private key
            const decryptedAesKey = await this._withTimeout(
                this._crypto.decryptAesKeyWithRsa(encryptedAesKey, this._rsaKeyPair.privateKey),
                KEY_EXCHANGE_TIMEOUT_MS,
                `Decrypting AES key from ${senderIp} timed out`
            );

            // 2. Store in Keystore associated with the sender IP
            this._keystore.store(senderIp, decryptedAesKey);

            // 3. If sender included their RSA public key, send our AES key back
            //    (bidirectional key exchange — so sender can also decrypt our messages)
            if (rsaPublicKey && this._aesKey && !this._keystore.has(senderIp + '_sent')) {
                try {
                    const importedPubKey = await this._crypto.importPublicKey(rsaPublicKey);
                    const myEncryptedKey = await this._crypto.encryptAesKeyWithRsa(this._aesKey, importedPubKey);
                    this._wsClient.send('/app/key.exchange', {
                        targetIp: senderIp,
                        encryptedAesKey: myEncryptedKey,
                        // Don't include RSA public key to prevent infinite loop
                    });
                    // Mark that we've sent our key to this sender
                    this._keystore.store(senderIp + '_sent', true);
                } catch (err) {
                    // Non-critical — sender just won't be able to decrypt our messages
                    console.warn('[KeyExchange] Failed to send key back to', senderIp, err.message);
                }
            }
        } catch (error) {
            // Requirement 5.7: discard invalid payloads and display error
            this._emitError(`Key exchange with ${senderIp} failed: ${error.message}`);
        }
    }

    /**
     * Handle USER_LEFT event.
     * Remove the departed user's key from Keystore.
     *
     * @param {{ip: string}} event - The USER_LEFT event payload
     */
    handleUserLeft(event) {
        const { ip } = event;
        if (ip) {
            this._keystore.remove(ip);
        }
    }

    /**
     * Register error callback for key exchange failures.
     * @param {Function} callback - Called with error message string on failure
     */
    onError(callback) {
        this._errorCallback = callback;
    }

    /**
     * Emit an error to the registered callback.
     * @param {string} message - The error message
     * @private
     */
    _emitError(message) {
        if (this._errorCallback) {
            this._errorCallback(message);
        }
    }

    /**
     * Wrap a promise with a timeout.
     * @param {Promise<T>} promise - The promise to wrap
     * @param {number} ms - Timeout in milliseconds
     * @param {string} timeoutMessage - Error message if timeout occurs
     * @returns {Promise<T>}
     * @private
     * @template T
     */
    _withTimeout(promise, ms, timeoutMessage) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(timeoutMessage));
            }, ms);

            promise
                .then((result) => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch((error) => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }
}
