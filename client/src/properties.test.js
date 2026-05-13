/**
 * Manhattan - Client Property-Based Tests (fast-check)
 *
 * Tests correctness properties for client modules using randomized inputs.
 * Uses numRuns: 20 for speed.
 */

import { webcrypto } from 'crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import * as fc from 'fast-check';
import { RoomController } from './room-controller.js';
import { CryptoModule } from './crypto.js';
import { Keystore } from './keystore.js';
import { Argon2Module } from './argon2.js';

const NUM_RUNS = 20;

// ============================================================================
// Feature: manhattan, Property 1: Room name validation correctness
// Any string that is alphanumeric, 3-15 chars, no spaces → valid
// Any string violating those rules → invalid
// Validates: Requirements 1.3, 1.4
// ============================================================================
describe('Property 1: Room name validation correctness', () => {
    let controller;

    beforeEach(() => {
        const mockWsClient = { isConnected: () => true, send: () => {}, subscribe: () => ({ unsubscribe: () => {} }) };
        const mockArgon2 = { hash: async () => 'hash' };
        const mockCrypto = {};
        controller = new RoomController(mockWsClient, mockArgon2, mockCrypto);
    });

    // Generator for valid room names: alphanumeric, 3-15 chars
    const validRoomNameArb = fc.stringOf(
        fc.oneof(
            fc.char().filter(c => /[a-zA-Z0-9]/.test(c)),
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''))
        ),
        { minLength: 3, maxLength: 15 }
    );

    it('should accept any alphanumeric string of 3-15 characters', () => {
        fc.assert(
            fc.property(validRoomNameArb, (name) => {
                const result = controller.validateRoomName(name);
                return result.valid === true && result.error === null;
            }),
            { numRuns: NUM_RUNS }
        );
    });

    it('should reject any string shorter than 3 characters', () => {
        const shortStringArb = fc.string({ minLength: 0, maxLength: 2 });
        fc.assert(
            fc.property(shortStringArb, (name) => {
                const result = controller.validateRoomName(name);
                return result.valid === false;
            }),
            { numRuns: NUM_RUNS }
        );
    });

    it('should reject any string longer than 15 characters', () => {
        const longStringArb = fc.stringOf(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
            { minLength: 16, maxLength: 50 }
        );
        fc.assert(
            fc.property(longStringArb, (name) => {
                const result = controller.validateRoomName(name);
                return result.valid === false;
            }),
            { numRuns: NUM_RUNS }
        );
    });

    it('should reject any string containing non-alphanumeric characters (length 3-15)', () => {
        // Generate strings of valid length that contain at least one non-alphanumeric char
        const nonAlphanumCharArb = fc.char().filter(c => /[^a-zA-Z0-9]/.test(c) && !/\s/.test(c));
        const invalidNameArb = fc.tuple(
            fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 2, maxLength: 13 }),
            nonAlphanumCharArb
        ).map(([base, badChar]) => base + badChar);

        fc.assert(
            fc.property(invalidNameArb, (name) => {
                const result = controller.validateRoomName(name);
                return result.valid === false;
            }),
            { numRuns: NUM_RUNS }
        );
    });

    it('should reject any string containing whitespace (length 3-15)', () => {
        const whitespaceCharArb = fc.constantFrom(' ', '\t', '\n', '\r');
        const nameWithSpaceArb = fc.tuple(
            fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 2, maxLength: 7 }),
            whitespaceCharArb,
            fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 6 })
        ).map(([a, ws, b]) => a + ws + b);

        fc.assert(
            fc.property(nameWithSpaceArb, (name) => {
                const result = controller.validateRoomName(name);
                return result.valid === false;
            }),
            { numRuns: NUM_RUNS }
        );
    });
});

