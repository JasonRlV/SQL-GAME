document.addEventListener('DOMContentLoaded', async () => {
    const accountProfile = document.getElementById('accountProfile');
    const accountAvatar = document.getElementById('accountAvatar');
    const accountUsername = document.getElementById('accountUsername');
    const status = document.getElementById('dashboardStatus');
    const scoreValue = document.getElementById('dashboardScore');
    const startGameButton = document.getElementById('startGameButton');
    const launchPanel = document.getElementById('launchPanel');
    const difficultyName = document.getElementById('difficultyName');
    const difficultyDescription = document.getElementById('difficultyDescription');
    const chatPanel = document.getElementById('aiChatPanel');
    const chatContent = document.getElementById('chatContent');
    const chatToggle = document.getElementById('chatToggle');
    const chatCloseButton = document.getElementById('chatCloseButton');
    const chatResizer = document.getElementById('chatResizer');
    const chatMessage = document.getElementById('chatMessage');
    const chatSend = document.getElementById('chatSend');
    const chatModel = document.getElementById('chatModel');
    const chatNote = document.getElementById('chatNote');
    const featureDialog = document.getElementById('featureDialog');
    const featureDialogIcon = document.getElementById('featureDialogIcon');
    const featureDialogTitle = document.getElementById('featureDialogTitle');
    const featureDialogDescription = document.getElementById('featureDialogDescription');
    const featureDialogPoints = document.getElementById('featureDialogPoints');
    const featureDialogClose = document.getElementById('featureDialogClose');
    const gameGuideButton = document.getElementById('gameGuideButton');
    const gameGuideDialog = document.getElementById('gameGuideDialog');
    const gameGuideClose = document.getElementById('gameGuideClose');
    const gameGuideDone = document.getElementById('gameGuideDone');
    const difficultyDescriptions = {
        easy: 'A relaxed introduction to SQL.',
        normal: 'A balanced mix of SQL concepts.',
        hard: 'A tougher preview for confident query writers.',
    };
    const featureDetails = {
        difficulty: {
            icon: '🎯',
            title: '3 Difficulty Levels',
            description: 'Choose Easy, Medium, or Hard in the lobby to open a matching SQL challenge with a schema, hints, and an answer checker.',
            points: [
                'Easy: practice a basic SELECT with one WHERE filter.',
                'Medium: combine filtering and sorting or work with a simple aggregate.',
                'Hard: work with GROUP BY and HAVING or a meaningful aggregate.',
            ],
        },
        hints: {
            icon: '💡',
            title: 'Hint System',
            description: 'Each generated SQL challenge includes three progressive hints that unlock for points, so you can get help without immediately revealing the answer.',
            points: [
                'Ask for a hint when you get stuck.',
                'The three hints cost 3, 5, and 7 points in order; previously unlocked hints are free to revisit.',
                'Groq checks your query without executing it.',
            ],
        },
        lives: {
            icon: '💗',
            title: '3 Lives',
            description: 'Each scored game starts with three lives and gives you room to learn from mistakes.',
            points: [
                'Start each game with 3 hearts.',
                'A wrong answer costs one life.',
                'The game ends when all lives are gone.',
            ],
        },
        leaderboard: {
            icon: '🏆',
            title: 'Leaderboard',
            description: 'Compare your permanently saved points with other SQL Quest players.',
            points: [
                'Players are ranked by total points earned across games.',
                'Only players with more than zero points appear.',
                'Tied point totals share the same rank.',
            ],
        },
        assistant: {
            icon: '💬',
            title: 'SQL Assistant',
            description: 'Ask the SQL assistant about SQL concepts and syntax from the dashboard chat panel.',
            points: [
                'Ask about SQL concepts and syntax.',
                'Get help understanding query structure.',
                'Use quick explanations while you learn.',
            ],
        },
    };
    let featureDialogOpener = null;
    const gameSessionKey = 'sqlQuest.gameSessionId';
    const latestGameSessionKey = 'sqlQuest.lastGameSessionId';

    const getInitialsAvatar = name => {
        const parts = (name || 'SQL').trim().split(/[\s._-]+/).filter(Boolean);
        const initials = (parts.length > 1
            ? `${parts[0][0]}${parts[1][0]}`
            : parts[0]?.slice(0, 2) || 'SQ')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '') || 'SQ';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#263b70"/><stop offset="100%" stop-color="#10162d"/></linearGradient></defs><circle cx="80" cy="80" r="78" fill="url(#g)"/><circle cx="80" cy="80" r="74" fill="none" stroke="#79d4ff" stroke-opacity=".75" stroke-width="4"/><text x="80" y="98" text-anchor="middle" font-size="54" fill="#eef3ff" font-family="Arial,sans-serif" font-weight="700">${initials}</text></svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    };

    const renderAccountProfile = (name, avatarUrl) => {
        const displayName = typeof name === 'string' && name.trim() ? name.trim() : 'Player';
        accountUsername.textContent = displayName;
        accountAvatar.alt = `${displayName} profile picture`;
        accountAvatar.onerror = () => {
            accountAvatar.onerror = null;
            accountAvatar.src = getInitialsAvatar(displayName);
        };
        accountAvatar.src = typeof avatarUrl === 'string' && /^https:\/\//i.test(avatarUrl)
            ? avatarUrl
            : (typeof avatarUrl === 'string' && avatarUrl.startsWith('/uploads/avatars/')
                ? `${window.location.origin}${avatarUrl}`
                : getInitialsAvatar(displayName));
        accountProfile.title = `Profile settings for ${displayName}`;
    };

    const fetchSessionState = async () => {
        try {
            const response = await fetch('/api/session', { credentials: 'same-origin' });
            return await response.json().catch(() => ({}));
        } catch {
            return { authenticated: false, guest: false };
        }
    };

    const updateGameStats = game => {
        scoreValue.textContent = String(game.totalPoints ?? 0);
    };

    const gameRequest = async (endpoint, body = {}) => {
        const sessionState = await fetchSessionState();
        const headers = { 'Content-Type': 'application/json' };
        const { data, error } = await AppAuth.getSession();
        if (error) throw error;
        if (data.session) {
            headers.Authorization = `Bearer ${data.session.access_token}`;
        } else if (!sessionState.guest) {
            throw new Error('Your sign-in session has expired. Please sign in again.');
        }
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify(body),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const requestError = new Error(result.error || `The game service returned an error (${response.status}).`);
            requestError.status = response.status;
            throw requestError;
        }
        return result;
    };

    const setChatOpen = isOpen => {
        chatPanel.classList.toggle('is-open', isOpen);
        chatPanel.classList.toggle('is-closed', !isOpen);
        chatContent.hidden = !isOpen;
        chatPanel.setAttribute('aria-hidden', String(!isOpen));
        chatToggle.setAttribute('aria-expanded', String(isOpen));
        chatToggle.setAttribute('aria-label', `${isOpen ? 'Close' : 'Open'} SQL assistant`);
        document.body.classList.toggle('chat-open', isOpen);
    };

    setChatOpen(false);
    chatToggle.addEventListener('click', () => setChatOpen(chatToggle.getAttribute('aria-expanded') !== 'true'));
    chatCloseButton.addEventListener('click', () => setChatOpen(false));

    const getChatWidthLimits = () => {
        const max = Math.min(680, document.documentElement.clientWidth - 28);
        return { min: Math.min(280, max), max };
    };

    const setChatWidth = width => {
        const { min, max } = getChatWidthLimits();
        const boundedWidth = Math.round(Math.min(max, Math.max(min, width)));
        document.documentElement.style.setProperty('--chat-width', `${boundedWidth}px`);
        chatResizer.setAttribute('aria-valuemax', String(max));
        chatResizer.setAttribute('aria-valuemin', String(min));
        chatResizer.setAttribute('aria-valuenow', String(boundedWidth));
    };

    setChatWidth(Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chat-width')));

    const getChatWidthAtPointer = clientX => document.documentElement.clientWidth - clientX - (window.innerWidth < 1200 ? 14 : 0) + 5;

    chatResizer.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        chatResizer.setPointerCapture(event.pointerId);
        chatResizer.classList.add('is-resizing');
        setChatWidth(getChatWidthAtPointer(event.clientX));
    });

    chatResizer.addEventListener('pointermove', event => {
        if (chatResizer.hasPointerCapture(event.pointerId)) {
            setChatWidth(getChatWidthAtPointer(event.clientX));
        }
    });

    const endChatResize = event => {
        if (chatResizer.hasPointerCapture(event.pointerId)) {
            chatResizer.releasePointerCapture(event.pointerId);
            chatResizer.classList.remove('is-resizing');
        }
    };
    chatResizer.addEventListener('pointerup', endChatResize);
    chatResizer.addEventListener('pointercancel', endChatResize);

    chatResizer.addEventListener('keydown', event => {
        const { min, max } = getChatWidthLimits();
        const width = Number.parseInt(chatResizer.getAttribute('aria-valuenow'), 10);
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            setChatWidth(width + (event.key === 'ArrowLeft' ? 16 : -16));
        } else if (event.key === 'Home') {
            event.preventDefault();
            setChatWidth(min);
        } else if (event.key === 'End') {
            event.preventDefault();
            setChatWidth(max);
        }
    });

    window.addEventListener('resize', () => setChatWidth(Number.parseInt(chatResizer.getAttribute('aria-valuenow'), 10)));

    document.querySelectorAll('.feature[data-feature]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.dataset.feature === 'leaderboard') {
                DashboardLeaderboard.open(button);
                return;
            }
            const details = featureDetails[button.dataset.feature];
            if (!details) return;

            featureDialogOpener = button;
            featureDialogIcon.textContent = details.icon;
            featureDialogTitle.textContent = details.title;
            featureDialogDescription.textContent = details.description;
            featureDialogPoints.replaceChildren(...details.points.map(point => {
                const item = document.createElement('li');
                item.textContent = point;
                return item;
            }));
            featureDialog.showModal();
        });
    });

    featureDialogClose.addEventListener('click', () => featureDialog.close());
    featureDialog.addEventListener('click', event => {
        if (event.target === featureDialog) featureDialog.close();
    });
    featureDialog.addEventListener('close', () => {
        featureDialogOpener?.focus();
        featureDialogOpener = null;
    });

    gameGuideButton.addEventListener('click', () => gameGuideDialog.showModal());
    gameGuideClose.addEventListener('click', () => gameGuideDialog.close());
    gameGuideDone.addEventListener('click', () => gameGuideDialog.close());
    gameGuideDialog.addEventListener('click', event => {
        if (event.target === gameGuideDialog) gameGuideDialog.close();
    });
    gameGuideDialog.addEventListener('close', () => gameGuideButton.focus());

    document.querySelectorAll('.difficulty-button').forEach(button => {
        button.addEventListener('click', () => {
            const difficulty = button.dataset.difficulty;
            document.querySelectorAll('.difficulty-button').forEach(option => {
                const selected = option.dataset.difficulty === difficulty;
                option.classList.toggle('is-selected', selected);
                option.setAttribute('aria-pressed', String(selected));
            });
            launchPanel.dataset.difficulty = difficulty;
            difficultyName.textContent = button.textContent;
            difficultyDescription.textContent = difficultyDescriptions[difficulty];
        });
    });

    startGameButton.addEventListener('click', () => {
        startGameButton.disabled = true;
        status.hidden = true;
        const startGame = async () => {
            try {
                const difficulty = launchPanel.dataset.difficulty || 'easy';
                const game = await gameRequest('/api/game/start', { difficulty });
                sessionStorage.setItem(gameSessionKey, game.sessionId);
                localStorage.setItem(latestGameSessionKey, game.sessionId);
                updateGameStats(game);
                window.location.href = `../game/game.html?difficulty=${encodeURIComponent(difficulty)}`;
            } catch (error) {
                status.textContent = `Unable to start the game: ${error.message}`;
                status.hidden = false;
                startGameButton.disabled = false;
            }
        };
        startGame();
    });

    try {
        const sessionState = await fetchSessionState();
        const { data, error } = await AppAuth.getSession();
        if (error) throw error;
        const authSession = data.session;
        if (!authSession && sessionState.guest) {
            renderAccountProfile('Guest Mode');
            status.textContent = "You're playing as a guest. Your progress and points won't be saved permanently. Create an account to save your progress.";
            status.hidden = false;
            scoreValue.textContent = String(sessionState.score ?? 0);
            chatMessage.disabled = false;
            chatSend.disabled = false;
            chatModel.disabled = false;
            chatMessage.placeholder = 'Ask an SQL question…';
            chatNote.textContent = 'Using Groq or Gemini. Ask questions about SQL while you play.';

            try {
                const liveGameState = await gameRequest('/api/game/points', {});
                scoreValue.textContent = String(liveGameState.totalPoints ?? 0);
            } catch (error) {
                status.textContent = `Guest session active: ${error.message}`;
            }

            const sessionId = sessionStorage.getItem(gameSessionKey);
            if (sessionId) {
                try {
                    await gameRequest('/api/game/state', { sessionId });
                } catch (error) {
                    if (error.status === 403 || error.status === 404) {
                        sessionStorage.removeItem(gameSessionKey);
                        localStorage.removeItem(latestGameSessionKey);
                        status.textContent = 'Your guest session expired. Start again or log in to save your progress.';
                    } else {
                        status.textContent = `Your guest game could not be restored: ${error.message}`;
                    }
                    status.hidden = false;
                }
            }
        } else if (authSession) {
            const storedProfile = (() => {
                try {
                    return JSON.parse(localStorage.getItem('sqlQuestProfile') || 'null');
                } catch {
                    return null;
                }
            })();
            const fallbackName = storedProfile?.username || authSession.user.user_metadata?.username || authSession.user.user_metadata?.full_name || authSession.user.email?.split('@')[0] || 'Signed-in account';
            renderAccountProfile(fallbackName, storedProfile?.avatarUrl || authSession.user.user_metadata?.avatar_url || authSession.user.user_metadata?.picture);
            chatMessage.disabled = false;
            chatSend.disabled = false;
            chatModel.disabled = false;
            chatMessage.placeholder = 'Ask an SQL question…';
            try {
                const profileResponse = await fetch('/api/settings/profile', {
                    headers: { Authorization: `Bearer ${authSession.access_token}` },
                });
                const profileResult = await profileResponse.json().catch(() => ({}));
                if (profileResponse.ok && profileResult.profile) {
                    const profile = profileResult.profile;
                    const profileName = profile.username || fallbackName;
                    localStorage.setItem('sqlQuestProfile', JSON.stringify(profile));
                    localStorage.setItem('sqlQuestUsername', profileName);
                    renderAccountProfile(profileName, profile.avatarUrl);
                }
            } catch {
                // No-op: keep the current dashboard label if the profile fetch is unavailable.
            }
            try {
                updateGameStats(await gameRequest('/api/game/points', {}));
            } catch (error) {
                status.textContent = `Unable to load your saved points: ${error.message}`;
                status.hidden = false;
            }

            const sessionId = sessionStorage.getItem(gameSessionKey);
            if (sessionId) {
                try {
                    await gameRequest('/api/game/state', { sessionId });
                } catch (error) {
                    if (error.status === 403 || error.status === 404) {
                        sessionStorage.removeItem(gameSessionKey);
                        localStorage.removeItem(latestGameSessionKey);
                        status.textContent = 'Your previous game session is no longer available. Start a new game to continue.';
                    } else {
                        status.textContent = `Your previous game could not be restored: ${error.message}`;
                    }
                    status.hidden = false;
                }
            }
        } else {
            window.location.replace('../login/index.html');
            return;
        }
    } catch (error) {
        status.textContent = `Unable to verify your account: ${error.message}`;
        status.hidden = false;
    }
});
