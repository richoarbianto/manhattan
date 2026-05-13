/**
 * Manhattan - StatusBar UI Component
 * Fixed-position status bar at the top of the viewport that displays:
 * - Connection status (connected/disconnected)
 * - Error messages (initialization failure, connection lost)
 * - Rate limit countdown timer
 * - Room full notification
 *
 * Appears/disappears with slide-down/slide-up animation.
 * Auto-hides after 5 seconds for non-persistent messages.
 *
 * Requirements: 4.6, 6.2, 6.4, 8.7, 3.7
 */

/**
 * Status types that determine the color scheme of the status bar.
 * @enum {string}
 */
const StatusType = {
    SUCCESS: 'success',   // Green — connected
    ERROR: 'error',       // Red — disconnected, init failure
    WARNING: 'warning',   // Amber — rate limited, room full
};

/**
 * Color mappings for each status type.
 * Uses terminal theme colors: green (#00ff41), red (#ff0040), amber (#ffb000).
 */
const STATUS_COLORS = {
    [StatusType.SUCCESS]: {
        border: '#00ff41',
        text: '#00ff41',
        dot: '#00ff41',
    },
    [StatusType.ERROR]: {
        border: '#ff0040',
        text: '#ff0040',
        dot: '#ff0040',
    },
    [StatusType.WARNING]: {
        border: '#ffb000',
        text: '#ffb000',
        dot: '#ffb000',
    },
};

/** Auto-hide delay for non-persistent messages (ms) */
const AUTO_HIDE_DELAY = 5000;

export class StatusBar {
    /**
     * @param {HTMLElement} containerElement - The parent element to append the status bar to.
     */
    constructor(containerElement) {
        /** @type {HTMLElement} */
        this._container = containerElement;

        /** @type {HTMLElement|null} */
        this._element = null;

        /** @type {HTMLElement|null} */
        this._dotElement = null;

        /** @type {HTMLElement|null} */
        this._textElement = null;

        /** @type {number|null} Timer ID for auto-hide */
        this._autoHideTimer = null;

        /** @type {number|null} Timer ID for countdown */
        this._countdownTimer = null;

        /** @type {boolean} Whether the bar is currently visible */
        this._visible = false;

        /** @type {boolean} Whether the current message is persistent (no auto-hide) */
        this._persistent = false;

        this.render();
    }

    /**
     * Renders the status bar element (hidden by default).
     * Creates the DOM structure and appends to the container.
     */
    render() {
        if (this._element) {
            return; // Already rendered
        }

        this._element = document.createElement('div');
        this._element.id = 'manhattan-status-bar';
        this._element.setAttribute('role', 'status');
        this._element.setAttribute('aria-live', 'polite');
        this._element.setAttribute('aria-atomic', 'true');

        // Fixed position at top, hidden by default (translated up)
        Object.assign(this._element.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            zIndex: '9999',
            transform: 'translateY(-100%)',
            opacity: '0',
            transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
            pointerEvents: 'none',
        });

