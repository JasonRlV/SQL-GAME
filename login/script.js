function showAuthError(formId, message) {
    const error = document.getElementById(formId === 'loginForm' ? 'loginError' : 'registerError');
    error.textContent = message;
    error.style.display = 'block';
}

function clearAuthMessages() {
    ['loginError', 'registerError', 'googleError', 'registerStatus'].forEach(id => {
        const message = document.getElementById(id);
        message.textContent = '';
        message.style.display = 'none';
    });
}

function setLoading(buttonId, loading, label) {
    const button = document.getElementById(buttonId);
    button.disabled = loading;
    button.textContent = loading ? label : buttonId === 'loginBtn' ? 'Login' : 'Register';
}

function showGoogleError(message) {
    const error = document.getElementById('googleError');
    error.textContent = message;
    error.style.display = 'block';
}

async function startGoogleSignIn() {
    clearAuthMessages();
    try {
        const { error } = await AppAuth.signInWithGoogle();
        if (error) throw error;
    } catch (error) {
        showGoogleError(error.message);
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    clearAuthMessages();

    if (!username || !email || !password || !confirmPassword) {
        return showAuthError('registerForm', 'Please fill in all fields.');
    }
    if (username.length < CONFIG.MIN_USERNAME_LENGTH || username.length > CONFIG.MAX_USERNAME_LENGTH) {
        return showAuthError('registerForm', `Username must be ${CONFIG.MIN_USERNAME_LENGTH}–${CONFIG.MAX_USERNAME_LENGTH} characters.`);
    }
    if (!CONFIG.USERNAME_PATTERN.test(username)) {
        return showAuthError('registerForm', 'Username may only contain letters, numbers, and underscores.');
    }
    if (password !== confirmPassword) {
        return showAuthError('registerForm', 'Passwords do not match.');
    }
    if (password.length < CONFIG.MIN_PASSWORD_LENGTH) {
        return showAuthError('registerForm', `Password must be at least ${CONFIG.MIN_PASSWORD_LENGTH} characters.`);
    }

    setLoading('registerBtn', true, 'Creating account…');
    try {
        const { data, error } = await AppAuth.signUp({ username, email, password });
        if (error) throw error;

        if (data.session) {
            window.location.href = '/dashboard/dashboard.html';
            return;
        }

        const status = document.getElementById('registerStatus');
        status.textContent = 'Account created. Check your email to confirm your address, then log in.';
        status.style.display = 'block';
    } catch (error) {
        showAuthError('registerForm', error.message);
    } finally {
        setLoading('registerBtn', false);
    }
}

async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    clearAuthMessages();

    if (!email || !password) {
        return showAuthError('loginForm', 'Enter your email address and password.');
    }

    setLoading('loginBtn', true, 'Logging in…');
    try {
        const { error } = await AppAuth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/dashboard/dashboard.html';
    } catch (error) {
        showAuthError('loginForm', error.message);
    } finally {
        setLoading('loginBtn', false);
    }
}

async function playAsGuest() {
    clearAuthMessages();
    const guestStatus = document.getElementById('guestStatus');
    const guestButton = document.getElementById('guestBtn');
    guestButton.disabled = true;
    guestButton.textContent = 'Starting guest session…';
    guestStatus.textContent = 'You’re playing as a guest. Your progress and points won’t be saved permanently.';
    guestStatus.style.display = 'block';

    try {
        const response = await fetch('/api/auth/guest', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || 'Unable to start a guest session.');
        }
        if (result.guest) {
            window.location.href = '/dashboard/dashboard.html';
            return;
        }
        throw new Error('Guest session could not be created.');
    } catch (error) {
        guestStatus.textContent = error.message || 'Unable to start a guest session. Please try again.';
        guestStatus.style.display = 'block';
    } finally {
        guestButton.disabled = false;
        guestButton.textContent = 'Play as Guest';
    }
}

function toggleAuthMode() {
    const showRegisterForm = document.getElementById('loginForm').style.display !== 'none';
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const switchPrompt = document.getElementById('authSwitchPrompt');
    const switchButton = document.getElementById('authSwitchButton');

    document.getElementById('loginForm').style.display = showRegisterForm ? 'none' : 'block';
    document.getElementById('registerForm').style.display = showRegisterForm ? 'block' : 'none';
    title.textContent = 'Welcome';
    subtitle.textContent = showRegisterForm
        ? 'Start your SQL quest today.'
        : 'Log in to continue your quest.';
    switchPrompt.textContent = showRegisterForm ? 'Already have an account?' : "Don't have an account?";
    switchButton.textContent = showRegisterForm ? 'Login' : 'Register';

    clearAuthMessages();
    document.getElementById(showRegisterForm ? 'registerUsername' : 'loginEmail').focus();
}

function initializePasswordReveal() {
    document.querySelectorAll('.password-reveal').forEach(button => {
        const password = document.getElementById(button.dataset.passwordTarget);
        let activePointerId = null;
        let activeKey = null;

        const setVisible = visible => {
            password.type = visible ? 'text' : 'password';
            button.classList.toggle('is-pressed', visible);
            button.setAttribute('aria-pressed', String(visible));
            button.setAttribute('aria-label', visible ? 'Password visible, release to hide' : 'Hold to show password');
        };

        button.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            activePointerId = event.pointerId;
            setVisible(true);
        });

        const releasePointer = event => {
            if (activePointerId !== event.pointerId) return;
            activePointerId = null;
            setVisible(false);
        };

        window.addEventListener('pointerup', releasePointer);
        window.addEventListener('pointercancel', releasePointer);

        button.addEventListener('keydown', event => {
            if ((event.code !== 'Space' && event.code !== 'Enter') || event.repeat) return;
            event.preventDefault();
            activeKey = event.code;
            setVisible(true);
        });

        window.addEventListener('keyup', event => {
            if (activeKey !== event.code) return;
            activeKey = null;
            setVisible(false);
        });

        button.addEventListener('blur', () => {
            activePointerId = null;
            activeKey = null;
            setVisible(false);
        });

        button.addEventListener('focusout', () => {
            activePointerId = null;
            activeKey = null;
            setVisible(false);
        });

        window.addEventListener('blur', () => {
            activePointerId = null;
            activeKey = null;
            setVisible(false);
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    initializePasswordReveal();

    try {
        const response = await fetch('/api/session', { credentials: 'same-origin' });
        const state = await response.json().catch(() => ({}));
        if (state.authenticated || state.guest) {
            window.location.href = '/dashboard/dashboard.html';
            return;
        }
    } catch (error) {
        // Ignore session detection failures and continue showing the login screen.
    }

    try {
        const { data, error } = await AppAuth.getSession();
        if (error) throw error;
        if (data.session) {
            window.location.href = '/dashboard/dashboard.html';
        }
    } catch (error) {
        showAuthError('loginForm', error.message);
    }
});
