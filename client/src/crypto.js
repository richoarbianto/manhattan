/**
 * Manhattan - CryptoModule
 * Handles all cryptographic operations using the Web Crypto API.
 * RSA-OAEP (2048-bit, SHA-256) for key exchange.
 * AES-GCM (256-bit) for message encryption.
 */

export class CryptoModule {
    /**
     * Generate a 2048-bit RSA key pair for key exchange (RSA-OAEP with SHA-256).
     * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
     */
    async generateRsaKeyPair() {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256',
            },
            true,
            ['encrypt', 'decrypt']
        );
        return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
    }

    /**
     * Generate a 256-bit AES key for message encryption (AES-GCM).
     * @returns {Promise<CryptoKey>}
     */
    async generateAesKey() {
        return await crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256,
            },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt a plaintext message using AES-GCM with a random 12-byte IV.
     * @param {string} plaintext - The message to encrypt.
     * @param {CryptoKey} aesKey - The AES-GCM key to use.
     * @returns {Promise<{ciphertext: string, iv: string}>} Base64-encoded ciphertext and IV.
     */
    async encryptMessage(plaintext, aesKey) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const ciphertextBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            data
        );

        return {
            ciphertext: this._arrayBufferToBase64(ciphertextBuffer),
            iv: this._arrayBufferToBase64(iv),
        };
    }

    /**
     * Decrypt a ciphertext message using AES-GCM.
     * @param {string} ciphertextB64 - Base64-encoded ciphertext.
     * @param {string} ivB64 - Base64-encoded IV.
     * @param {CryptoKey} aesKey - The AES-GCM key to use.
     * @returns {Promise<string>} The decrypted plaintext string.
     */
    async decryptMessage(ciphertextB64, ivB64, aesKey) {
        const ciphertext = this._base64ToArrayBuffer(ciphertextB64);
        const iv = this._base64ToArrayBuffer(ivB64);

        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            ciphertext
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    }

    /**
     * Encrypt an AES key with an RSA public key for key exchange.
     * Exports the AES key in raw format, then encrypts with RSA-OAEP.
     * @param {CryptoKey} aesKey - The AES key to encrypt.
     * @param {CryptoKey} rsaPublicKey - The recipient's RSA public key.
     * @returns {Promise<string>} Base64-encoded encrypted AES key.
     */
    async encryptAesKeyWithRsa(aesKey, rsaPublicKey) {
        const rawKey = await crypto.subtle.exportKey('raw', aesKey);
        const encryptedKey = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' },
            rsaPublicKey,
            rawKey
        );
        return this._arrayBufferToBase64(encryptedKey);
    }

    /**
     * Decrypt an encrypted AES key with an RSA private key for key exchange.
     * Decrypts with RSA-OAEP, then imports the raw key as AES-GCM.
     * @param {string} encryptedKeyB64 - Base64-encoded encrypted AES key.
     * @param {CryptoKey} rsaPrivateKey - The recipient's RSA private key.
     * @returns {Promise<CryptoKey>} The decrypted AES-GCM CryptoKey.
     */
    async decryptAesKeyWithRsa(encryptedKeyB64, rsaPrivateKey) {
        const encryptedKey = this._base64ToArrayBuffer(encryptedKeyB64);
        const rawKey = await crypto.subtle.decrypt(
            { name: 'RSA-OAEP' },
            rsaPrivateKey,
            encryptedKey
        );
        return await crypto.subtle.importKey(
            'raw',
            rawKey,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Export an RSA public key in SPKI format, base64-encoded.
     * @param {CryptoKey} rsaPublicKey - The RSA public key to export.
     * @returns {Promise<string>} Base64-encoded SPKI public key.
     */
    async exportPublicKey(rsaPublicKey) {
        const spkiBuffer = await crypto.subtle.exportKey('spki', rsaPublicKey);
        return this._arrayBufferToBase64(spkiBuffer);
    }

    /**
     * Import an RSA public key from a base64-encoded SPKI format string.
     * @param {string} base64String - Base64-encoded SPKI public key.
     * @returns {Promise<CryptoKey>} The imported RSA public CryptoKey.
     */
    async importPublicKey(base64String) {
        const spkiBuffer = this._base64ToArrayBuffer(base64String);
        return await crypto.subtle.importKey(
            'spki',
            spkiBuffer,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            true,
            ['encrypt']
        );
    }

    /**
     * Convert an ArrayBuffer to a base64-encoded string.
     * @param {ArrayBuffer|Uint8Array} buffer
     * @returns {string}
     */
    _arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert a base64-encoded string to an ArrayBuffer.
     * @param {string} base64
     * @returns {ArrayBuffer}
     */
    _base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
