/**
 * @jest-environment jsdom
 */

/**
 * Manhattan - StatusBar Unit Tests
 * Tests for the connection status and error handling UI component.
 *
 * Requirements: 4.6, 6.2, 6.4, 8.7, 3.7
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { StatusBar } from './status-bar.js';

describe('StatusBar', () => {
    let container;
    let statusBar;

    beforeEach(() => {
        jest.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        statusBar = new StatusBar(container);
    });

    afterEach(() => {
        if (statusBar) {
            statusBar.destroy();
        }
        if (container && container.parentNode) {
            document.body.removeChild(container);
        }
        jest.useRealTimers();
    });

    describe('render()', () => {
        it('should create a status bar element in the container', () => {
            const el = container.querySelector('#manhattan-status-bar');
            expect(el).not.toBeNull();
        });

        it('should be hidden by default (translated up)', () => {
            const el = container.querySelector('#manhattan-status-bar');
            expect(el.style.transform).toBe('translateY(-100%)');
            expect(el.style.opacity).toBe('0');
        });

        it('should have role="status" for accessibility', () => {
            const el = container.querySelector('#manhattan-status-bar');
            expect(el.getAttribute('role')).toBe('status');
            expect(el.getAttribute('aria-live')).toBe('polite');
        });

        it('should not render twice if called again', () => {
            statusBar.render();
            const elements = container.querySelectorAll('#manhattan-status-bar');
            expect(elements.length).toBe(1);
        });
    });

    describe('showConnected()', () => {
        it('should display "Connected" message', () => {
            statusBar.showConnected();
            const el = container.querySelector('#manhattan-status-bar');
            expect(el.style.transform).toBe('translateY(0)');
            expect(el.style.opacity).toBe('1');
            expect(el.textContent).toContain('Connected');
        });

        it('should use green color for the dot indicator', () => {
            statusBar.showConnected();
            const el = container.querySelector('#manhattan-status-bar');
            const dot = el.querySelector('span');
            expect(dot.style.backgroundColor).toBe('rgb(0, 255, 65)');
        });

        it('should auto-hide after 5 seconds', () => {
            statusBar.showConnected();
            const el = container.querySelector('#manhattan-status-bar');

            expect(el.style.opacity).toBe('1');

            jest.advanceTimersByTime(5000);

            expect(el.style.transform).toBe('translateY(-100%)');
            expect(el.style.opacity).toBe('0');
        });
    });

    describe('showDisconnected()', () => {
        it('should display "Connection lost. Reconnecting..." message', () => {
            statusBar.showDisconnected();
            const el = container.querySelector('#manhattan-status-bar');
            expect(el.textContent).toContain('Connection lost. Reconnecting...');
        });

        it('should use red color for the dot indicator', () => {
            statusBar.showDisconnected();
            const el = container.querySelector('#manhattan-status-bar');
            const dot = el.querySelector('span');
            expect(dot.style.backgroundColor).toBe('rgb(255, 0, 64)');
        });

        it('should be persistent (not auto-hide)', () => {
            statusBar.showDisconnected();
            const el = container.querySelector('#manhattan-status-bar');

            jest.advanceTimersByTime(10000);

            // Should still be visible
            expect(el.style.opacity).toBe('1');
            expect(el.style.transform).toBe('translateY(0)');
        });
    });

    describe('showInitError()', () => {
        it('should display "Initialization failed. Please refresh." message', () => {
            statusBar.showInitError();
            const el = container.querySelector('#manhattan-status-bar');
            expect(el.textContent).toContain('Initialization failed. Please refresh.');
        });

        it('should use red color for the dot indicator', () => {
            statusBar.showInitError();
            const el = container.querySelector('#manhattan-status-bar');
            const dot = el.querySelector('span');
            expect(dot.style.backgroundColor).toBe('rgb(255, 0, 64)');
        });

        it('should be persistent (not auto-hide)', () => {
            statusBar.showInitError();
            const el = container.querySelector('#manhattan-status-bar');

            jest.advanceTimersByTime(10000);

            expect(el.style.opacity).toBe('1');
        });
    });

    describe('showRateLimited(seconds)', () => {
        it('should display rate limit message with countdown', () => {
            statusBar.showRateLimited(60);
            const el = container.querySelector('#manhattan-status-bar');
            expect(el.textContent).toContain('Rate limited. Try again in 60s');
        });

        it('should use amber color for the dot indicator', () => {
            statusBar.showRateLimited(30);
            const el = container.querySelector('#manhattan-status-bar');
            const dot = el.querySelector('span');
            expect(dot.style.backgroundColor).toBe('rgb(255, 176, 0)');
        });

        it('should count down every second', () => {
            statusBar.showRateLimited(5);
            const el = container.querySelector('#manhattan-status-bar');

            jest.advanceTimersByTime(1000);
            expect(el.textContent).toContain('Try again in 4s');

            jest.advanceTimersByTime(1000);
            expect(el.textContent).toContain('Try again in 3s');

            jest.advanceTimersByTime(1000);
            expect(el.textContent).toContain('Try again in 2s');
        });

        it('should auto-hide when countdown reaches 0', () => {
            statusBar.showRateLimited(3);
            const el = container.querySelector('#manhattan-status-bar');

            jest.advanceTimersByTime(3000);

            expect(el.style.transform).toBe('translateY(-100%)');
            expect(el.style.opacity).toBe('0');
        });

        it('should be persistent during countdown', () => {
            statusBar.showRateLimited(60);
            const el = container.querySelector('#manhattan-status-bar');

            jest.advanceTimersByTime(5000);

            // Should still be visible (not auto-hidden)
            expect(el.style.opacity).toBe('1');
        });
    });

    describe('showRoomFull()', () => {
        it('should display "Room is full (50/50)" message', () => {
            statusBar.showRoomFull();
            const el = container.querySelector('#manhattan-status-bar');
            expect(el.textContent).toContain('Room is full (50/50)');
        });

        it('should use amber color for the dot indicator', () => {
            statusBar.showRoomFull();
            const el = container.querySelector('#manhattan-status-bar');
            const dot = el.querySelector('span');
            expect(dot.style.backgroundColor).toBe('rgb(255, 176, 0)');
        });

        it('should auto-hide after 5 seconds', () => {
            statusBar.showRoomFull();
            const el = container.querySelector('#manhattan-status-bar');

            jest.advanceTimersByTime(5000);

            expect(el.style.transform).toBe('translateY(-100%)');
            expect(el.style.opacity).toBe('0');
        });
    });

    describe('showError(message)', () => {
        it('should display the provided error message', () => {
            statusBar.showError('Something went wrong');
            const el = container.querySelector('#manhattan-status-bar');
            expect(el.textContent).toContain('Something went wrong');
        });

        it('should use red color for the dot', () => {
            statusBar.showError('Test error');
            const el = container.querySelector('#manhattan-status-bar');
            const dot = el.querySelector('span');
            expect(dot.style.backgroundColor).toBe('rgb(255, 0, 64)');
        });

        it('should auto-hide after 5 seconds', () => {
            statusBar.showError('Temporary error');
            const el = container.querySelector('#manhattan-status-bar');

            jest.advanceTimersByTime(5000);

            expect(el.style.transform).toBe('translateY(-100%)');
        });
    });

    describe('hide()', () => {
        it('should hide the status bar', () => {
            statusBar.showConnected();
            statusBar.hide();
            const el = container.querySelector('#manhattan-status-bar');
            expect(el.style.transform).toBe('translateY(-100%)');
            expect(el.style.opacity).toBe('0');
        });

        it('should be a no-op if already hidden', () => {
            statusBar.hide(); // Should not throw
            const el = container.querySelector('#manhattan-status-bar');
            expect(el.style.transform).toBe('translateY(-100%)');
        });

        it('should clear auto-hide timer', () => {
            statusBar.showConnected();
            statusBar.hide();

            // Advance past auto-hide time — should not cause issues
            jest.advanceTimersByTime(10000);
        });
    });

    describe('startCountdown(seconds, onComplete)', () => {
        it('should call onComplete when countdown finishes', () => {
            const onComplete = jest.fn();
            statusBar.showDisconnected(); // Show something first
            statusBar.startCountdown(3, onComplete);

            jest.advanceTimersByTime(3000);

            expect(onComplete).toHaveBeenCalledTimes(1);
        });

        it('should stop previous countdown when starting a new one', () => {
            const onComplete1 = jest.fn();
            const onComplete2 = jest.fn();

            statusBar.showDisconnected();
            statusBar.startCountdown(5, onComplete1);
            statusBar.startCountdown(2, onComplete2);

            jest.advanceTimersByTime(5000);

            expect(onComplete1).not.toHaveBeenCalled();
            expect(onComplete2).toHaveBeenCalledTimes(1);
        });
    });

    describe('stopCountdown()', () => {
        it('should stop the countdown timer', () => {
            const onComplete = jest.fn();
            statusBar.showDisconnected();
            statusBar.startCountdown(5, onComplete);

            statusBar.stopCountdown();
            jest.advanceTimersByTime(10000);

            expect(onComplete).not.toHaveBeenCalled();
        });

        it('should be safe to call when no countdown is running', () => {
            expect(() => statusBar.stopCountdown()).not.toThrow();
        });
    });

    describe('destroy()', () => {
        it('should remove the element from the DOM', () => {
            statusBar.destroy();
            statusBar = null;
            const el = container.querySelector('#manhattan-status-bar');
            expect(el).toBeNull();
        });

        it('should stop any running countdown', () => {
            const onComplete = jest.fn();
            statusBar.startCountdown(10, onComplete);
            statusBar.destroy();
            statusBar = null;

            jest.advanceTimersByTime(15000);
            expect(onComplete).not.toHaveBeenCalled();
        });

        it('should clear auto-hide timer', () => {
            statusBar.showConnected();
            statusBar.destroy();
            statusBar = null;

            // Should not throw when timer fires
            jest.advanceTimersByTime(10000);
        });
    });

    describe('message replacement behavior', () => {
        it('should replace previous message when showing a new one', () => {
            statusBar.showConnected();
            statusBar.showDisconnected();

            const el = container.querySelector('#manhattan-status-bar');
            expect(el.textContent).toContain('Connection lost. Reconnecting...');
            expect(el.textContent).not.toContain('Connected');
        });

        it('should stop countdown when showing a non-countdown message', () => {
            statusBar.showRateLimited(60);
            statusBar.showConnected();

            const el = container.querySelector('#manhattan-status-bar');
            jest.advanceTimersByTime(1000);

            // Should show "Connected", not a countdown update
            expect(el.textContent).toContain('Connected');
        });
    });
});
