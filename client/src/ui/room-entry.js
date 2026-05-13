/**
 * Manhattan - Room Entry Screen UI
 * Professional terminal/hacker aesthetic room entry interface.
 * Requirements: 1.3, 1.4, 1.5, 2.1, 2.3, 2.4, 3.1, 3.6, 3.7
 */

export class RoomEntryUI {
    constructor(containerElement) {
        this._container = containerElement;
        this._el = {};
        this._createRoomCallback = null;
        this._joinRoomCallback = null;
        this._passwordModalCleanup = null;
        this._createModalCleanup = null;
    }

    render() {
        this._container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-center justify-center min-h-[60vh] relative';
        wrapper.innerHTML = this._buildTemplate();
        this._container.appendChild(wrapper);
        this._cache(wrapper);
        this._bind();
    }

    destroy() {
        this._unbind();
        this._container.innerHTML = '';
        this._el = {};
    }

    getRoomNameInput() {
        return this._el.roomInput?.value ?? '';
    }

    getDisplayName() {
        return this._el.displayNameInput?.value ?? '';
    }

    showValidationError(msg) {
        if (!this._el.validationErr) return;
        this._el.validationErr.textContent = msg;
        this._el.validationErr.classList.remove('hidden');
        this._el.roomInput?.classList.add('border-terminal-red');
        this._el.roomInput?.classList.remove('border-terminal-green');
    }

    clearValidationError() {
        if (!this._el.validationErr) return;
        this._el.validationErr.textContent = '';
        this._el.validationErr.classList.add('hidden');
        this._el.roomInput?.classList.remove('border-terminal-red');
        const v = this._el.roomInput?.value ?? '';
        if (v.length >= 3 && /^[a-zA-Z0-9]+$/.test(v) && v.length <= 15) {
            this._el.roomInput?.classList.add('border-terminal-green');
        }
    }

    showServerError(msg) {
        if (!this._el.serverErr) return;
        this._el.serverErr.textContent = '⚠ ' + msg;
        this._el.serverErr.classList.remove('hidden');
    }

    clearServerError() {
        if (!this._el.serverErr) return;
        this._el.serverErr.textContent = '';
        this._el.serverErr.classList.add('hidden');
    }

    setLoading(on) {
        ['createBtn', 'joinBtn'].forEach(k => {
            if (!this._el[k]) return;
            this._el[k].disabled = on;
            this._el[k].classList.toggle('opacity-50', on);
            this._el[k].classList.toggle('cursor-not-allowed', on);
        });
        this._el.loadingIndicator?.classList.toggle('hidden', !on);
    }

    onCreateRoom(cb) { this._createRoomCallback = cb; }
    onJoinRoom(cb)   { this._joinRoomCallback = cb; }

    // ── Create Room Modal ────────────────────────────────────────────────────

    /**
     * Show the "Create Room" modal with optional password toggle.
     * @param {Function} onSubmit - Called with { password: string|null }
     * @param {Function} onCancel
     */
    showCreateModal(onSubmit, onCancel) {
        const modal = this._el.createModal;
        if (!modal) return;

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        const pwToggle  = modal.querySelector('[data-create-pw-toggle]');
        const pwSection = modal.querySelector('[data-create-pw-section]');
        const pwInput   = modal.querySelector('[data-create-pw-input]');
        const pwConfirm = modal.querySelector('[data-create-pw-confirm]');
        const pwErr     = modal.querySelector('[data-create-pw-error]');
        const submitBtn = modal.querySelector('[data-create-submit]');
        const cancelBtn = modal.querySelector('[data-create-cancel]');

        // Reset state
        pwToggle.checked = false;
        pwSection.classList.add('hidden');
        pwInput.value = '';
        pwConfirm.value = '';
        pwErr.classList.add('hidden');
        pwErr.textContent = '';

        const togglePw = () => {
            pwSection.classList.toggle('hidden', !pwToggle.checked);
            if (pwToggle.checked) pwInput.focus();
        };

        const handleSubmit = () => {
            let password = null;
            if (pwToggle.checked) {
                const p1 = pwInput.value;
                const p2 = pwConfirm.value;
                if (!p1 || p1.trim() === '') {
                    pwErr.textContent = 'Password cannot be empty';
                    pwErr.classList.remove('hidden');
                    return;
                }
                if (p1 !== p2) {
                    pwErr.textContent = 'Passwords do not match';
                    pwErr.classList.remove('hidden');
                    return;
                }
                password = p1;
            }
            cleanup();
            this.hideCreateModal();
            if (onSubmit) onSubmit({ password });
        };

        const handleCancel = () => {
            cleanup();
            this.hideCreateModal();
            if (onCancel) onCancel();
        };

        const handleKeydown = (e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') handleCancel();
        };

        const cleanup = () => {
            pwToggle.removeEventListener('change', togglePw);
            submitBtn.removeEventListener('click', handleSubmit);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('keydown', handleKeydown);
        };

        pwToggle.addEventListener('change', togglePw);
        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('keydown', handleKeydown);
        this._createModalCleanup = cleanup;
    }

