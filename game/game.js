document.addEventListener('DOMContentLoaded', async () => {
    const difficultyBadge = document.getElementById('difficultyBadge');
    const difficultyLabel = document.getElementById('difficultyLabel');
    const questionTitle = document.getElementById('questionTitle');
    const questionText = document.getElementById('questionText');
    const hintCountLabel = document.getElementById('hintCount');
    const hintButton = document.getElementById('hintButton');
    const hintPreviousButton = document.getElementById('hintPreviousButton');
    const hintProgress = document.getElementById('hintProgress');
    const hintStatus = document.getElementById('hintStatus');
    const hintDisplay = document.getElementById('hintDisplay');
    const schemaCaption = document.getElementById('schemaCaption');
    const schemaTableWrap = document.getElementById('schemaTableWrap');
    const editor = document.getElementById('sqlEditor');
    const clearButton = document.getElementById('clearButton');
    const submitButton = document.getElementById('submitButton');
    const nextQuestionButton = document.getElementById('nextQuestionButton');
    const resultPanel = document.getElementById('resultPanel');
    const questionLoadingStatus = document.getElementById('questionLoadingStatus');
    const scoreValue = document.getElementById('gameScore');
    const totalPointsValue = document.getElementById('totalPoints');
    const livesDisplay = document.getElementById('gameLives');
    const gameOverScreen = document.getElementById('gameOverScreen');
    const gameOverHome = document.getElementById('gameOverHome');
    const gameOverScore = document.getElementById('gameOverScore');
    const gameOverSaveStatus = document.getElementById('gameOverSaveStatus');
    const playAgainButton = document.getElementById('playAgainButton');
    const viewHistoryButton = document.getElementById('viewHistoryButton');
    const viewCurrentHistoryButton = document.getElementById('viewCurrentHistoryButton');
    const gameHistoryView = document.getElementById('gameHistoryView');
    const historyBackButton = document.getElementById('historyBackButton');
    const gameHistorySummary = document.getElementById('gameHistorySummary');
    const gameHistoryError = document.getElementById('gameHistoryError');
    const gameHistoryList = document.getElementById('gameHistoryList');
    const difficultyNames = { easy: 'Easy', normal: 'Medium', hard: 'Hard' };
    const hintCosts = [3, 5, 7];
    const gameSessionKey = 'sqlQuest.gameSessionId';
    const latestGameSessionKey = 'sqlQuest.lastGameSessionId';
    const sessionId = sessionStorage.getItem(gameSessionKey) || localStorage.getItem(latestGameSessionKey);
    const localHistoryKey = `sqlQuest.gameHistory.${sessionId}`;
    let gameDifficulty = new URLSearchParams(window.location.search).get('difficulty');
    if (!Object.hasOwn(difficultyNames, gameDifficulty)) gameDifficulty = 'easy';

    const setGameDifficulty = difficulty => {
        if (!Object.hasOwn(difficultyNames, difficulty)) return;
        gameDifficulty = difficulty;
        difficultyBadge.dataset.difficulty = difficulty;
        difficultyLabel.textContent = difficultyNames[difficulty];
    };

    setGameDifficulty(gameDifficulty);
    let game;
    let totalPoints = 0;
    let challenge;
    let hintsUnlocked = 0;
    let currentHintIndex = -1;
    let unlockedHints = [];
    let hintError = '';
    let questionComplete = false;
    let gameOver = false;
    let requestInProgress = false;
    let questionLoadFailed = false;
    let sessionHistory = [];
    let currentHistoryEntry = null;
    let historyStorageError = '';
    let historyReturnToGame = false;

    const readLocalGameRecord = () => {
        try {
            const record = JSON.parse(localStorage.getItem(localHistoryKey) || 'null');
            return record && record.sessionId === sessionId && Array.isArray(record.history)
                ? record
                : null;
        } catch {
            historyStorageError = 'This browser could not read the saved game history.';
            return null;
        }
    };
    sessionHistory = readLocalGameRecord()?.history || [];

    const createTable = (columns, rows, className) => {
        const table = document.createElement('table');
        table.className = className;
        const head = document.createElement('thead');
        const headerRow = document.createElement('tr');
        columns.forEach(column => {
            const cell = document.createElement('th');
            cell.scope = 'col';
            cell.textContent = column;
            headerRow.append(cell);
        });
        head.append(headerRow);
        table.append(head);

        const body = document.createElement('tbody');
        rows.forEach(row => {
            const tableRow = document.createElement('tr');
            row.forEach(value => {
                const cell = document.createElement('td');
                cell.textContent = value === null ? 'NULL' : String(value);
                tableRow.append(cell);
            });
            body.append(tableRow);
        });
        table.append(body);
        return table;
    };

    const showResult = (message, state) => {
        resultPanel.replaceChildren();
        resultPanel.dataset.state = state;
        const paragraph = document.createElement('p');
        paragraph.textContent = message;
        resultPanel.append(paragraph);
        resultPanel.hidden = false;
    };

    const getAccessToken = async () => {
        const { data, error } = await AppAuth.getSession();
        if (error) throw error;
        if (data.session) return data.session.access_token;

        const response = await fetch('/api/session', { credentials: 'same-origin' });
        const sessionState = await response.json().catch(() => ({}));
        if (!response.ok || !sessionState.guest) {
            window.location.replace('../login/index.html');
            throw new Error('Your session has expired. Please sign in again.');
        }
        return null;
    };

    const postGameRequest = async (endpoint, body = {}, requestSessionId = sessionId) => {
        const accessToken = await getAccessToken();
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            credentials: 'same-origin',
            body: JSON.stringify({ ...body, sessionId: requestSessionId }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (typeof result.score === 'number' && typeof result.lives === 'number') {
                updateGameState(result);
            }
            throw new Error(result.error || `The game service returned an error (${response.status}).`);
        }
        return result;
    };

    const updateGameState = value => {
        game = value;
        scoreValue.textContent = String(value.score);
        if (typeof value.totalPoints === 'number') updateTotalPoints(value.totalPoints);
        livesDisplay.setAttribute('aria-label', `${value.lives} ${value.lives === 1 ? 'life' : 'lives'} remaining`);
        livesDisplay.querySelectorAll('[data-life]').forEach(heart => {
            heart.classList.toggle('is-lost', Number(heart.dataset.life) > value.lives);
        });
    };

    const updateTotalPoints = value => {
        totalPoints = value;
        totalPointsValue.textContent = String(value);
    };

    const saveLocalGameRecord = completed => {
        if (!sessionId) return;
        const record = {
            sessionId,
            difficulty: gameDifficulty,
            finalScore: game?.score ?? 0,
            lives: game?.lives ?? 3,
            history: sessionHistory,
            finishedAt: completed ? game?.finishedAt || new Date().toISOString() : null,
            completed,
        };
        localStorage.setItem(localHistoryKey, JSON.stringify(record));
        historyStorageError = '';
    };

    const renderHintNavigation = () => {
        const canBrowseForward = currentHintIndex >= 0 && currentHintIndex < hintsUnlocked - 1;
        const canUnlockHint = hintsUnlocked < hintCosts.length &&
            totalPoints >= hintCosts[hintsUnlocked] &&
            !questionComplete && !gameOver;
        hintPreviousButton.disabled = requestInProgress || currentHintIndex <= 0;
        hintButton.disabled = requestInProgress || (!canBrowseForward && !canUnlockHint);
        hintProgress.textContent = `Hints: ${hintsUnlocked}/3`;
        hintCountLabel.textContent = `Hints: ${hintsUnlocked}`;

        if (hintsUnlocked >= hintCosts.length) {
            hintButton.textContent = canBrowseForward ? 'Next hint' : 'All hints revealed';
            hintStatus.hidden = !hintError;
            hintStatus.textContent = hintError;
        } else {
            hintButton.textContent = canBrowseForward
                ? 'Next hint'
                : `Next hint (−${hintCosts[hintsUnlocked]})`;
            const insufficient = !canBrowseForward && totalPoints < hintCosts[hintsUnlocked];
            hintStatus.textContent = insufficient ? 'Not enough points to use this hint.' : hintError;
            hintStatus.hidden = !insufficient && !hintError;
        }
    };

    const setQuestionControls = () => {
        const disabled = requestInProgress || gameOver || questionComplete || !challenge;
        editor.disabled = disabled;
        clearButton.disabled = disabled;
        submitButton.disabled = disabled;
        nextQuestionButton.hidden = (!questionComplete && !questionLoadFailed) || gameOver;
        nextQuestionButton.disabled = requestInProgress || gameOver;
        nextQuestionButton.firstChild.textContent = requestInProgress
            ? 'Loading… '
            : questionLoadFailed
                ? (challenge ? 'Retry next question ' : 'Retry question ')
                : 'Next question ';
        renderHintNavigation();
    };

    const renderChallenge = generated => {
        const value = generated.challenge;
        const tables = Array.isArray(value?.tables)
            ? value.tables
            : value && Array.isArray(value.columns) && Array.isArray(value.rows)
                ? [{ name: value.tableName, columns: value.columns, rows: value.rows }]
                : [];
        if (!generated.challengeId || !value ||
            typeof value.title !== 'string' || typeof value.question !== 'string' ||
            tables.length === 0 || tables.some(table =>
                typeof table.name !== 'string' || !Array.isArray(table.columns) || !Array.isArray(table.rows))) {
            throw new Error('The game service returned an incomplete challenge. Generate a new question.');
        }
        challenge = generated;
        questionComplete = Boolean(generated.completed);
        hintsUnlocked = generated.hintsUnlocked || 0;
        unlockedHints = Array.isArray(generated.unlockedHints) ? [...generated.unlockedHints] : [];
        currentHintIndex = hintsUnlocked > 0 ? 0 : -1;
        hintError = '';
        questionLoadFailed = false;
        setGameDifficulty(generated.difficulty);
        questionTitle.textContent = value.title;
        questionText.textContent = value.question;
        schemaCaption.textContent = 'Schema and sample data';
        schemaTableWrap.replaceChildren(...tables.map(table => {
            const section = document.createElement('section');
            const heading = document.createElement('p');
            heading.className = 'schema-caption';
            heading.textContent = `Table: ${table.name}`;
            const wrapper = document.createElement('div');
            wrapper.className = 'schema-table-wrap';
            wrapper.append(createTable(
                table.columns.map(column => `${column.name} · ${column.type}`),
                table.rows,
                'schema-table',
            ));
            section.append(heading, wrapper);
            return section;
        }));
        editor.value = '';
        hintDisplay.hidden = hintsUnlocked === 0;
        hintDisplay.textContent = hintsUnlocked > 0 ? unlockedHints[0] : '';
        hintStatus.textContent = '';
        resultPanel.hidden = true;
        gameOver = Boolean(game?.gameOver);
        currentHistoryEntry = sessionHistory.find(item => item.questionId === generated.challengeId);
        if (!currentHistoryEntry) {
            currentHistoryEntry = {
                questionId: generated.challengeId,
                difficulty: generated.difficulty,
                title: value.title,
                question: value.question,
                tableName: tables[0].name,
                columns: tables[0].columns.map(column => ({ name: column.name, type: column.type })),
                rows: tables[0].rows.map(row => [...row]),
                tables: tables.map(table => ({
                    name: table.name,
                    columns: table.columns.map(column => ({ name: column.name, type: column.type })),
                    rows: table.rows.map(row => [...row]),
                })),
                status: 'unanswered',
                attempts: [],
            };
            sessionHistory.push(currentHistoryEntry);
        } else if (!Array.isArray(currentHistoryEntry.tables) &&
            (!Array.isArray(currentHistoryEntry.columns) || !Array.isArray(currentHistoryEntry.rows))) {
            currentHistoryEntry.tableName = tables[0].name;
            currentHistoryEntry.columns = tables[0].columns.map(column => ({ name: column.name, type: column.type }));
            currentHistoryEntry.rows = tables[0].rows.map(row => [...row]);
            currentHistoryEntry.tables = tables.map(table => ({
                name: table.name,
                columns: table.columns.map(column => ({ name: column.name, type: column.type })),
                rows: table.rows.map(row => [...row]),
            }));
        }
        if (questionComplete) {
            const attempts = Array.isArray(currentHistoryEntry.attempts)
                ? currentHistoryEntry.attempts
                : [];
            editor.value = attempts.length ? attempts[attempts.length - 1].submittedAnswer : '';
        }
        try {
            saveLocalGameRecord(gameOver);
        } catch (error) {
            historyStorageError = `Unable to save game history in this browser: ${error.message}`;
        }
        setQuestionControls();

        if (gameOver) {
            finishGameOver();
        } else if (questionComplete) {
            showResult(
                'This question was already answered. Loading the next question…',
                currentHistoryEntry?.status === 'incorrect' ? 'error' : 'success',
            );
        } else {
            editor.focus();
        }
    };

    const finishGameOver = () => {
        gameOver = true;
        setQuestionControls();
        try {
            saveLocalGameRecord(true);
        } catch (error) {
            historyStorageError = `Unable to save game history in this browser: ${error.message}`;
        }
        gameOverScore.textContent = `Final score: ${game?.score ?? 0} points`;
        gameOverSaveStatus.textContent = historyStorageError || 'Game history is saved temporarily in this browser.';
        gameOverSaveStatus.hidden = false;
        gameOverHome.hidden = false;
        gameHistoryView.hidden = true;
        gameOverScreen.hidden = false;
        viewHistoryButton.focus();
    };

    const appendHistoryCode = (parent, label, sql) => {
        const heading = document.createElement('p');
        heading.className = 'game-history-attempt-label';
        heading.textContent = label;
        const code = document.createElement('pre');
        code.className = 'game-history-code';
        const codeContent = document.createElement('code');
        codeContent.textContent = sql;
        code.append(codeContent);
        parent.append(heading, code);
    };

    const appendHistoryTable = (parent, item) => {
        if (Array.isArray(item.tables)) {
            item.tables.forEach(table => {
                if (!Array.isArray(table.columns) || !Array.isArray(table.rows)) return;
                const heading = document.createElement('p');
                heading.className = 'game-history-attempt-label';
                heading.textContent = `Table: ${table.name || 'Question data'}`;
                const wrapper = document.createElement('div');
                wrapper.className = 'game-history-table-wrap';
                wrapper.append(createTable(
                    table.columns.map(column => `${column.name} · ${column.type}`),
                    table.rows,
                    'schema-table',
                ));
                parent.append(heading, wrapper);
            });
            return;
        }
        if (!Array.isArray(item.columns) || !Array.isArray(item.rows)) return;
        const heading = document.createElement('p');
        heading.className = 'game-history-attempt-label';
        heading.textContent = `Table: ${item.tableName || 'Question data'}`;
        const wrapper = document.createElement('div');
        wrapper.className = 'game-history-table-wrap';
        wrapper.append(createTable(
            item.columns.map(column => `${column.name} · ${column.type}`),
            item.rows,
            'schema-table',
        ));
        parent.append(heading, wrapper);
    };

    const renderGameHistory = history => {
        gameHistoryList.replaceChildren();
        history.forEach((item, index) => {
            const article = document.createElement('article');
            article.className = 'game-history-entry';

            const heading = document.createElement('div');
            heading.className = 'game-history-entry-heading';
            const title = document.createElement('h3');
            title.textContent = `${index + 1}. ${item.title}`;
            const status = document.createElement('span');
            status.className = 'game-history-status';
            status.dataset.status = item.status;
            status.textContent = item.status === 'correct'
                ? 'Correct'
                : item.status === 'incorrect'
                    ? 'Incorrect'
                    : 'Unanswered';
            heading.append(title, status);

            const question = document.createElement('p');
            question.className = 'game-history-question';
            question.textContent = item.question;
            article.append(heading, question);
            appendHistoryTable(article, item);

            if (!item.attempts?.length) {
                const unanswered = document.createElement('p');
                unanswered.className = 'game-history-attempt';
                unanswered.textContent = 'No answer was submitted for this question.';
                article.append(unanswered);
            } else {
                item.attempts.forEach((attempt, attemptIndex) => {
                    const attemptStatus = attempt.status === 'correct' ? 'Correct' : 'Incorrect';
                    appendHistoryCode(article, `Attempt ${attemptIndex + 1} · ${attemptStatus}`, attempt.submittedAnswer);
                    const feedback = document.createElement('p');
                    feedback.className = 'game-history-attempt';
                    feedback.textContent = attempt.feedback;
                    article.append(feedback);
                    if (attempt.status === 'incorrect' && typeof attempt.correctAnswer === 'string') {
                        appendHistoryCode(article, 'Correct answer', attempt.correctAnswer);
                    }
                });
            }
            gameHistoryList.append(article);
        });
    };

    const showGameHistory = async () => {
        historyReturnToGame = !gameOver;
        gameOverHome.hidden = true;
        gameHistoryView.hidden = false;
        gameOverScreen.hidden = false;
        gameHistorySummary.textContent = 'Loading this game session…';
        gameHistoryError.hidden = true;
        gameHistoryList.replaceChildren();
        historyBackButton.focus();
        try {
            const record = readLocalGameRecord();
            if (record) {
                renderGameHistory(record.history);
                gameHistorySummary.textContent =
                    `${difficultyNames[record.difficulty]} · ${record.finalScore ?? game?.score ?? 0} points · ${record.history.length} questions`;
                if (record.completed === false) {
                    gameHistorySummary.textContent += ' · In progress';
                }
            } else if (gameOver) {
                const completedRecord = await postGameRequest('/api/game/history');
                renderGameHistory(completedRecord.history);
                gameHistorySummary.textContent =
                    `${difficultyNames[completedRecord.difficulty]} · Final score: ${completedRecord.finalScore} · ${completedRecord.history.length} questions`;
            } else {
                renderGameHistory(sessionHistory);
                gameHistorySummary.textContent = `${difficultyNames[gameDifficulty]} · ${game?.score ?? 0} points · ${sessionHistory.length} questions`;
            }
            gameOverSaveStatus.textContent = historyStorageError || 'Game history is saved temporarily in this browser.';
            gameOverSaveStatus.hidden = false;
        } catch (error) {
            gameHistorySummary.textContent = '';
            gameHistoryError.textContent = error.message || 'Unable to load game history. Please try again.';
            gameHistoryError.hidden = false;
        }
    };

    const loadQuestion = async () => {
        if (requestInProgress || gameOver) return;
        requestInProgress = true;
        questionLoadFailed = false;
        questionLoadingStatus.textContent = 'Preparing the next question, database table, and sample data…';
        questionLoadingStatus.hidden = false;
        if (!challenge) questionText.textContent = 'Generating your challenge…';
        setQuestionControls();

        try {
            const generated = await postGameRequest('/api/game/question');
            if (generated.game) updateGameState(generated.game);
            renderChallenge(generated);
        } catch (error) {
            questionLoadFailed = true;
            showResult(
                challenge
                    ? `Your answer and score are saved, but the next question could not be prepared. ${error.message || 'Try again.'}`
                    : error.message || 'Unable to generate a challenge. Please try again.',
                'error',
            );
        } finally {
            requestInProgress = false;
            questionLoadingStatus.hidden = true;
            setQuestionControls();
        }
    };

    const showUnlockedHint = index => {
        currentHintIndex = index;
        hintDisplay.textContent = unlockedHints[index];
        hintDisplay.hidden = false;
        renderHintNavigation();
    };

    hintPreviousButton.addEventListener('click', () => {
        if (currentHintIndex > 0) showUnlockedHint(currentHintIndex - 1);
    });

    hintButton.addEventListener('click', async () => {
        if (requestInProgress) return;
        if (currentHintIndex >= 0 && currentHintIndex < hintsUnlocked - 1) {
            showUnlockedHint(currentHintIndex + 1);
            return;
        }
        if (!challenge || hintsUnlocked >= hintCosts.length) return;
        const hintIndex = hintsUnlocked;
        if (!game || game.score < hintCosts[hintIndex]) {
            renderHintNavigation();
            return;
        }

        requestInProgress = true;
        hintError = '';
        renderHintNavigation();
        try {
            const result = await postGameRequest('/api/game/hint', {
                challengeId: challenge.challengeId,
                hintIndex,
            });
            updateGameState(result);
            hintError = '';
            unlockedHints[result.hintIndex] = result.hint;
            hintsUnlocked = result.hintsUnlocked;
            showUnlockedHint(result.hintIndex);
        } catch (error) {
            hintError = error.message;
        } finally {
            requestInProgress = false;
            renderHintNavigation();
        }
    });

    clearButton.addEventListener('click', () => {
        editor.value = '';
        resultPanel.hidden = true;
        editor.focus();
    });

    submitButton.addEventListener('click', async () => {
        if (requestInProgress || questionComplete || gameOver) return;
        if (!editor.value.trim()) {
            showResult('Write a SQL query before checking your answer.', 'error');
            editor.focus();
            return;
        }
        if (!challenge) {
            showResult('Generate a challenge before submitting an answer.', 'error');
            return;
        }

        requestInProgress = true;
        const submittedAnswer = editor.value;
        submitButton.querySelector('span').textContent = 'Checking…';
        resultPanel.hidden = true;
        setQuestionControls();

        try {
            const result = await postGameRequest('/api/game/check', {
                challengeId: challenge.challengeId,
                sql: submittedAnswer,
            });
            updateGameState(result);
            questionComplete = true;
            if (currentHistoryEntry) {
                const attempt = {
                    submittedAnswer,
                    status: result.correct ? 'correct' : 'incorrect',
                    feedback: result.feedback,
                };
                if (!result.correct && typeof result.correctAnswer === 'string') {
                    attempt.correctAnswer = result.correctAnswer;
                }
                currentHistoryEntry.attempts.push(attempt);
                currentHistoryEntry.status = attempt.status;
            }
            if (Array.isArray(result.history)) sessionHistory = result.history;
            try {
                saveLocalGameRecord(Boolean(result.gameOver));
            } catch (error) {
                historyStorageError = `Unable to save game history in this browser: ${error.message}`;
            }
            if (result.gameOver) {
                finishGameOver();
            } else {
                const outcome = result.correct
                    ? `${result.feedback} (+${result.pointsAwarded} points)`
                    : `${result.feedback} One life lost.`;
                showResult(outcome, result.correct ? 'success' : 'error');
            }
        } catch (error) {
            showResult(error.message || 'Unable to check your answer. Please try again.', 'error');
        } finally {
            requestInProgress = false;
            submitButton.querySelector('span').textContent = 'Check answer';
            setQuestionControls();
        }
        if (questionComplete && !gameOver) await loadQuestion();
    });

    nextQuestionButton.addEventListener('click', loadQuestion);
    viewHistoryButton.addEventListener('click', showGameHistory);
    viewCurrentHistoryButton.addEventListener('click', showGameHistory);
    historyBackButton.addEventListener('click', () => {
        gameHistoryView.hidden = true;
        if (historyReturnToGame) {
            gameOverScreen.hidden = true;
            gameOverHome.hidden = false;
            viewCurrentHistoryButton.focus();
        } else {
            gameOverHome.hidden = false;
            viewHistoryButton.focus();
        }
    });
    playAgainButton.addEventListener('click', async () => {
        playAgainButton.disabled = true;
        gameOverSaveStatus.hidden = true;
        try {
            const newGame = await postGameRequest(
                '/api/game/start',
                { difficulty: gameDifficulty },
                null,
            );
            sessionStorage.setItem(gameSessionKey, newGame.sessionId);
            localStorage.setItem(latestGameSessionKey, newGame.sessionId);
            window.location.reload();
        } catch (error) {
            gameOverSaveStatus.textContent = `Unable to start a new game: ${error.message}`;
            gameOverSaveStatus.hidden = false;
            playAgainButton.disabled = false;
        }
    });

    editor.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        event.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.setRangeText('    ', start, end, 'end');
    });

    const initializeGame = async () => {
        requestInProgress = true;
        setQuestionControls();
        try {
            const points = await postGameRequest('/api/game/points', {}, null);
            updateTotalPoints(points.totalPoints);
        } catch (error) {
            questionText.textContent = 'Unable to load your total points.';
            showResult(error.message || 'Unable to load your saved points. Please try again.', 'error');
            requestInProgress = false;
            setQuestionControls();
            return;
        }

        if (!sessionId) {
            gameOver = true;
            requestInProgress = false;
            setQuestionControls();
            questionText.textContent = 'Start a game from the dashboard to begin.';
            showResult('No active game was found. Return to the dashboard and select Start game.', 'error');
            return;
        }

        questionText.textContent = 'Restoring your game…';
        requestInProgress = true;
        setQuestionControls();
        try {
            const state = await postGameRequest('/api/game/state');
            updateGameState(state);
            setGameDifficulty(state.difficulty);
            if (Array.isArray(state.history)) sessionHistory = state.history;
            if (state.gameOver) {
                gameOver = true;
                gameDifficulty = state.difficulty || gameDifficulty;
                if (Array.isArray(state.history)) sessionHistory = state.history;
                questionText.textContent = 'Game over';
                finishGameOver();
            } else if (state.activeChallenge) {
                renderChallenge(state.activeChallenge);
                if (state.activeChallenge.completed) {
                    requestInProgress = false;
                    await loadQuestion();
                }
            } else {
                requestInProgress = false;
                await loadQuestion();
            }
        } catch (error) {
            const savedRecord = readLocalGameRecord();
            if (savedRecord?.completed && Array.isArray(savedRecord.history)) {
                sessionHistory = savedRecord.history;
                gameDifficulty = savedRecord.difficulty || gameDifficulty;
                updateGameState({ score: savedRecord.finalScore, lives: 0, gameOver: true });
                finishGameOver();
            } else {
                if (error.status === 403 || error.status === 404) {
                    sessionStorage.removeItem(gameSessionKey);
                    localStorage.removeItem(latestGameSessionKey);
                }
                questionText.textContent = 'Unable to restore your game.';
                showResult(
                    error.status === 403 || error.status === 404
                        ? 'This game session is no longer available for the signed-in account. Return to the dashboard to start a new game.'
                        : error.message || 'Unable to restore your game. Return to the dashboard to start a new game.',
                    'error',
                );
            }
        } finally {
            requestInProgress = false;
            setQuestionControls();
        }
    };

    setQuestionControls();
    await initializeGame();
});
