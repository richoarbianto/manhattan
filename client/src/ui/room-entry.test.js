/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { RoomEntryUI } from './room-entry.js';

describe('RoomEntryUI', () => {
    let container;
    let ui;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        ui = new RoomEntryUI(container);
        ui.render();
    });

    afterEach(() => {
        ui.destroy();
        document.body.removeChild(container);
    });

    describe('render()', () => {
        it('renders the room name input', () => {
            const input = container.querySelector('[data-room-name-input]');
            expect(input).not.toBeNull();
            expect(input.placeholder).toBe('Enter room name...');
            expect(input.maxLength).toBe(15);
        });

        it('renders create and join buttons', () => {
            const createBtn = container.querySelector('[data-create-btn]');
            const joinBtn = container.querySelector('[data-join-btn]');
            expect(createBtn).not.toBeNull();
            expect(joinBtn).not.toBeNull();
            expect(createBtn.textContent.trim()).toBe('Create Room');
            expect(joinBtn.textContent.trim()).toBe('Join Room');
        });

        it('renders the terminal header with title', () => {
            const title = container.querySelector('h2');
            expect(title).not.toBeNull();
            expect(title.textContent.trim()).toBe('MANHATTAN');
        });

        it('renders confirmation modal (hidden by default)', () => {
            const modal = container.querySelector('[data-confirmation-modal]');
            expect(modal).not.toBeNull();
            expect(modal.classList.contains('hidden')).toBe(true);
        });

        it('renders password modal (hidden by default)', () => {
            const modal = container.querySelector('[data-password-modal]');
            expect(modal).not.toBeNull();
            expect(modal.classList.contains('hidden')).toBe(true);
        });
    });

    describe('getRoomNameInput()', () => {
        it('returns empty string when input is empty', () => {
            expect(ui.getRoomNameInput()).toBe('');
        });

        it('returns the current input value', () => {
            const input = container.querySelector('[data-room-name-input]');
            input.value = 'TestRoom';
            expect(ui.getRoomNameInput()).toBe('TestRoom');
        });
    });

    describe('showValidationError() / clearValidationError()', () => {
        it('shows validation error message', () => {
            ui.showValidationError('Room name too short');
            const errorEl = container.querySelector('[data-validation-error]');
            expect(errorEl.textContent).toBe('Room name too short');
            expect(errorEl.classList.contains('hidden')).toBe(false);
        });

        it('adds red border to input on error', () => {
            ui.showValidationError('Invalid name');
            const input = container.querySelector('[data-room-name-input]');
            expect(input.classList.contains('border-terminal-red')).toBe(true);
        });

        it('clears validation error', () => {
            ui.showValidationError('Some error');
            ui.clearValidationError();
            const errorEl = container.querySelector('[data-validation-error]');
            expect(errorEl.classList.contains('hidden')).toBe(true);
            const input = container.querySelector('[data-room-name-input]');
            expect(input.classList.contains('border-terminal-red')).toBe(false);
        });

        it('adds green border when input is valid on clear', () => {
            const input = container.querySelector('[data-room-name-input]');
            input.value = 'ValidRoom';
            ui.clearValidationError();
            expect(input.classList.contains('border-terminal-green')).toBe(true);
        });
    });

    describe('showConfirmationModal() / hideConfirmationModal()', () => {
        it('shows modal with participant count', () => {
            const onConfirm = jest.fn();
            const onDecline = jest.fn();
            ui.showConfirmationModal(5, onConfirm, onDecline);

            const modal = container.querySelector('[data-confirmation-modal]');
            expect(modal.classList.contains('hidden')).toBe(false);

            const countEl = modal.querySelector('[data-participant-count]');
            expect(countEl.textContent).toContain('5 orang');
        });

        it('calls onConfirm when Ya is clicked', () => {
            const onConfirm = jest.fn();
            const onDecline = jest.fn();
            ui.showConfirmationModal(3, onConfirm, onDecline);

            const yesBtn = container.querySelector('[data-confirm-yes]');
            yesBtn.click();

            expect(onConfirm).toHaveBeenCalled();
            expect(onDecline).not.toHaveBeenCalled();
        });

        it('calls onDecline when Tidak is clicked', () => {
            const onConfirm = jest.fn();
            const onDecline = jest.fn();
            ui.showConfirmationModal(3, onConfirm, onDecline);

            const noBtn = container.querySelector('[data-confirm-no]');
            noBtn.click();

            expect(onDecline).toHaveBeenCalled();
            expect(onConfirm).not.toHaveBeenCalled();
        });

        it('hides modal after confirm/decline', () => {
            ui.showConfirmationModal(2, jest.fn(), jest.fn());
            const modal = container.querySelector('[data-confirmation-modal]');
            expect(modal.classList.contains('hidden')).toBe(false);

            ui.hideConfirmationModal();
            expect(modal.classList.contains('hidden')).toBe(true);
        });
    });

    describe('showPasswordModal() / hidePasswordModal()', () => {
        it('shows password modal', () => {
            ui.showPasswordModal(jest.fn(), jest.fn());
            const modal = container.querySelector('[data-password-modal]');
            expect(modal.classList.contains('hidden')).toBe(false);
        });

        it('password input has max length 128', () => {
            ui.showPasswordModal(jest.fn(), jest.fn());
            const input = container.querySelector('[data-password-input]');
            expect(input.maxLength).toBe(128);
            expect(input.type).toBe('password');
        });

        it('calls onSubmit with password value when submit clicked', () => {
            const onSubmit = jest.fn();
            ui.showPasswordModal(onSubmit, jest.fn());

            const input = container.querySelector('[data-password-input]');
            input.value = 'secret123';

            const submitBtn = container.querySelector('[data-password-submit]');
            submitBtn.click();

            expect(onSubmit).toHaveBeenCalledWith('secret123');
        });

        it('calls onCancel when cancel clicked', () => {
            const onCancel = jest.fn();
            ui.showPasswordModal(jest.fn(), onCancel);

            const cancelBtn = container.querySelector('[data-password-cancel]');
            cancelBtn.click();

            expect(onCancel).toHaveBeenCalled();
        });

        it('hides modal on cancel', () => {
            ui.showPasswordModal(jest.fn(), jest.fn());
            ui.hidePasswordModal();
            const modal = container.querySelector('[data-password-modal]');
            expect(modal.classList.contains('hidden')).toBe(true);
        });
    });

    describe('showPasswordError()', () => {
        it('shows error message in password modal', () => {
            ui.showPasswordModal(jest.fn(), jest.fn());
            ui.showPasswordError('Incorrect password');
            const errorEl = container.querySelector('[data-password-error]');
            expect(errorEl.textContent).toBe('Incorrect password');
            expect(errorEl.classList.contains('hidden')).toBe(false);
        });

        it('clears error when empty string passed', () => {
            ui.showPasswordModal(jest.fn(), jest.fn());
            ui.showPasswordError('Some error');
            ui.showPasswordError('');
            const errorEl = container.querySelector('[data-password-error]');
            expect(errorEl.classList.contains('hidden')).toBe(true);
        });
    });

    describe('showServerError() / clearServerError()', () => {
        it('shows server error below form', () => {
            ui.showServerError('Room already exists');
            const errorEl = container.querySelector('[data-server-error]');
            expect(errorEl.textContent).toBe('Room already exists');
            expect(errorEl.classList.contains('hidden')).toBe(false);
        });

        it('clears server error', () => {
            ui.showServerError('Some error');
            ui.clearServerError();
            const errorEl = container.querySelector('[data-server-error]');
            expect(errorEl.classList.contains('hidden')).toBe(true);
        });
    });

    describe('onCreateRoom() / onJoinRoom()', () => {
        it('calls create room callback on button click', () => {
            const callback = jest.fn();
            ui.onCreateRoom(callback);

            const createBtn = container.querySelector('[data-create-btn]');
            createBtn.click();

            expect(callback).toHaveBeenCalled();
        });

        it('calls join room callback on button click', () => {
            const callback = jest.fn();
            ui.onJoinRoom(callback);

            const joinBtn = container.querySelector('[data-join-btn]');
            joinBtn.click();

            expect(callback).toHaveBeenCalled();
        });

        it('calls join room callback on Enter key', () => {
            const callback = jest.fn();
            ui.onJoinRoom(callback);

            const input = container.querySelector('[data-room-name-input]');
            const event = new KeyboardEvent('keydown', { key: 'Enter' });
            input.dispatchEvent(event);

            expect(callback).toHaveBeenCalled();
        });
    });

    describe('setLoading()', () => {
        it('disables buttons when loading', () => {
            ui.setLoading(true);
            const createBtn = container.querySelector('[data-create-btn]');
            const joinBtn = container.querySelector('[data-join-btn]');
            expect(createBtn.disabled).toBe(true);
            expect(joinBtn.disabled).toBe(true);
        });

        it('shows loading indicator when loading', () => {
            ui.setLoading(true);
            const indicator = container.querySelector('[data-loading-indicator]');
            expect(indicator.classList.contains('hidden')).toBe(false);
        });

        it('re-enables buttons when not loading', () => {
            ui.setLoading(true);
            ui.setLoading(false);
            const createBtn = container.querySelector('[data-create-btn]');
            const joinBtn = container.querySelector('[data-join-btn]');
            expect(createBtn.disabled).toBe(false);
            expect(joinBtn.disabled).toBe(false);
        });
    });

    describe('destroy()', () => {
        it('clears the container', () => {
            ui.destroy();
            expect(container.innerHTML).toBe('');
        });
    });

    describe('real-time validation on input', () => {
        it('shows error for short input', () => {
            const input = container.querySelector('[data-room-name-input]');
            input.value = 'ab';
            input.dispatchEvent(new Event('input'));

            const errorEl = container.querySelector('[data-validation-error]');
            expect(errorEl.classList.contains('hidden')).toBe(false);
            expect(errorEl.textContent).toContain('at least 3');
        });

        it('shows error for spaces', () => {
            const input = container.querySelector('[data-room-name-input]');
            input.value = 'has space';
            input.dispatchEvent(new Event('input'));

            const errorEl = container.querySelector('[data-validation-error]');
            expect(errorEl.textContent).toContain('spaces');
        });

        it('shows error for special characters', () => {
            const input = container.querySelector('[data-room-name-input]');
            input.value = 'room@123';
            input.dispatchEvent(new Event('input'));

            const errorEl = container.querySelector('[data-validation-error]');
            expect(errorEl.textContent).toContain('alphanumeric');
        });

        it('clears error for valid input', () => {
            const input = container.querySelector('[data-room-name-input]');
            input.value = 'ValidRoom';
            input.dispatchEvent(new Event('input'));

            const errorEl = container.querySelector('[data-validation-error]');
            expect(errorEl.classList.contains('hidden')).toBe(true);
        });
    });
});
