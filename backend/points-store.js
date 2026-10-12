const GAME_POINTS = Object.freeze({ easy: 10, normal: 25, hard: 50 });
const HINT_COSTS = Object.freeze([3, 5, 7]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class PointsStoreError extends Error {
    constructor(message, status = 503) {
        super(message);
        this.status = status;
    }
}

function readTotalPoints(value) {
    const total = Number(value);
    if (!Number.isSafeInteger(total) || total < 0) {
        throw new PointsStoreError('Supabase returned an invalid points total.');
    }
    return total;
}

function rankLeaderboardRows(rows) {
    if (!Array.isArray(rows)) {
        throw new PointsStoreError('Supabase returned invalid leaderboard data.');
    }

    const players = rows.flatMap(row => {
        if (!row || typeof row !== 'object') return [];
        const totalPoints = Number(row.total_points);
        if (!Number.isSafeInteger(totalPoints) || totalPoints <= 0) return [];
        const username = typeof row.username === 'string' && row.username.trim()
            ? row.username.trim().slice(0, 40)
            : 'Player';
        return [{ username, totalPoints }];
    });

    players.sort((left, right) =>
        right.totalPoints - left.totalPoints ||
        left.username.localeCompare(right.username, undefined, { sensitivity: 'base' }),
    );

    let rank = 0;
    let previousPoints = null;
    return players.map((player, index) => {
        if (player.totalPoints !== previousPoints) rank = index + 1;
        previousPoints = player.totalPoints;
        return { rank, ...player };
    });
}

function createPointsStore({ supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
    if (!supabaseUrl || !serviceRoleKey) {
        throw new PointsStoreError(
            'Permanent points storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the backend .env file.',
        );
    }

    const restUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1`;

    const callRpc = async (name, body, allowEmpty = false) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetchImpl(`${restUrl}/rpc/${name}`, {
                method: 'POST',
                headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const responseText = await response.text();
            let result;
            try {
                result = JSON.parse(responseText);
            } catch {
                result = null;
            }
            if (!response.ok) {
                throw new PointsStoreError(`Supabase request failed (${response.status}).`);
            }
            if (!Array.isArray(result) || (!allowEmpty && !result[0])) {
                throw new PointsStoreError(
                    allowEmpty
                        ? 'Supabase returned invalid leaderboard data.'
                        : 'Supabase returned an invalid permanent points response.',
                );
            }
            return allowEmpty ? result : result[0];
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new PointsStoreError('The permanent points request timed out. Please try again.');
            }
            if (error instanceof PointsStoreError) throw error;
            throw new PointsStoreError('Unable to reach Supabase to update permanent points.');
        } finally {
            clearTimeout(timeout);
        }
    };

    const getTotal = async userId => {
        const result = await callRpc('get_or_create_player_points', { p_user_id: userId });
        return readTotalPoints(result.total_points);
    };

    const getLeaderboard = async () =>
        rankLeaderboardRows(await callRpc('get_player_leaderboard', {}, true));

    const applyChange = async (userId, eventKey, pointsDelta) => {
        const result = await callRpc('apply_player_points_change', {
            p_user_id: userId,
            p_event_key: eventKey,
            p_points_delta: pointsDelta,
        });
        if (typeof result.applied !== 'boolean' || typeof result.insufficient !== 'boolean') {
            throw new PointsStoreError('Supabase returned an invalid points update status.');
        }
        return {
            totalPoints: readTotalPoints(result.total_points),
            applied: result.applied,
            insufficient: result.insufficient,
        };
    };

    return Object.freeze({
        getTotal,
        getLeaderboard,
        awardAnswer(userId, challengeId, difficulty) {
            if (!UUID_PATTERN.test(challengeId)) {
                throw new PointsStoreError('Cannot award points for an invalid challenge.', 400);
            }
            if (!Object.hasOwn(GAME_POINTS, difficulty)) {
                throw new PointsStoreError('Cannot award points for an unknown difficulty.', 400);
            }
            const points = GAME_POINTS[difficulty];
            return applyChange(userId, `${challengeId}:answer`, points);
        },
        deductHint(userId, challengeId, hintIndex) {
            if (!UUID_PATTERN.test(challengeId)) {
                throw new PointsStoreError('Cannot charge for an invalid challenge.', 400);
            }
            const cost = HINT_COSTS[hintIndex];
            if (!Number.isInteger(hintIndex) || cost === undefined) {
                throw new PointsStoreError('Cannot charge for an unknown hint.', 400);
            }
            return applyChange(userId, `${challengeId}:hint:${hintIndex}`, -cost);
        },
    });
}

module.exports = {
    createPointsStore,
    GAME_POINTS,
    HINT_COSTS,
    PointsStoreError,
    rankLeaderboardRows,
};
