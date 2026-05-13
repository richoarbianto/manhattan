// Manhattan - Argon2id Password Hashing Module
// Uses argon2-browser (WASM) for client-side password hashing
// Requirements: 1.7, 3.2, 3.3

// argon2-browser is loaded via CDN in index.html and available as window.argon2
// For Node.js tests, it's imported from the npm package
const getArgon2 = () => {
    if (typeof window !== 'undefined' && window.argon2) {
        return window.argon2;
    }
    // Fallback for Node.js test environment
    return null;
};

export class Argon2Module {
    constructor() {
        // Fixed Argon2id parameters as specified in requirements
        this.timeCost = 3;          // 3 iterations
        this.memoryCost = 65536;    // 64 MB
        this.parallelism = 4;       // 4 parallel lanes
        this.hashLength = 32;       // 32-byte hash output
    }

    /**
     * Validates that a password is not empty or whitespace-only.
     * @param {string} password - The password to validate
     * @returns {{ valid: boolean, error: string|null }}
     */
    validatePassword(password) {
        if (password === null || password === undefined) {
            return { valid: false, error: 'Password is required' };
        }

        if (typeof password !== 'string') {
            return { valid: false, error: 'Password must be a string' };
        }

        if (password.trim().length === 0) {
            return { valid: false, error: 'Password cannot be empty or whitespace-only' };
        }

        return { valid: true, error: null };
    }

    /**
     * Hashes a password using Argon2id with fixed parameters.
     * Generates a random 16-byte salt per hash operation.
     * @param {string} password - The password to hash
     * @returns {Promise<string>} The encoded Argon2id hash string (PHC format)
     * @throws {Error} If password is empty/whitespace-only or hashing fails
     */
    async hash(password) {
        const validation = this.validatePassword(password);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        const argon2 = getArgon2();
        if (!argon2) {
            throw new Error('Argon2 library not loaded');
        }

        // Generate random 16-byte salt
        const salt = new Uint8Array(16);
        crypto.getRandomValues(salt);

        const result = await argon2.hash({
            pass: password,
            salt: salt,
            type: argon2.ArgonType.Argon2id,
            time: this.timeCost,
            mem: this.memoryCost,
            parallelism: this.parallelism,
            hashLen: this.hashLength,
        });

        // Return the full encoded hash string (PHC format: $argon2id$v=19$m=65536,t=3,p=4$salt$hash)
        return result.encoded;
    }
}
