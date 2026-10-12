document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('chatForm');
    const messageInput = document.getElementById('chatMessage');
    const sendButton = document.getElementById('chatSend');
    const clearButton = document.getElementById('clearChatButton');
    const modelSelect = document.getElementById('chatModel');
    const messagesElement = document.getElementById('chatMessages');
    const chatContent = document.getElementById('chatContent');
    const statusElement = document.getElementById('chatStatus');
    const noteElement = document.getElementById('chatNote');
    const conversation = [];
    const modelNames = { groq: 'Groq', gemini: 'Gemini' };

    const appendInlineMarkdown = (parent, text) => {
        const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
        let lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
            parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
            const token = match[0];
            const element = document.createElement(token.startsWith('`') ? 'code' : token.startsWith('**') ? 'strong' : 'em');
            element.textContent = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1);
            parent.append(element);
            lastIndex = match.index + token.length;
        }
        parent.append(document.createTextNode(text.slice(lastIndex)));
    };

    const parseTableRow = line => {
        const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
        return cells.map(cell => cell.trim());
    };

    const isTableSeparator = line => {
        const cells = parseTableRow(line);
        return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
    };

    const appendMarkdown = (parent, text) => {
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        let index = 0;

        while (index < lines.length) {
            const line = lines[index];
            if (!line.trim()) {
                index++;
                continue;
            }

            if (line.trim().startsWith('```')) {
                const codeLines = [];
                index++;
                while (index < lines.length && !lines[index].trim().startsWith('```')) {
                    codeLines.push(lines[index++]);
                }
                if (index < lines.length) index++;
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.textContent = codeLines.join('\n');
                pre.append(code);
                parent.append(pre);
                continue;
            }

            if (index + 1 < lines.length && line.includes('|') && isTableSeparator(lines[index + 1])) {
                const headers = parseTableRow(line);
                index += 2;
                const rows = [];
                while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
                    rows.push(parseTableRow(lines[index++]));
                }
                const wrapper = document.createElement('div');
                wrapper.className = 'chat-table-wrap';
                const table = document.createElement('table');
                const head = document.createElement('thead');
                const headerRow = document.createElement('tr');
                headers.forEach(value => {
                    const cell = document.createElement('th');
                    appendInlineMarkdown(cell, value);
                    headerRow.append(cell);
                });
                head.append(headerRow);
                table.append(head);
                const body = document.createElement('tbody');
                rows.forEach(row => {
                    const tableRow = document.createElement('tr');
                    headers.forEach((_, cellIndex) => {
                        const cell = document.createElement('td');
                        appendInlineMarkdown(cell, row[cellIndex] || '');
                        tableRow.append(cell);
                    });
                    body.append(tableRow);
                });
                table.append(body);
                wrapper.append(table);
                parent.append(wrapper);
                continue;
            }

            const heading = line.match(/^#{1,3}\s+(.+)$/);
            if (heading) {
                const element = document.createElement(`h${Math.min(line.match(/^#+/)[0].length + 2, 4)}`);
                appendInlineMarkdown(element, heading[1]);
                parent.append(element);
                index++;
                continue;
            }

            const unorderedItem = line.match(/^\s*[-*]\s+(.+)$/);
            const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
            if (unorderedItem || orderedItem) {
                const isOrdered = Boolean(orderedItem);
                const list = document.createElement(isOrdered ? 'ol' : 'ul');
                while (index < lines.length) {
                    const item = lines[index].match(isOrdered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*]\s+(.+)$/);
                    if (!item) break;
                    const listItem = document.createElement('li');
                    appendInlineMarkdown(listItem, item[1]);
                    list.append(listItem);
                    index++;
                }
                parent.append(list);
                continue;
            }

            const paragraph = document.createElement('p');
            appendInlineMarkdown(paragraph, line);
            parent.append(paragraph);
            index++;
        }
    };

    const addMessage = (text, kind) => {
        const message = document.createElement('div');
        message.className = `chat-message chat-message-${kind}`;
        if (kind === 'assistant') {
            const formatted = document.createElement('div');
            formatted.className = 'chat-rich-text';
            appendMarkdown(formatted, text);
            message.append(formatted);
        } else {
            message.textContent = text;
        }
        messagesElement.append(message);
        chatContent.classList.add('has-messages');
        messagesElement.scrollTop = messagesElement.scrollHeight;
    };

    modelSelect.addEventListener('change', () => {
        statusElement.textContent = `${modelNames[modelSelect.value]} selected`;
        noteElement.textContent = `Using ${modelNames[modelSelect.value]}. If it reaches its usage limit, the other model will take over.`;
        noteElement.dataset.state = 'info';
    });

    clearButton.addEventListener('click', () => {
        conversation.length = 0;
        messagesElement.replaceChildren();
        chatContent.classList.remove('has-messages');
        messageInput.value = '';
        clearButton.disabled = true;
        statusElement.textContent = `${modelNames[modelSelect.value]} selected`;
        noteElement.textContent = 'Chat cleared. Start a new conversation whenever you’re ready.';
        noteElement.dataset.state = 'info';
        messageInput.focus();
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const text = messageInput.value.trim();
        if (!text || sendButton.disabled) return;

        sendButton.disabled = true;
        clearButton.disabled = true;
        messageInput.disabled = true;
        modelSelect.disabled = true;
        sendButton.textContent = '…';
        noteElement.textContent = 'Thinking…';
        noteElement.dataset.state = 'info';

        try {
            const { data, error: sessionError } = await AppAuth.getSession();
            if (sessionError) throw sessionError;
            let guestSession = false;
            if (!data.session) {
                const sessionResponse = await fetch('/api/session', { credentials: 'same-origin' });
                const sessionState = await sessionResponse.json().catch(() => ({}));
                guestSession = sessionResponse.ok && Boolean(sessionState.guest);
                if (!guestSession) {
                    throw new Error('Your session has expired. Please sign in again or start a guest session.');
                }
            }

            const recentMessages = [...conversation, { role: 'user', content: text }].slice(-20);
            if (recentMessages[0]?.role === 'assistant') recentMessages.shift();
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    model: modelSelect.value,
                    messages: recentMessages,
                }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || `The chat service returned an error (${response.status}).`);
            }
            if (typeof result.reply !== 'string' || !result.reply.trim()) {
                throw new Error('The selected model returned an empty response. Please try again.');
            }

            conversation.push({ role: 'user', content: text }, { role: 'assistant', content: result.reply });
            clearButton.disabled = false;
            addMessage(text, 'user');
            if (result.switched) {
                const previousName = modelNames[result.previousModel] || result.previousModel;
                const activeName = modelNames[result.model] || result.model;
                const reason = result.switchReason === 'model unavailable' ? 'could not access its configured model' : 'reached its usage limit';
                addMessage(`${previousName} ${reason}. Switched to ${activeName}; your conversation was continued.`, 'notice');
            }
            addMessage(result.reply, 'assistant');
            modelSelect.value = result.model;
            statusElement.textContent = `${modelNames[result.model] || result.model} active`;
            noteElement.textContent = result.switched
                ? `Switched to ${modelNames[result.model]} automatically. Your conversation is continuing on this model.`
                : `Reply from ${modelNames[result.model] || result.model}.`;
            noteElement.dataset.state = 'success';
            messageInput.value = '';
        } catch (error) {
            noteElement.textContent = error.message || 'Unable to send your message. Please try again.';
            noteElement.dataset.state = 'error';
        } finally {
            sendButton.textContent = '↑';
            messageInput.disabled = false;
            modelSelect.disabled = false;
            sendButton.disabled = false;
            clearButton.disabled = conversation.length === 0;
            messageInput.focus();
        }
    });

    messageInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            form.requestSubmit();
        }
    });
});
