import { CryptoModule } from './crypto.js';

describe('CryptoModule', () => {
    let cryptoModule;

    beforeAll(() => {
        cryptoModule = new CryptoModule();
    });

    describe('generateRsaKeyPair', () => {
        it('should generate a valid RSA key pair', async () => {
            const { publicKey, privateKey } = await cryptoModule.generateRsaKeyPair();
            expect(publicKey).toBeDefined();
            expect(privateKey).toBeDefined();
            expect(publicKey.type).toBe('public');
            expect(privateKey.type).toBe('private');
            expect(publicKey.algorithm.name).toBe('RSA-OAEP');
            expect(publicKey.algorithm.modulusLength).toBe(2048);
            expect(publicKey.algorithm.hash.name).toBe('SHA-256');
        });
    });

    describe('generateAesKey', () => {
        it('should generate a valid AES-GCM 256-bit key', async () => {
            const aesKey = await cryptoModule.generateAesKey();
            expect(aesKey).toBeDefined();
            expect(aesKey.type).toBe('secret');
            expect(aesKey.algorithm.name).toBe('AES-GCM');
            expect(aesKey.algorithm.length).toBe(256);
        });
    });

    describe('encryptMessage / decryptMessage', () => {
        it('should encrypt and decrypt a message correctly', async () => {
            const aesKey = await cryptoModule.generateAesKey();
            const plaintext = 'Hello, Manhattan!';

            const { ciphertext, iv } = await cryptoModule.encryptMessage(plaintext, aesKey);
            expect(typeof ciphertext).toBe('string');
            expect(typeof iv).toBe('string');
            expect(ciphertext.length).toBeGreaterThan(0);
            expect(iv.length).toBeGreaterThan(0);

            const decrypted = await cryptoModule.decryptMessage(ciphertext, iv, aesKey);
            expect(decrypted).toBe(plaintext);
        });

        it('should produce different ciphertexts for the same plaintext (random IV)', async () => {
            const aesKey = await cryptoModule.generateAesKey();
            const plaintext = 'Same message';

            const result1 = await cryptoModule.encryptMessage(plaintext, aesKey);
            const result2 = await cryptoModule.encryptMessage(plaintext, aesKey);

            expect(result1.iv).not.toBe(result2.iv);
            expect(result1.ciphertext).not.toBe(result2.ciphertext);
        });

        it('should handle empty string', async () => {
            const aesKey = await cryptoModule.generateAesKey();
            const plaintext = '';

            const { ciphertext, iv } = await cryptoModule.encryptMessage(plaintext, aesKey);
            const decrypted = await cryptoModule.decryptMessage(ciphertext, iv, aesKey);
            expect(decrypted).toBe(plaintext);
        });

        it('should handle unicode characters', async () => {
            const aesKey = await cryptoModule.generateAesKey();
            const plaintext = '你好世界 🌍 مرحبا';

            const { ciphertext, iv } = await cryptoModule.encryptMessage(plaintext, aesKey);
            const decrypted = await cryptoModule.decryptMessage(ciphertext, iv, aesKey);
            expect(decrypted).toBe(plaintext);
        });
    });

    describe('encryptAesKeyWithRsa / decryptAesKeyWithRsa', () => {
        it('should encrypt and decrypt an AES key using RSA', async () => {
            const { publicKey, privateKey } = await cryptoModule.generateRsaKeyPair();
            const aesKey = await cryptoModule.generateAesKey();

            const encryptedKeyB64 = await cryptoModule.encryptAesKeyWithRsa(aesKey, publicKey);
            expect(typeof encryptedKeyB64).toBe('string');
            expect(encryptedKeyB64.length).toBeGreaterThan(0);

            const decryptedKey = await cryptoModule.decryptAesKeyWithRsa(encryptedKeyB64, privateKey);
            expect(decryptedKey).toBeDefined();
            expect(decryptedKey.type).toBe('secret');
            expect(decryptedKey.algorithm.name).toBe('AES-GCM');
            expect(decryptedKey.algorithm.length).toBe(256);

            // Verify the decrypted key works the same as the original
            const plaintext = 'Test message for key exchange';
            const { ciphertext, iv } = await cryptoModule.encryptMessage(plaintext, aesKey);
            const decrypted = await cryptoModule.decryptMessage(ciphertext, iv, decryptedKey);
            expect(decrypted).toBe(plaintext);
        });
    });

    describe('exportPublicKey / importPublicKey', () => {
        it('should export and import an RSA public key', async () => {
            const { publicKey } = await cryptoModule.generateRsaKeyPair();

            const exported = await cryptoModule.exportPublicKey(publicKey);
            expect(typeof exported).toBe('string');
            expect(exported.length).toBeGreaterThan(0);

            const imported = await cryptoModule.importPublicKey(exported);
            expect(imported).toBeDefined();
            expect(imported.type).toBe('public');
            expect(imported.algorithm.name).toBe('RSA-OAEP');
            expect(imported.algorithm.modulusLength).toBe(2048);
        });

        it('should produce a key that can encrypt after import', async () => {
            const { publicKey, privateKey } = await cryptoModule.generateRsaKeyPair();
            const aesKey = await cryptoModule.generateAesKey();

            // Export and re-import the public key
            const exported = await cryptoModule.exportPublicKey(publicKey);
            const imported = await cryptoModule.importPublicKey(exported);

            // Use the imported key to encrypt
            const encryptedKeyB64 = await cryptoModule.encryptAesKeyWithRsa(aesKey, imported);
            const decryptedKey = await cryptoModule.decryptAesKeyWithRsa(encryptedKeyB64, privateKey);

            // Verify the round-trip works
            const plaintext = 'Round-trip test';
            const { ciphertext, iv } = await cryptoModule.encryptMessage(plaintext, aesKey);
            const decrypted = await cryptoModule.decryptMessage(ciphertext, iv, decryptedKey);
            expect(decrypted).toBe(plaintext);
        });
    });

    describe('error handling', () => {
        it('should fail to decrypt with a wrong AES key', async () => {
            const correctKey = await cryptoModule.generateAesKey();
            const wrongKey = await cryptoModule.generateAesKey();
            const plaintext = 'Secret message';

            const { ciphertext, iv } = await cryptoModule.encryptMessage(plaintext, correctKey);

            await expect(
                cryptoModule.decryptMessage(ciphertext, iv, wrongKey)
            ).rejects.toThrow();
        });

        it('should fail to decrypt with a wrong RSA private key', async () => {
            const keyPair1 = await cryptoModule.generateRsaKeyPair();
            const keyPair2 = await cryptoModule.generateRsaKeyPair();
            const aesKey = await cryptoModule.generateAesKey();

            // Encrypt with keyPair1's public key
            const encryptedKeyB64 = await cryptoModule.encryptAesKeyWithRsa(aesKey, keyPair1.publicKey);

            // Try to decrypt with keyPair2's private key — should fail
            await expect(
                cryptoModule.decryptAesKeyWithRsa(encryptedKeyB64, keyPair2.privateKey)
            ).rejects.toThrow();
        });

        it('should fail to import an invalid public key string', async () => {
            const invalidKey = 'not-a-valid-base64-spki-key!!!';

            await expect(
                cryptoModule.importPublicKey(invalidKey)
            ).rejects.toThrow();
        });
    });
});