    hideCreateModal() {
        const modal = this._el.createModal;
        if (!modal) return;
        if (this._createModalCleanup) { this._createModalCleanup(); this._createModalCleanup = null; }
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // ── Join Password Modal ──────────────────────────────────────────────────

    showPasswordModal(onSubmit, onCancel) {
        const modal = this._el.passwordModal;
        if (!modal) return;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        this.showPasswordError('');

        const pwInput   = modal.querySelector('[data-password-input]');
        const submitBtn = modal.querySelector('[data-password-submit]');
        const cancelBtn = modal.querySelector('[data-password-cancel]');

        pwInput.value = '';
        setTimeout(() => pwInput.focus(), 50);

        const handleSubmit = () => {
            if (onSubmit) onSubmit(pwInput.value);
        };

        const handleCancel = () => {
            cleanup();
            this.hidePasswordModal();
            if (onCancel) onCancel();
        };

        const handleKeydown = (e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') handleCancel();
        };

        const cleanup = () => {
            submitBtn.removeEventListener('click', handleSubmit);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('keydown', handleKeydown);
        };

        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('keydown', handleKeydown);
        this._passwordModalCleanup = cleanup;
    }

    hidePasswordModal() {
        const modal = this._el.passwordModal;
        if (!modal) return;
        if (this._passwordModalCleanup) { this._passwordModalCleanup(); this._passwordModalCleanup = null; }
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    showPasswordError(msg) {
        const el = this._el.passwordModal?.querySelector('[data-password-error]');
        if (!el) return;
        el.textContent = msg;
        el.classList.toggle('hidden', !msg);
    }

    // ── Confirmation Modal ───────────────────────────────────────────────────

    showConfirmationModal(participantCount, onConfirm, onDecline) {
        const modal = this._el.confirmModal;
        if (!modal) return;

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        const countEl = modal.querySelector('[data-participant-count]');
        if (countEl) countEl.textContent = `Terdapat ${participantCount} orang sedang online di ruangan ini. Ingin bergabung?`;

        const yesBtn = modal.querySelector('[data-confirm-yes]');
        const noBtn  = modal.querySelector('[data-confirm-no]');

        const cleanup = () => {
            yesBtn.removeEventListener('click', handleYes);
            noBtn.removeEventListener('click', handleNo);
        };

        const handleYes = () => { cleanup(); this.hideConfirmationModal(); if (onConfirm) onConfirm(); };
        const handleNo  = () => { cleanup(); this.hideConfirmationModal(); if (onDecline) onDecline(); };

        yesBtn.addEventListener('click', handleYes);
        noBtn.addEventListener('click', handleNo);
    }

    hideConfirmationModal() {
        const modal = this._el.confirmModal;
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // ── Private ──────────────────────────────────────────────────────────────

    _buildTemplate() {
        return `
        <!-- Scanline overlay -->
        <div class="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
             style="background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,65,.15) 2px,rgba(0,255,65,.15) 4px)"></div>

        <!-- Main panel -->
        <div class="terminal-panel w-full max-w-md relative z-10">
            <!-- macOS-style traffic lights -->
            <div class="flex items-center gap-2 mb-6 pb-3 border-b border-terminal-border">
                <span class="w-3 h-3 rounded-full bg-[#ff5f57]"></span>
                <span class="w-3 h-3 rounded-full bg-[#febc2e]"></span>
                <span class="w-3 h-3 rounded-full bg-[#28c840]"></span>
                <span class="ml-3 text-terminal-muted text-xs tracking-widest">manhattan@secure:~$</span>
            </div>

            <!-- Title -->
            <div class="text-center mb-6 overflow-hidden">
                <p class="text-terminal-muted text-xs mt-2 tracking-widest">[ E2E ENCRYPTED · ANONYMOUS · EPHEMERAL ]</p>
            </div>

            <!-- Room name input -->
            <div class="mb-5">
                <label class="flex items-center gap-2 text-terminal-cyan text-xs mb-2 uppercase tracking-widest">
                    <span class="text-terminal-green">$</span> display_name
                </label>
                <div class="relative">
                    <input type="text" data-display-name-input
                        class="terminal-input w-full pr-8 font-mono tracking-wider"
                        maxlength="30" autocomplete="off" spellcheck="false"/>
                </div>
            </div>

            <!-- Room name input -->
            <div class="mb-5">
                <label class="flex items-center gap-2 text-terminal-cyan text-xs mb-2 uppercase tracking-widest">
                    <span class="text-terminal-green">$</span> room_name
                </label>
                <div class="relative">
                    <input type="text" data-room-name-input
                        class="terminal-input w-full pr-8 font-mono tracking-wider"
                        placeholder="e.g. darknet42"
                        maxlength="15" autocomplete="off" spellcheck="false"/>
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-terminal-green animate-blink" data-cursor-blink></span>
                </div>
                <div class="flex justify-between mt-1">
                    <p class="text-terminal-red text-xs hidden" data-validation-error></p>
                    <p class="text-terminal-muted text-xs ml-auto" id="char-counter">0/15</p>
                </div>
            </div>

            <!-- Action buttons -->
            <div class="grid grid-cols-2 gap-3 mb-4">
                <button data-create-btn
                    class="terminal-button group relative overflow-hidden">
                    <span class="relative z-10 flex items-center justify-center gap-2">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        Create Room
                    </span>
                </button>
                <button data-join-btn
                    class="terminal-button border-terminal-cyan text-terminal-cyan hover:bg-terminal-cyan hover:text-terminal-bg hover:shadow-glow-cyan group relative overflow-hidden">
                    <span class="relative z-10 flex items-center justify-center gap-2">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
                        </svg>
                        Join Room
                    </span>
                </button>
            </div>

            <!-- Loading -->
            <div class="text-center hidden py-2" data-loading-indicator>
                <span class="text-terminal-green text-xs tracking-widest animate-pulse-glow">PROCESSING</span>
                <span class="inline-block w-[2px] h-3 bg-terminal-green animate-blink ml-1"></span>
            </div>

            <!-- Server error -->
            <div class="hidden mt-3 px-3 py-2 border border-terminal-red rounded bg-terminal-bg text-terminal-red text-xs" data-server-error>
            </div>

            <!-- Info footer -->
            <div class="mt-6 pt-4 border-t border-terminal-border text-center">
                <p class="text-terminal-muted text-xs">
                    <span class="text-terminal-green">✓</span> E2EE &nbsp;·&nbsp;
                    <span class="text-terminal-green">✓</span> No accounts &nbsp;·&nbsp;
                    <span class="text-terminal-green">✓</span> No logs
                </p>
            </div>
        </div>

        <!-- ── CREATE ROOM MODAL ─────────────────────────────────────────── -->
        <div data-create-modal class="fixed inset-0 z-50 hidden items-center justify-center">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" data-create-backdrop></div>
            <div class="terminal-panel relative z-10 w-full max-w-sm mx-4 animate-slide-down">
                <div class="flex items-center justify-between mb-5 pb-3 border-b border-terminal-border">
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-terminal-green animate-pulse"></span>
                        <span class="text-terminal-green text-xs tracking-widest uppercase">Create New Room</span>
                    </div>
                    <button data-create-cancel class="text-terminal-muted hover:text-terminal-red text-lg leading-none">✕</button>
                </div>

                <!-- Room name display (read-only) -->
                <div class="mb-5 px-3 py-2 bg-terminal-bg border border-terminal-border rounded">
                    <p class="text-terminal-muted text-xs mb-1">Room name</p>
                    <p class="text-terminal-green font-mono text-sm" data-create-room-name-display>—</p>
                </div>

                <!-- Password toggle -->
                <div class="mb-4">
                    <label class="flex items-center gap-3 cursor-pointer group">
                        <div class="relative">
                            <input type="checkbox" data-create-pw-toggle class="sr-only peer"/>
                            <div class="w-10 h-5 bg-terminal-border rounded-full peer-checked:bg-terminal-green transition-colors duration-200"></div>
                            <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-terminal-bg rounded-full transition-transform duration-200 peer-checked:translate-x-5"></div>
                        </div>
                        <span class="text-terminal-text text-sm">Set room password</span>
                        <span class="text-terminal-muted text-xs">(optional)</span>
                    </label>
                </div>

                <!-- Password fields (hidden by default) -->
                <div data-create-pw-section class="hidden space-y-3 mb-4">
                    <div>
                        <label class="text-terminal-cyan text-xs uppercase tracking-wide mb-1 block">Password</label>
                        <input type="password" data-create-pw-input
                            class="terminal-input w-full"
                            placeholder="Enter password..."
                            maxlength="128" autocomplete="new-password"/>
                    </div>
                    <div>
                        <label class="text-terminal-cyan text-xs uppercase tracking-wide mb-1 block">Confirm Password</label>
                        <input type="password" data-create-pw-confirm
                            class="terminal-input w-full"
                            placeholder="Confirm password..."
                            maxlength="128" autocomplete="new-password"/>
                    </div>
                    <p class="text-terminal-red text-xs hidden" data-create-pw-error></p>
                </div>

                <div class="flex gap-3">
                    <button data-create-submit class="terminal-button flex-1">
                        Create Room
                    </button>
                    <button data-create-cancel class="terminal-button flex-1 border-terminal-muted text-terminal-muted hover:bg-terminal-panel hover:shadow-none">
                        Cancel
                    </button>
                </div>
            </div>
        </div>

        <!-- ── JOIN PASSWORD MODAL ──────────────────────────────────────── -->
        <div data-password-modal class="fixed inset-0 z-50 hidden items-center justify-center">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
            <div class="terminal-panel relative z-10 w-full max-w-sm mx-4 animate-slide-down">
                <div class="flex items-center justify-between mb-5 pb-3 border-b border-terminal-border">
                    <div class="flex items-center gap-2">
                        <span class="text-terminal-amber text-base">🔒</span>
                        <span class="text-terminal-amber text-xs tracking-widest uppercase">Password Required</span>
                    </div>
                    <button data-password-cancel class="text-terminal-muted hover:text-terminal-red text-lg leading-none">✕</button>
                </div>

                <p class="text-terminal-muted text-xs mb-4">This room is password-protected. Enter the password to join.</p>

                <div class="mb-4">
                    <label class="text-terminal-cyan text-xs uppercase tracking-wide mb-1 block">Password</label>
                    <input type="password" data-password-input
                        class="terminal-input w-full"
                        placeholder="Enter room password..."
                        maxlength="128" autocomplete="off"/>
                </div>

                <p class="text-terminal-red text-xs mb-3 hidden" data-password-error></p>

                <div class="flex gap-3">
                    <button data-password-submit class="terminal-button flex-1">
                        Join Room
                    </button>
                    <button data-password-cancel class="terminal-button flex-1 border-terminal-muted text-terminal-muted hover:bg-terminal-panel hover:shadow-none">
                        Cancel
                    </button>
                </div>
            </div>
        </div>

        <!-- ── CONFIRMATION MODAL ───────────────────────────────────────── -->
        <div data-confirmation-modal class="fixed inset-0 z-50 hidden items-center justify-center">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
            <div class="terminal-panel relative z-10 w-full max-w-sm mx-4 animate-slide-down">
                <div class="flex items-center gap-2 mb-5 pb-3 border-b border-terminal-border">
                    <span class="text-terminal-cyan text-base">👥</span>
                    <span class="text-terminal-cyan text-xs tracking-widest uppercase">Join Room</span>
                </div>

                <p class="text-terminal-text text-sm mb-6 leading-relaxed" data-participant-count>
                    Terdapat 0 orang sedang online di ruangan ini. Ingin bergabung?
                </p>

                <div class="flex gap-3">
                    <button data-confirm-yes class="terminal-button flex-1">
                        Ya, Bergabung
                    </button>
                    <button data-confirm-no class="terminal-button flex-1 border-terminal-muted text-terminal-muted hover:bg-terminal-panel hover:shadow-none">
                        Tidak
                    </button>
                </div>
            </div>
        </div>
        `;
    }

    _cache(wrapper) {
        this._el = {
            displayNameInput:  wrapper.querySelector('[data-display-name-input]'),
            roomInput:         wrapper.querySelector('[data-room-name-input]'),
            validationErr:     wrapper.querySelector('[data-validation-error]'),
            createBtn:         wrapper.querySelector('[data-create-btn]'),
            joinBtn:           wrapper.querySelector('[data-join-btn]'),
            loadingIndicator:  wrapper.querySelector('[data-loading-indicator]'),
            serverErr:         wrapper.querySelector('[data-server-error]'),
            cursorBlink:       wrapper.querySelector('[data-cursor-blink]'),
            charCounter:       wrapper.querySelector('#char-counter'),
            createModal:       wrapper.querySelector('[data-create-modal]'),
            passwordModal:     wrapper.querySelector('[data-password-modal]'),
            confirmModal:      wrapper.querySelector('[data-confirmation-modal]'),
        };

        // Set default display name
        if (this._el.displayNameInput) {
            this._el.displayNameInput.value = `User ${Math.floor(10000 + Math.random() * 90000)}`;
        }
    }

    _bind() {
        this._onInput = () => {
            const v = this._el.roomInput.value;
            if (this._el.charCounter) this._el.charCounter.textContent = `${v.length}/15`;
            this.clearServerError();
            if (!v) {
                this.clearValidationError();
                this._el.roomInput.classList.remove('border-terminal-green', 'border-terminal-red');
                return;
            }
            if (v.length < 3) this.showValidationError('Min 3 characters');
            else if (/\s/.test(v)) this.showValidationError('No spaces allowed');
            else if (!/^[a-zA-Z0-9]*$/.test(v)) this.showValidationError('Alphanumeric only');
            else this.clearValidationError();
        };

        this._onCreate = () => { if (this._createRoomCallback) this._createRoomCallback(); };
        this._onJoin   = () => { if (this._joinRoomCallback) this._joinRoomCallback(); };
        this._onEnter  = (e) => { if (e.key === 'Enter') this._onJoin(); };
        this._onFocus  = () => this._el.cursorBlink?.classList.add('hidden');
        this._onBlur   = () => { if (!this._el.roomInput?.value) this._el.cursorBlink?.classList.remove('hidden'); };

        this._el.roomInput?.addEventListener('input', this._onInput);
        this._el.roomInput?.addEventListener('keydown', this._onEnter);
        this._el.roomInput?.addEventListener('focus', this._onFocus);
        this._el.roomInput?.addEventListener('blur', this._onBlur);
        this._el.createBtn?.addEventListener('click', this._onCreate);
        this._el.joinBtn?.addEventListener('click', this._onJoin);

        // Close modals on backdrop click
        this._el.createModal?.querySelector('[data-create-backdrop]')?.addEventListener('click', () => this.hideCreateModal());
    }

    _unbind() {
        this._el.roomInput?.removeEventListener('input', this._onInput);
        this._el.roomInput?.removeEventListener('keydown', this._onEnter);
        this._el.roomInput?.removeEventListener('focus', this._onFocus);
        this._el.roomInput?.removeEventListener('blur', this._onBlur);
        this._el.createBtn?.removeEventListener('click', this._onCreate);
        this._el.joinBtn?.removeEventListener('click', this._onJoin);
    }

    /** Show the room name in the create modal header */
    setCreateModalRoomName(name) {
        const el = this._el.createModal?.querySelector('[data-create-room-name-display]');
        if (el) el.textContent = name;
    }
}
