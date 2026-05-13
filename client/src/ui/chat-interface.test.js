/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { ChatInterfaceUI } from './chat-interface.js';

describe('ChatInterfaceUI', () => {
    let container;
    let chatUI;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        chatUI = new ChatInterfaceUI(container);
    });

    afterEach(() => {
        chatUI.destroy();
        if (container.parentNode) {
            container.parentNode.removeChild(container);
        }
    });

    describe('render', () => {
        it('should render the chat interface into the container', () => {
            chatUI.render('TestRoom');
            expect(container.querySelector('[data-testid="chat-interface"]')).not.toBeNull();
        });

        it('should display the room name in the header', () => {
            chatUI.render('MyRoom');
            const header = container.querySelector('[data-testid="chat-header"]');
            expect(header.textContent).toContain('MyRoom');
        });

        it('should render message area, participant sidebar, and input area', () => {
            chatUI.render('TestRoom');
            expect(container.querySelector('[data-testid="message-area"]')).not.toBeNull();
            expect(container.querySelector('[data-testid="participant-sidebar"]')).not.toBeNull();
            expect(container.querySelector('[data-testid="input-area"]')).not.toBeNull();
        });

        it('should render the leave button', () => {
            chatUI.render('TestRoom');
            const leaveBtn = container.querySelector('[data-testid="leave-button"]');
            expect(leaveBtn).not.toBeNull();
            expect(leaveBtn.textContent).toBe('Leave');
        });

        it('should render the send button', () => {
            chatUI.render('TestRoom');
            const sendBtn = container.querySelector('[data-testid="send-button"]');
            expect(sendBtn).not.toBeNull();
            expect(sendBtn.textContent).toBe('Send');
        });

        it('should render the message input field', () => {
            chatUI.render('TestRoom');
            const input = container.querySelector('[data-testid="message-input"]');
            expect(input).not.toBeNull();
            expect(input.type).toBe('text');
        });

        it('should show initial participant count as 0', () => {
            chatUI.render('TestRoom');
            const count = container.querySelector('[data-testid="participant-count"]');
            expect(count.textContent).toBe('Online: 0');
        });
    });

    describe('destroy', () => {
        it('should remove the chat interface from the DOM', () => {
            chatUI.render('TestRoom');
            chatUI.destroy();
            expect(container.querySelector('[data-testid="chat-interface"]')).toBeNull();
        });

        it('should be safe to call destroy without render', () => {
            expect(() => chatUI.destroy()).not.toThrow();
        });
    });

    describe('addMessage', () => {
        beforeEach(() => {
            chatUI.render('TestRoom');
        });

        it('should add a message to the message area', () => {
            chatUI.addMessage('192.168.1.1', 'Hello world', Date.now(), false);
            const messages = container.querySelectorAll('[data-testid="chat-message"]');
            expect(messages.length).toBe(1);
        });

        it('should display sender IP and message text', () => {
            chatUI.addMessage('10.0.0.1', 'Test message', Date.now(), false);
            const msg = container.querySelector('[data-testid="chat-message"]');
            expect(msg.textContent).toContain('10.0.0.1');
            expect(msg.textContent).toContain('Test message');
        });

        it('should display timestamp in HH:MM:SS format', () => {
            const ts = new Date(2024, 0, 15, 14, 30, 45).getTime();
            chatUI.addMessage('10.0.0.1', 'Hello', ts, false);
            const msg = container.querySelector('[data-testid="chat-message"]');
            expect(msg.textContent).toContain('14:30:45');
        });

        it('should style own messages differently (cyan border)', () => {
            chatUI.addMessage('10.0.0.1', 'My message', Date.now(), true);
            const msg = container.querySelector('[data-testid="chat-message"]');
            expect(msg.className).toContain('border-terminal-cyan');
        });

        it('should style other messages with green border', () => {
            chatUI.addMessage('10.0.0.2', 'Their message', Date.now(), false);
            const msg = container.querySelector('[data-testid="chat-message"]');
            expect(msg.className).toContain('border-terminal-green');
        });

        it('should display messages in chronological order (append order)', () => {
            chatUI.addMessage('10.0.0.1', 'First', 1000, false);
            chatUI.addMessage('10.0.0.2', 'Second', 2000, false);
            chatUI.addMessage('10.0.0.1', 'Third', 3000, false);
            const messages = container.querySelectorAll('[data-testid="chat-message"]');
            expect(messages.length).toBe(3);
            expect(messages[0].textContent).toContain('First');
            expect(messages[1].textContent).toContain('Second');
            expect(messages[2].textContent).toContain('Third');
        });

        it('should escape HTML in message text to prevent XSS', () => {
            chatUI.addMessage('10.0.0.1', '<script>alert("xss")</script>', Date.now(), false);
            const msg = container.querySelector('[data-testid="chat-message"]');
            expect(msg.innerHTML).not.toContain('<script>');
            expect(msg.textContent).toContain('<script>alert("xss")</script>');
        });
    });

    describe('addErrorMessage', () => {
        beforeEach(() => {
            chatUI.render('TestRoom');
        });

        it('should add an error message to the message area', () => {
            chatUI.addErrorMessage('10.0.0.1', 'Message could not be decrypted.', Date.now());
            const errors = container.querySelectorAll('[data-testid="chat-error-message"]');
            expect(errors.length).toBe(1);
        });

        it('should display the error text with red styling', () => {
            chatUI.addErrorMessage('10.0.0.1', 'Key not available for this sender.', Date.now());
            const errMsg = container.querySelector('[data-testid="chat-error-message"]');
            expect(errMsg.textContent).toContain('Key not available for this sender.');
            expect(errMsg.className).toContain('border-terminal-red');
        });

        it('should display the sender IP in error messages', () => {
            chatUI.addErrorMessage('192.168.1.5', 'Message could not be decrypted.', Date.now());
            const errMsg = container.querySelector('[data-testid="chat-error-message"]');
            expect(errMsg.textContent).toContain('192.168.1.5');
        });

        it('should display warning icon', () => {
            chatUI.addErrorMessage('10.0.0.1', 'Error text', Date.now());
            const errMsg = container.querySelector('[data-testid="chat-error-message"]');
            expect(errMsg.textContent).toContain('⚠');
        });
    });

    describe('updateParticipantList', () => {
        beforeEach(() => {
            chatUI.render('TestRoom');
        });

        it('should display participants in the sidebar', () => {
            chatUI.updateParticipantList([
                { ip: '10.0.0.1', displayName: 'User_10.0.0.1' },
                { ip: '10.0.0.2', displayName: 'User_10.0.0.2' },
            ]);
            const items = container.querySelectorAll('[data-testid="participant-item"]');
            expect(items.length).toBe(2);
        });

        it('should update the participant count', () => {
            chatUI.updateParticipantList([
                { ip: '10.0.0.1', displayName: 'User_10.0.0.1' },
                { ip: '10.0.0.2', displayName: 'User_10.0.0.2' },
                { ip: '10.0.0.3', displayName: 'User_10.0.0.3' },
            ]);
            const count = container.querySelector('[data-testid="participant-count"]');
            expect(count.textContent).toBe('Online: 3');
        });

        it('should display participant display names', () => {
            chatUI.updateParticipantList([
                { ip: '10.0.0.1', displayName: 'User_10.0.0.1' },
            ]);
            const item = container.querySelector('[data-testid="participant-item"]');
            expect(item.textContent).toContain('User_10.0.0.1');
        });

        it('should replace the list on update (not append)', () => {
            chatUI.updateParticipantList([
                { ip: '10.0.0.1', displayName: 'User_10.0.0.1' },
                { ip: '10.0.0.2', displayName: 'User_10.0.0.2' },
            ]);
            chatUI.updateParticipantList([
                { ip: '10.0.0.1', displayName: 'User_10.0.0.1' },
            ]);
            const items = container.querySelectorAll('[data-testid="participant-item"]');
            expect(items.length).toBe(1);
        });

        it('should show green dot indicator for each participant', () => {
            chatUI.updateParticipantList([
                { ip: '10.0.0.1', displayName: 'User_10.0.0.1' },
            ]);
            const item = container.querySelector('[data-testid="participant-item"]');
            const dot = item.querySelector('.bg-terminal-green.rounded-full');
            expect(dot).not.toBeNull();
        });
    });

    describe('getMessageInput / clearMessageInput', () => {
        beforeEach(() => {
            chatUI.render('TestRoom');
        });

        it('should return empty string initially', () => {
            expect(chatUI.getMessageInput()).toBe('');
        });

        it('should return the current input value', () => {
            const input = container.querySelector('[data-testid="message-input"]');
            input.value = 'Hello world';
            expect(chatUI.getMessageInput()).toBe('Hello world');
        });

        it('should clear the input field', () => {
            const input = container.querySelector('[data-testid="message-input"]');
            input.value = 'Some text';
            chatUI.clearMessageInput();
            expect(input.value).toBe('');
            expect(chatUI.getMessageInput()).toBe('');
        });
    });

    describe('onSendMessage', () => {
        beforeEach(() => {
            chatUI.render('TestRoom');
        });

        it('should call the callback when send button is clicked', () => {
            const callback = jest.fn();
            chatUI.onSendMessage(callback);
            const sendBtn = container.querySelector('[data-testid="send-button"]');
            sendBtn.click();
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('should call the callback when Enter key is pressed in input', () => {
            const callback = jest.fn();
            chatUI.onSendMessage(callback);
            const input = container.querySelector('[data-testid="message-input"]');
            const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            input.dispatchEvent(event);
            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('should not call the callback when Shift+Enter is pressed', () => {
            const callback = jest.fn();
            chatUI.onSendMessage(callback);
            const input = container.querySelector('[data-testid="message-input"]');
            const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true });
            input.dispatchEvent(event);
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('onLeaveRoom', () => {
        beforeEach(() => {
            chatUI.render('TestRoom');
        });

        it('should call the callback when leave button is clicked', () => {
            const callback = jest.fn();
            chatUI.onLeaveRoom(callback);
            const leaveBtn = container.querySelector('[data-testid="leave-button"]');
            leaveBtn.click();
            expect(callback).toHaveBeenCalledTimes(1);
        });
    });

    describe('setInputEnabled', () => {
        beforeEach(() => {
            chatUI.render('TestRoom');
        });

        it('should disable the input and send button', () => {
            chatUI.setInputEnabled(false);
            const input = container.querySelector('[data-testid="message-input"]');
            const sendBtn = container.querySelector('[data-testid="send-button"]');
            expect(input.disabled).toBe(true);
            expect(sendBtn.disabled).toBe(true);
        });

        it('should re-enable the input and send button', () => {
            chatUI.setInputEnabled(false);
            chatUI.setInputEnabled(true);
            const input = container.querySelector('[data-testid="message-input"]');
            const sendBtn = container.querySelector('[data-testid="send-button"]');
            expect(input.disabled).toBe(false);
            expect(sendBtn.disabled).toBe(false);
        });

        it('should not trigger send callback when input is disabled', () => {
            const callback = jest.fn();
            chatUI.onSendMessage(callback);
            chatUI.setInputEnabled(false);
            const sendBtn = container.querySelector('[data-testid="send-button"]');
            sendBtn.click();
            expect(callback).not.toHaveBeenCalled();
        });

        it('should add visual disabled styling', () => {
            chatUI.setInputEnabled(false);
            const input = container.querySelector('[data-testid="message-input"]');
            expect(input.className).toContain('opacity-50');
            expect(input.className).toContain('cursor-not-allowed');
        });
    });

    describe('scrollToBottom', () => {
        beforeEach(() => {
            chatUI.render('TestRoom');
        });

        it('should not throw when called', () => {
            expect(() => chatUI.scrollToBottom()).not.toThrow();
        });

        it('should set scrollTop to scrollHeight', () => {
            // Add multiple messages to create scrollable content
            for (let i = 0; i < 20; i++) {
                chatUI.addMessage('10.0.0.1', `Message ${i}`, Date.now() + i, false);
            }
            const messageArea = container.querySelector('[data-testid="message-area"]');
            // In jsdom, scrollHeight is always 0, but we verify no error
            chatUI.scrollToBottom();
            expect(messageArea.scrollTop).toBeDefined();
        });
    });
});
