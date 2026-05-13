/**
 * Keystore - In-memory store for other participants' AES keys.
 * 
 * Holds CryptoKey objects from other room participants, keyed by their IP address.
 * Keys are ephemeral per session (no persistence).
 * 
 * Requirements: 5.3, 5.6, 7.1, 8.6
 */
export class Keystore {
    constructor() {
        /** @type {Map<string, CryptoKey>} */
        this._keys = new Map();
    }

    /**
     * Store a CryptoKey for a sender IP. Overwrites if a key already exists for that IP.
     * @param {string} senderIp - The sender's IP address
     * @param {CryptoKey} aesKey - The sender's AES CryptoKey
     */
    store(senderIp, aesKey) {
        this._keys.set(senderIp, aesKey);
    }

    /**
     * Retrieve the AES CryptoKey for a given sender IP.
     * @param {string} senderIp - The sender's IP address
     * @returns {CryptoKey|null} The stored CryptoKey, or null if not found
     */
    retrieve(senderIp) {
        return this._keys.get(senderIp) || null;
    }

    /**
     * Remove a specific sender's key from the store.
     * Used on user departure to clean up that user's key while preserving others.
     * @param {string} senderIp - The sender's IP address to remove
     * @returns {boolean} True if the key existed and was removed, false otherwise
     */
    remove(senderIp) {
        return this._keys.delete(senderIp);
    }

    /**
     * Remove all stored keys. Used when leaving a room or on disconnect.
     */
    clear() {
        this._keys.clear();
    }

    /**
     * Check if a key exists for a given sender IP.
     * @param {string} senderIp - The sender's IP address
     * @returns {boolean} True if a key is stored for this IP
     */
    has(senderIp) {
        return this._keys.has(senderIp);
    }

    /**
     * Get the number of stored keys.
     * @returns {number} The count of stored keys
     */
    size() {
        return this._keys.size;
    }

    /**
     * Get all sender IPs that have keys stored.
     * @returns {string[]} Array of sender IP addresses
     */
    getAllSenders() {
        return Array.from(this._keys.keys());
    }
}
