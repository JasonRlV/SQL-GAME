document.addEventListener('DOMContentLoaded', async () => {
    const panel = document.getElementById('aiChatPanel');
    const content = document.getElementById('chatContent');
    const toggle = document.getElementById('chatToggle');
    const close = document.getElementById('chatCloseButton');
    const resizer = document.getElementById('chatResizer');
    const message = document.getElementById('chatMessage');
    const send = document.getElementById('chatSend');
    const model = document.getElementById('chatModel');
    const note = document.getElementById('chatNote');
    const chatWidthKey = 'sqlQuest.chatWidth';

    const setOpen = isOpen => {
        panel.classList.toggle('is-open', isOpen);
        panel.classList.toggle('is-closed', !isOpen);
        content.hidden = !isOpen;
        panel.setAttribute('aria-hidden', String(!isOpen));
        toggle.setAttribute('aria-expanded', String(isOpen));
        document.body.classList.toggle('chat-open', isOpen);
    };

    const widthLimits = () => {
        const max = Math.min(680, document.documentElement.clientWidth - 28);
        return { min: Math.min(280, max), max };
    };

    const setWidth = width => {
        const { min, max } = widthLimits();
        const bounded = Math.round(Math.min(max, Math.max(min, width)));
        document.documentElement.style.setProperty('--chat-width', `${bounded}px`);
        resizer.setAttribute('aria-valuemin', String(min));
        resizer.setAttribute('aria-valuemax', String(max));
        resizer.setAttribute('aria-valuenow', String(bounded));
        localStorage.setItem(chatWidthKey, String(bounded));
    };

    let savedWidth;
    try {
        savedWidth = Number.parseInt(localStorage.getItem(chatWidthKey), 10);
    } catch (error) {
        note.textContent = `Unable to restore chat panel size: ${error.message}`;
        note.dataset.state = 'error';
    }
    if (Number.isFinite(savedWidth)) {
        setWidth(savedWidth);
    } else {
        const defaultWidth = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chat-width'));
        setWidth(Number.isFinite(defaultWidth) ? defaultWidth : 420);
    }

    toggle.addEventListener('click', () => {
        const isOpen = toggle.getAttribute('aria-expanded') !== 'true';
        setOpen(isOpen);
        if (isOpen) close.focus();
    });
    close.addEventListener('click', () => {
        setOpen(false);
        toggle.focus();
    });

    resizer.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        resizer.setPointerCapture(event.pointerId);
        resizer.classList.add('is-resizing');
        setWidth(document.documentElement.clientWidth - event.clientX);
    });
    resizer.addEventListener('pointermove', event => {
        if (resizer.hasPointerCapture(event.pointerId)) {
            setWidth(document.documentElement.clientWidth - event.clientX);
        }
    });
    const endResize = event => {
        if (!resizer.hasPointerCapture(event.pointerId)) return;
        resizer.releasePointerCapture(event.pointerId);
        resizer.classList.remove('is-resizing');
    };
    resizer.addEventListener('pointerup', endResize);
    resizer.addEventListener('pointercancel', endResize);
    resizer.addEventListener('keydown', event => {
        const { min, max } = widthLimits();
        const width = Number.parseInt(resizer.getAttribute('aria-valuenow'), 10);
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            setWidth(width + (event.key === 'ArrowLeft' ? 16 : -16));
        } else if (event.key === 'Home') {
            event.preventDefault();
            setWidth(min);
        } else if (event.key === 'End') {
            event.preventDefault();
            setWidth(max);
        }
    });
    window.addEventListener('resize', () => {
        setWidth(Number.parseInt(resizer.getAttribute('aria-valuenow'), 10));
    });

    try {
        const { data, error } = await AppAuth.getSession();
        if (error) throw error;
        let guestSession = false;
        if (!data.session) {
            const response = await fetch('/api/session', { credentials: 'same-origin' });
            const sessionState = await response.json().catch(() => ({}));
            guestSession = response.ok && Boolean(sessionState.guest);
        }
        if (!data.session && !guestSession) {
            window.location.replace('../login/index.html');
            return;
        }
        message.disabled = false;
        send.disabled = false;
        model.disabled = false;
        message.placeholder = 'Ask an SQL question…';
        note.textContent = 'Using Groq or Gemini. Ask questions about SQL while you play.';
        note.dataset.state = 'info';
    } catch (error) {
        note.textContent = `Unable to verify your account: ${error.message}`;
        note.dataset.state = 'error';
    }
});
