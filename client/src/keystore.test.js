import { Keystore } from './keystore.js';

describe('Keystore', () => {
    let keystore;

    // Mock CryptoKey objects for testing
    const mockKey1 = { type: 'secret', algorithm: { name: 'AES-GCM' }, id: 'key1' };
    const mockKey2 = { type: 'secret', algorithm: { name: 'AES-GCM' }, id: 'key2' };
    const mockKey3 = { type: 'secret', algorithm: { name: 'AES-GCM' }, id: 'key3' };

    beforeEach(() => {
        keystore = new Keystore();
    });

    describe('constructor', () => {
        it('should initialize with an empty store', () => {
            expect(keystore.size()).toBe(0);
            expect(keystore.getAllSenders()).toEqual([]);
        });
    });

    describe('store', () => {
        it('should store a key for a sender IP', () => {
            keystore.store('192.168.1.1', mockKey1);
            expect(keystore.has('192.168.1.1')).toBe(true);
            expect(keystore.size()).toBe(1);
        });

        it('should overwrite an existing key for the same IP', () => {
            keystore.store('192.168.1.1', mockKey1);
            keystore.store('192.168.1.1', mockKey2);
            expect(keystore.size()).toBe(1);
            expect(keystore.retrieve('192.168.1.1')).toBe(mockKey2);
        });

        it('should store multiple keys for different IPs', () => {
            keystore.store('192.168.1.1', mockKey1);
            keystore.store('192.168.1.2', mockKey2);
            keystore.store('10.0.0.1', mockKey3);
            expect(keystore.size()).toBe(3);
        });
    });

    describe('retrieve', () => {
        it('should return the stored key for a known IP', () => {
            keystore.store('192.168.1.1', mockKey1);
            expect(keystore.retrieve('192.168.1.1')).toBe(mockKey1);
        });

        it('should return null for an unknown IP', () => {
            expect(keystore.retrieve('10.0.0.99')).toBeNull();
        });

        it('should return the most recently stored key after overwrite', () => {
            keystore.store('192.168.1.1', mockKey1);
            keystore.store('192.168.1.1', mockKey2);
            expect(keystore.retrieve('192.168.1.1')).toBe(mockKey2);
        });
    });

    describe('remove', () => {
        it('should remove an existing key and return true', () => {
            keystore.store('192.168.1.1', mockKey1);
            const result = keystore.remove('192.168.1.1');
            expect(result).toBe(true);
            expect(keystore.has('192.168.1.1')).toBe(false);
            expect(keystore.size()).toBe(0);
        });

        it('should return false when removing a non-existent key', () => {
            const result = keystore.remove('10.0.0.99');
            expect(result).toBe(false);
        });

        it('should preserve other keys when removing one (cleanup on departure)', () => {
            keystore.store('192.168.1.1', mockKey1);
            keystore.store('192.168.1.2', mockKey2);
            keystore.store('10.0.0.1', mockKey3);

            keystore.remove('192.168.1.2');

            expect(keystore.has('192.168.1.1')).toBe(true);
            expect(keystore.has('192.168.1.2')).toBe(false);
            expect(keystore.has('10.0.0.1')).toBe(true);
            expect(keystore.retrieve('192.168.1.1')).toBe(mockKey1);
            expect(keystore.retrieve('10.0.0.1')).toBe(mockKey3);
            expect(keystore.size()).toBe(2);
        });
    });

    describe('clear', () => {
        it('should remove all stored keys', () => {
            keystore.store('192.168.1.1', mockKey1);
            keystore.store('192.168.1.2', mockKey2);
            keystore.store('10.0.0.1', mockKey3);

            keystore.clear();

            expect(keystore.size()).toBe(0);
            expect(keystore.has('192.168.1.1')).toBe(false);
            expect(keystore.has('192.168.1.2')).toBe(false);
            expect(keystore.has('10.0.0.1')).toBe(false);
        });

        it('should be safe to call on an empty store', () => {
            keystore.clear();
            expect(keystore.size()).toBe(0);
        });
    });

    describe('has', () => {
        it('should return true for a stored IP', () => {
            keystore.store('192.168.1.1', mockKey1);
            expect(keystore.has('192.168.1.1')).toBe(true);
        });

        it('should return false for an unknown IP', () => {
            expect(keystore.has('10.0.0.99')).toBe(false);
        });

        it('should return false after removal', () => {
            keystore.store('192.168.1.1', mockKey1);
            keystore.remove('192.168.1.1');
            expect(keystore.has('192.168.1.1')).toBe(false);
        });
    });

    describe('size', () => {
        it('should return 0 for empty store', () => {
            expect(keystore.size()).toBe(0);
        });

        it('should reflect the number of stored keys', () => {
            keystore.store('192.168.1.1', mockKey1);
            expect(keystore.size()).toBe(1);
            keystore.store('192.168.1.2', mockKey2);
            expect(keystore.size()).toBe(2);
        });

        it('should not double-count overwrites', () => {
            keystore.store('192.168.1.1', mockKey1);
            keystore.store('192.168.1.1', mockKey2);
            expect(keystore.size()).toBe(1);
        });
    });

    describe('getAllSenders', () => {
        it('should return empty array for empty store', () => {
            expect(keystore.getAllSenders()).toEqual([]);
        });

        it('should return all stored sender IPs', () => {
            keystore.store('192.168.1.1', mockKey1);
            keystore.store('10.0.0.1', mockKey2);
            const senders = keystore.getAllSenders();
            expect(senders).toHaveLength(2);
            expect(senders).toContain('192.168.1.1');
            expect(senders).toContain('10.0.0.1');
        });
    });
});
