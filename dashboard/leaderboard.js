const DashboardLeaderboard = (() => {
    const dialog = document.getElementById('leaderboardDialog');
    const closeButton = document.getElementById('leaderboardClose');
    const refreshButton = document.getElementById('refreshLeaderboard');
    const status = document.getElementById('leaderboardStatus');
    const errorMessage = document.getElementById('leaderboardError');
    const emptyMessage = document.getElementById('leaderboardEmpty');
    const tableWrap = document.getElementById('leaderboardTableWrap');
    const rowsContainer = document.getElementById('leaderboardRows');
    const updatedLabel = document.getElementById('leaderboardUpdated');
    let requestInProgress = false;
    let dialogOpener = null;

    const renderPlayers = players => {
        rowsContainer.replaceChildren();
        players.forEach(player => {
            const row = document.createElement('tr');
            if (player.rank === 1) row.dataset.place = 'gold';
            else if (player.rank === 2) row.dataset.place = 'silver';
            else if (player.rank === 3) row.dataset.place = 'bronze';

            const rank = document.createElement('td');
            rank.className = 'leaderboard-rank';
            const medal = player.rank === 1 ? ' 🥇'
                : player.rank === 2 ? ' 🥈'
                    : player.rank === 3 ? ' 🥉' : '';
            rank.textContent = `#${player.rank}${medal}`;

            const username = document.createElement('td');
            username.className = 'leaderboard-username';
            username.textContent = player.username;

            const points = document.createElement('td');
            points.className = 'leaderboard-points';
            points.textContent = player.totalPoints.toLocaleString();

            row.append(rank, username, points);
            rowsContainer.append(row);
        });

        tableWrap.hidden = players.length === 0;
        emptyMessage.hidden = players.length !== 0;
        status.hidden = true;
    };

    const fetchLeaderboard = async () => {
        if (requestInProgress) return;
        requestInProgress = true;
        refreshButton.disabled = true;
        refreshButton.textContent = '↻ Loading…';
        status.textContent = tableWrap.hidden ? 'Loading leaderboard…' : 'Refreshing leaderboard…';
        status.hidden = false;
        errorMessage.hidden = true;

        try {
            const { data, error } = await AppAuth.getSession();
            if (error) throw error;
            const headers = data.session
                ? { Authorization: `Bearer ${data.session.access_token}` }
                : {};
            const response = await fetch('/api/leaderboard', {
                method: 'GET',
                headers,
                credentials: 'same-origin',
                cache: 'no-store',
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || `Leaderboard request failed (${response.status}).`);
            }
            if (!Array.isArray(result.players)) {
                throw new Error('The leaderboard returned invalid data. Please refresh and try again.');
            }

            renderPlayers(result.players);
            updatedLabel.textContent = `Updated ${new Date().toLocaleTimeString()}`;
            updatedLabel.hidden = false;
        } catch (error) {
            status.hidden = true;
            errorMessage.textContent = error.message || 'Unable to load the leaderboard. Please try again.';
            errorMessage.hidden = false;
        } finally {
            requestInProgress = false;
            refreshButton.disabled = false;
            refreshButton.textContent = '↻ Refresh';
        }
    };

    const open = opener => {
        if (dialog.open) return;
        dialogOpener = opener;
        dialog.showModal();
        fetchLeaderboard();
    };

    document.getElementById('leaderboardButton').addEventListener('click', event => open(event.currentTarget));
    closeButton.addEventListener('click', () => dialog.close());
    refreshButton.addEventListener('click', fetchLeaderboard);
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
        dialogOpener?.focus();
        dialogOpener = null;
    });

    document.querySelector('[data-feature="leaderboard"]').addEventListener('click', event => {
        open(event.currentTarget);
    });

    window.setInterval(() => {
        if (dialog.open && !document.hidden) fetchLeaderboard();
    }, 30000);

    return Object.freeze({ open, refresh: fetchLeaderboard });
})();
