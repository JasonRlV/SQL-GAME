document.addEventListener('DOMContentLoaded', async () => {
    const profileForm = document.getElementById('profileForm');
    const passwordForm = document.getElementById('passwordForm');
    const usernameInput = document.getElementById('usernameInput');
    const emailReadout = document.getElementById('emailReadout');
    const profileMessage = document.getElementById('profileMessage');
    const passwordMessage = document.getElementById('passwordMessage');
    const avatarMessage = document.getElementById('avatarMessage');
    const avatarPreview = document.getElementById('avatarPreview');
    const avatarInput = document.getElementById('avatarInput');
    const removeAvatarButton = document.getElementById('removeAvatarButton');
    const saveProfileButton = document.getElementById('saveProfileButton');
    const cancelProfileButton = document.getElementById('cancelProfileButton');
    const savePasswordButton = document.getElementById('savePasswordButton');
    const signOutButton = document.getElementById('settingsSignOutButton');
    const guestNotice = document.getElementById('guestNotice');
    const settingsCard = document.querySelector('.settings-card');
    const accountMessage = document.getElementById('accountMessage');
    const preferencesMessage = document.getElementById('preferencesMessage');
    const muteSoundToggle = document.getElementById('muteSoundToggle');
    const disableVisualsToggle = document.getElementById('disableVisualsToggle');

    const state = {
        originalUsername: '',
        avatarUrl: '',
    };

    function setMessage(element, message, type) {
        element.textContent = message || '';
        element.classList.remove('is-success', 'is-error');
        if (type) element.classList.add(type === 'success' ? 'is-success' : 'is-error');
    }

    function readPreference(key) {
        try {
            return localStorage.getItem(key) !== 'off';
        } catch {
            setMessage(preferencesMessage, 'Your browser prevented reading these preferences.', 'error');
            return true;
        }
    }

    function savePreference(key, enabled, toggle) {
        try {
            localStorage.setItem(key, enabled ? 'on' : 'off');
            setMessage(preferencesMessage, 'Preferences saved on this device.', 'success');
        } catch {
            toggle.checked = !readPreference(key);
            setMessage(preferencesMessage, 'Your browser prevented saving this preference.', 'error');
        }
    }

    muteSoundToggle.checked = !readPreference('sqlQuest.soundEnabled');
    disableVisualsToggle.checked = !readPreference('sqlQuest.visualFx');
    muteSoundToggle.addEventListener('change', () => {
        savePreference('sqlQuest.soundEnabled', !muteSoundToggle.checked, muteSoundToggle);
    });
    disableVisualsToggle.addEventListener('change', () => {
        savePreference('sqlQuest.visualFx', !disableVisualsToggle.checked, disableVisualsToggle);
    });

    function getAvatarLabel(username, email) {
        if (username) return username;
        if (email) return email.split('@')[0];
        return 'SQL';
    }

    function createDefaultAvatarDataUrl(name = 'SQL') {
        const nameParts = ((name || 'SQL').trim() || 'SQL').split(/[\s._-]+/).filter(Boolean);
        const initials = (nameParts.length > 1
            ? `${nameParts[0][0]}${nameParts[1][0]}`
            : nameParts[0].slice(0, 2)).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SQ';
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
                <defs>
                    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0%" stop-color="#7c9cff"/>
                        <stop offset="100%" stop-color="#b7ff9f"/>
                    </linearGradient>
                    <radialGradient id="bg" cx="30%" cy="25%" r="90%">
                        <stop offset="0%" stop-color="#263b70"/>
                        <stop offset="100%" stop-color="#10162d"/>
                    </radialGradient>
                </defs>
                <circle cx="80" cy="80" r="78" fill="url(#bg)"/>
                <circle cx="80" cy="80" r="74" fill="none" stroke="url(#g)" stroke-opacity="0.75" stroke-width="4"/>
                <text x="80" y="98" text-anchor="middle" font-size="54" fill="#eef3ff" font-family="Arial, sans-serif" font-weight="700">${initials}</text>
            </svg>
        `.trim();
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    function setAvatar(url) {
        const nextUrl = url && url.startsWith('/')
            ? `${window.location.origin}${url}`
            : (url || createDefaultAvatarDataUrl(getAvatarLabel(state.originalUsername, emailReadout.textContent)));
        avatarPreview.src = nextUrl;
        state.avatarUrl = url || '';
    }

    async function getAccessToken() {
        const { data, error } = await AppAuth.getSession();
        if (error) throw error;
        if (!data.session) {
            const authError = new Error('Please sign in to manage your settings.');
            authError.status = 401;
            throw authError;
        }
        return data.session.access_token;
    }

    function updateStoredProfile(profile) {
        const payload = profile ? JSON.stringify(profile) : null;
        if (payload) {
            localStorage.setItem('sqlQuestProfile', payload);
            localStorage.setItem('sqlQuestUsername', profile.username || '');
        }
        window.dispatchEvent(new CustomEvent('sqlQuestProfileUpdated', {
            detail: profile || null,
        }));
    }

    async function loadProfile() {
        saveProfileButton.disabled = true;
        savePasswordButton.disabled = true;
        try {
            const { data, error } = await AppAuth.getSession();
            if (error) throw error;
            if (!data.session) {
                const sessionResponse = await fetch('/api/session', { credentials: 'same-origin' });
                const sessionState = await sessionResponse.json().catch(() => ({}));
                if (!sessionResponse.ok) {
                    throw new Error(sessionState.error || 'Unable to verify your guest session.');
                }
                if (sessionState.guest) {
                    settingsCard.hidden = true;
                    guestNotice.hidden = false;
                    return;
                }
                window.location.replace('../login/index.html');
                return;
            }

            const token = data.session.access_token;
            const response = await fetch('/api/settings/profile', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || 'Unable to load your profile.');
            }

            const profile = result.profile || {};
            state.originalUsername = profile.username || '';
            usernameInput.value = profile.username || '';
            emailReadout.textContent = profile.email || 'No email available';
            setAvatar(profile.avatarUrl || createDefaultAvatarDataUrl(getAvatarLabel(profile.username, profile.email)));
            updateStoredProfile(profile);
            setMessage(profileMessage, '', '');
        } catch (error) {
            setMessage(profileMessage, error.message, 'error');
            if (error.status === 401) {
                window.location.replace('../login/index.html');
            }
            return;
        } finally {
            saveProfileButton.disabled = false;
            savePasswordButton.disabled = false;
        }
    }

    profileForm.addEventListener('submit', async event => {
        event.preventDefault();
        const username = usernameInput.value.trim();
        if (!username || username.length < 3 || username.length > 20 || !/^[A-Za-z0-9_]+$/.test(username)) {
            setMessage(profileMessage, 'Username must be 3–20 letters, numbers, or underscores.', 'error');
            return;
        }

        saveProfileButton.disabled = true;
        try {
            const token = await getAccessToken();
            const response = await fetch('/api/settings/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ username }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || 'Unable to save the username.');
            }

            state.originalUsername = result.profile?.username || username;
            usernameInput.value = state.originalUsername;
            updateStoredProfile(result.profile);
            setMessage(profileMessage, 'Profile updated successfully.', 'success');
            setAvatar(result.profile?.avatarUrl || createDefaultAvatarDataUrl(getAvatarLabel(state.originalUsername, emailReadout.textContent)));
        } catch (error) {
            setMessage(profileMessage, error.message, 'error');
        } finally {
            saveProfileButton.disabled = false;
        }
    });

    cancelProfileButton.addEventListener('click', () => {
        usernameInput.value = state.originalUsername;
        setMessage(profileMessage, '', '');
    });

    signOutButton.addEventListener('click', async () => {
        if (!window.confirm('Are you sure you want to sign out?')) return;
        signOutButton.disabled = true;
        setMessage(accountMessage, '', '');
        try {
            const { data, error: sessionError } = await AppAuth.getSession();
            if (sessionError) throw sessionError;
            if (data.session) {
                const { error } = await AppAuth.signOut();
                if (error) throw error;
            } else {
                const response = await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'same-origin',
                });
                if (!response.ok) throw new Error('The guest session could not be ended.');
            }
            localStorage.removeItem('sqlQuestProfile');
            localStorage.removeItem('sqlQuestUsername');
            localStorage.removeItem('sqlQuest.gameSessionId');
            localStorage.removeItem('sqlQuest.lastGameSessionId');
            sessionStorage.removeItem('sqlQuest.gameSessionId');
            window.location.replace('../login/index.html');
        } catch (error) {
            setMessage(accountMessage, `Unable to sign out: ${error.message}`, 'error');
            signOutButton.disabled = false;
        }
    });

    passwordForm.addEventListener('submit', async event => {
        event.preventDefault();
        const currentPassword = document.getElementById('currentPasswordInput').value;
        const newPassword = document.getElementById('newPasswordInput').value;
        const confirmPassword = document.getElementById('confirmPasswordInput').value;

        if (!currentPassword || !newPassword || !confirmPassword) {
            setMessage(passwordMessage, 'Complete all password fields before submitting.', 'error');
            return;
        }
        if (newPassword.length < 8) {
            setMessage(passwordMessage, 'Your new password must be at least 8 characters long.', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            setMessage(passwordMessage, 'The password confirmation does not match.', 'error');
            return;
        }

        savePasswordButton.disabled = true;
        try {
            const token = await getAccessToken();
            const response = await fetch('/api/settings/password', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || 'Unable to update your password.');
            }

            passwordForm.reset();
            setMessage(passwordMessage, result.message || 'Password updated successfully.', 'success');
        } catch (error) {
            setMessage(passwordMessage, error.message, 'error');
        } finally {
            savePasswordButton.disabled = false;
        }
    });

    avatarInput.addEventListener('change', async event => {
        const [file] = event.target.files || [];
        if (!file) return;

        if (!/image\/(png|jpeg|webp)/i.test(file.type)) {
            setMessage(avatarMessage, 'Choose a PNG, JPEG, or WebP image.', 'error');
            avatarInput.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setMessage(avatarMessage, 'Profile pictures must be smaller than 2 MB.', 'error');
            avatarInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            const nextPreview = typeof reader.result === 'string' ? reader.result : '';
            if (!nextPreview) {
                setMessage(avatarMessage, 'The selected image could not be read.', 'error');
                return;
            }
            avatarPreview.src = nextPreview;
            setMessage(avatarMessage, 'Uploading profile picture…', '');

            try {
                const token = await getAccessToken();
                const response = await fetch('/api/settings/profile-picture', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ imageDataUrl: nextPreview }),
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(result.error || 'Unable to upload the image.');
                }

                const profile = result.profile || {};
                state.originalUsername = profile.username || state.originalUsername;
                updateStoredProfile(profile);
                setAvatar(profile.avatarUrl || nextPreview);
                setMessage(avatarMessage, result.message || 'Profile picture updated successfully.', 'success');
            } catch (error) {
                setMessage(avatarMessage, error.message, 'error');
                setAvatar(state.avatarUrl || createDefaultAvatarDataUrl(getAvatarLabel(state.originalUsername, emailReadout.textContent)));
            } finally {
                avatarInput.value = '';
            }
        };
        reader.readAsDataURL(file);
    });

    removeAvatarButton.addEventListener('click', async () => {
        try {
            const token = await getAccessToken();
            const response = await fetch('/api/settings/profile-picture', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ clearAvatar: true }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || 'Unable to reset the profile picture.');
            }

            const profile = result.profile || {};
            updateStoredProfile(profile);
            setAvatar(createDefaultAvatarDataUrl(getAvatarLabel(state.originalUsername, emailReadout.textContent)));
            setMessage(avatarMessage, result.message || 'Profile picture reset to the default avatar.', 'success');
        } catch (error) {
            setMessage(avatarMessage, error.message, 'error');
        }
    });

    await loadProfile();
});