// ============================================================================
// Feature: manhattan, Property 7: AES encryption round-trip
// For any plaintext and valid AES key, encrypt then decrypt returns original
// Validates: Requirements 6.1, 7.2
// ============================================================================
describe('Property 7: AES encryption round-trip', () => {
    let cryptoModule;

    beforeAll(() => {
        cryptoModule = new CryptoModule();
    });

    it('for any plaintext, encrypt then decrypt returns the original', async () => {
        const aesKey = await cryptoModule.generateAesKey();

        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 1, maxLength: 500 }),
                async (plaintext) => {
                    const { ciphertext, iv } = await cryptoModule.encryptMessage(plaintext, aesKey);
                    const decrypted = await cryptoModule.decryptMessage(ciphertext, iv, aesKey);
                    return decrypted === plaintext;
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });

    it('for any plaintext including unicode, encrypt then decrypt returns the original', async () => {
        const aesKey = await cryptoModule.generateAesKey();

        await fc.assert(
            fc.asyncProperty(
                fc.unicode({ minLength: 1, maxLength: 200 }),
                async (plaintext) => {
                    const { ciphertext, iv } = await cryptoModule.encryptMessage(plaintext, aesKey);
                    const decrypted = await cryptoModule.decryptMessage(ciphertext, iv, aesKey);
                    return decrypted === plaintext;
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });
});

// ============================================================================
// Feature: manhattan, Property 10: Keystore store/retrieve consistency
// For any set of (ip, key) pairs stored, retrieve returns the last stored key for that IP
// Validates: Requirements 5.3, 7.1
// ============================================================================
describe('Property 10: Keystore store/retrieve consistency', () => {
    it('retrieve returns the last stored key for any IP', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.tuple(
                        fc.ipV4(),
                        fc.nat({ max: 1000 }) // use nat as a stand-in for key identity
                    ),
                    { minLength: 1, maxLength: 20 }
                ),
                (operations) => {
                    const keystore = new Keystore();
                    // Track what the last stored value should be per IP
                    const expected = new Map();

                    for (const [ip, keyId] of operations) {
                        // Use keyId as a mock key (Keystore stores any value)
                        const mockKey = { id: keyId };
                        keystore.store(ip, mockKey);
                        expected.set(ip, mockKey);
                    }

                    // Verify: for each IP, retrieve returns the last stored key
                    for (const [ip, expectedKey] of expected) {
                        const retrieved = keystore.retrieve(ip);
                        if (retrieved !== expectedKey) return false;
                    }
                    return true;
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });

    it('retrieve returns null for IPs that were never stored', () => {
        fc.assert(
            fc.property(
                fc.array(fc.ipV4(), { minLength: 1, maxLength: 10 }),
                fc.ipV4(),
                (storedIps, queryIp) => {
                    // Only test when queryIp is not in storedIps
                    fc.pre(!storedIps.includes(queryIp));

                    const keystore = new Keystore();
                    for (const ip of storedIps) {
                        keystore.store(ip, { id: ip });
                    }

                    return keystore.retrieve(queryIp) === null;
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });
});

// ============================================================================
// Feature: manhattan, Property 15: Keystore cleanup on user departure
// Removing one IP preserves all other stored keys
// Validates: Requirements 8.6
// ============================================================================
describe('Property 15: Keystore cleanup on user departure', () => {
    it('removing one IP preserves all other stored keys', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.ipV4(), { minLength: 2, maxLength: 15 }),
                (ips) => {
                    const keystore = new Keystore();
                    const keys = new Map();

                    // Store a unique key for each IP
                    for (const ip of ips) {
                        const key = { id: ip };
                        keystore.store(ip, key);
                        keys.set(ip, key);
                    }

                    // Remove the first IP (simulating user departure)
                    const removedIp = ips[0];
                    keystore.remove(removedIp);

                    // Verify: removed IP returns null
                    if (keystore.retrieve(removedIp) !== null) return false;
                    if (keystore.has(removedIp)) return false;

                    // Verify: all other IPs still have their keys
                    for (let i = 1; i < ips.length; i++) {
                        const retrieved = keystore.retrieve(ips[i]);
                        if (retrieved !== keys.get(ips[i])) return false;
                    }

                    return true;
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });

    it('removing a non-existent IP does not affect stored keys', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.ipV4(), { minLength: 1, maxLength: 10 }),
                fc.ipV4(),
                (storedIps, removeIp) => {
                    fc.pre(!storedIps.includes(removeIp));

                    const keystore = new Keystore();
                    const keys = new Map();

                    for (const ip of storedIps) {
                        const key = { id: ip };
                        keystore.store(ip, key);
                        keys.set(ip, key);
                    }

                    // Remove an IP that was never stored
                    keystore.remove(removeIp);

                    // All stored keys should remain unchanged
                    for (const ip of storedIps) {
                        if (keystore.retrieve(ip) !== keys.get(ip)) return false;
                    }
                    return keystore.size() === storedIps.length;
                }
            ),
            { numRuns: NUM_RUNS }
        );
    });
});

// ============================================================================
// Feature: manhattan, Property 19: Whitespace password rejection
// Any string that is only whitespace should be rejected by validatePassword
// Validates: Requirements 3.2
// ============================================================================
describe('Property 19: Whitespace password rejection', () => {
    let argon2Module;

    beforeEach(() => {
        argon2Module = new Argon2Module();
    });

    it('any string composed entirely of whitespace is rejected', () => {
        const whitespaceOnlyArb = fc.stringOf(
            fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'),
            { minLength: 1, maxLength: 50 }
        );

        fc.assert(
            fc.property(whitespaceOnlyArb, (password) => {
                const result = argon2Module.validatePassword(password);
                return result.valid === false && result.error !== null;
            }),
            { numRuns: NUM_RUNS }
        );
    });

    it('any non-whitespace string with at least one visible character is accepted', () => {
        // Generate strings that have at least one non-whitespace character
        const nonWhitespaceArb = fc.tuple(
            fc.string({ minLength: 0, maxLength: 20 }),
            fc.char().filter(c => c.trim().length > 0),
            fc.string({ minLength: 0, maxLength: 20 })
        ).map(([a, visible, b]) => a + visible + b);

        fc.assert(
            fc.property(nonWhitespaceArb, (password) => {
                const result = argon2Module.validatePassword(password);
                return result.valid === true && result.error === null;
            }),
            { numRuns: NUM_RUNS }
        );
    });

    it('empty string is rejected', () => {
        const result = argon2Module.validatePassword('');
        expect(result.valid).toBe(false);
    });

    it('null and undefined are rejected', () => {
        expect(argon2Module.validatePassword(null).valid).toBe(false);
        expect(argon2Module.validatePassword(undefined).valid).toBe(false);
    });
});