        // Inner content wrapper
        const inner = document.createElement('div');
        Object.assign(inner.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: 'rgba(10, 10, 10, 0.95)',
            borderBottom: '1px solid #2a2a2a',
            borderLeft: '3px solid #00ff41',
            fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
            fontSize: '12px',
            backdropFilter: 'blur(4px)',
        });

        // Status dot indicator
        this._dotElement = document.createElement('span');
        Object.assign(this._dotElement.style, {
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#00ff41',
            flexShrink: '0',
        });

        // Status text
        this._textElement = document.createElement('span');
        this._textElement.style.color = '#00ff41';
        this._textElement.textContent = '';

        inner.appendChild(this._dotElement);
        inner.appendChild(this._textElement);
        this._element.appendChild(inner);

        this._container.appendChild(this._element);
    }

    /**
     * Removes the status bar from the DOM and cleans up timers.
     */
    destroy() {
        this.stopCountdown();
        this._clearAutoHideTimer();

        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }

        this._element = null;
        this._dotElement = null;
        this._textElement = null;
        this._visible = false;
    }

    /**
     * Show "Connected" status with green indicator.
     * Auto-hides after 5 seconds.
     */
    showConnected() {
        this._show('Connected', StatusType.SUCCESS, false);
    }

    /**
     * Show "Connection lost. Reconnecting..." with red indicator.
     * Persistent — does not auto-hide.
     */
    showDisconnected() {
        this._show('Connection lost. Reconnecting...', StatusType.ERROR, true);
    }

    /**
     * Show "Initialization failed. Please refresh." with red indicator.
     * Persistent — does not auto-hide.
     */
    showInitError() {
        this._show('Initialization failed. Please refresh.', StatusType.ERROR, true);
    }

    /**
     * Show rate limit countdown with amber indicator.
     * Displays "Rate limited. Try again in Xs" and counts down.
     * Persistent until countdown completes.
     *
     * @param {number} seconds - Number of seconds remaining in the lockout.
     */
    showRateLimited(seconds) {
        this.stopCountdown();
        this._show(`Rate limited. Try again in ${seconds}s`, StatusType.WARNING, true);
        this.startCountdown(seconds, () => {
            this.hide();
        });
    }

    /**
     * Show "Room is full (50/50)" with amber indicator.
     * Auto-hides after 5 seconds.
     */
    showRoomFull() {
        this._show('Room is full (50/50)', StatusType.WARNING, false);
    }

    /**
     * Show a generic error message with red indicator.
     * Auto-hides after 5 seconds.
     *
     * @param {string} message - The error message to display.
     */
    showError(message) {
        this._show(message, StatusType.ERROR, false);
    }

    /**
     * Hide the status bar with slide-up animation.
     */
    hide() {
        if (!this._element || !this._visible) {
            return;
        }

        this._clearAutoHideTimer();
        this._visible = false;
        this._persistent = false;

        Object.assign(this._element.style, {
            transform: 'translateY(-100%)',
            opacity: '0',
        });
    }

    /**
     * Start a countdown timer that updates the displayed text every second.
     *
     * @param {number} seconds - Total seconds to count down from.
     * @param {Function} [onComplete] - Callback invoked when countdown reaches 0.
     */
    startCountdown(seconds, onComplete) {
        this.stopCountdown();

        let remaining = seconds;

        this._countdownTimer = setInterval(() => {
            remaining--;

            if (remaining <= 0) {
                this.stopCountdown();
                if (onComplete) {
                    onComplete();
                }
                return;
            }

            // Update the text with remaining time
            if (this._textElement) {
                this._textElement.textContent = `Rate limited. Try again in ${remaining}s`;
            }
        }, 1000);
    }

    /**
     * Stop the countdown timer if running.
     */
    stopCountdown() {
        if (this._countdownTimer !== null) {
            clearInterval(this._countdownTimer);
            this._countdownTimer = null;
        }
    }

    /**
     * Internal method to display the status bar with given message and type.
     *
     * @param {string} message - The status message text.
     * @param {string} type - One of StatusType values (success, error, warning).
     * @param {boolean} persistent - If true, the bar won't auto-hide.
     * @private
     */
    _show(message, type, persistent) {
        if (!this._element) {
            return;
        }

        this._clearAutoHideTimer();
        this.stopCountdown();

        const colors = STATUS_COLORS[type];

        // Update colors
        const inner = this._element.firstChild;
        if (inner) {
            inner.style.borderLeftColor = colors.border;
        }
        if (this._dotElement) {
            this._dotElement.style.backgroundColor = colors.dot;
        }
        if (this._textElement) {
            this._textElement.style.color = colors.text;
            this._textElement.textContent = message;
        }

        // Show with slide-down animation
        this._visible = true;
        this._persistent = persistent;

        Object.assign(this._element.style, {
            transform: 'translateY(0)',
            opacity: '1',
        });

        // Auto-hide for non-persistent messages
        if (!persistent) {
            this._autoHideTimer = setTimeout(() => {
                this.hide();
            }, AUTO_HIDE_DELAY);
        }
    }

    /**
     * Clear the auto-hide timer if active.
     * @private
     */
    _clearAutoHideTimer() {
        if (this._autoHideTimer !== null) {
            clearTimeout(this._autoHideTimer);
            this._autoHideTimer = null;
        }
    }
}
