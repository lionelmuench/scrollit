const DAILY_STATS_KEY = 'scrollit-daily-stats-v1';
const ENDLESS_STATS_KEY = 'scrollit-endless-stats-v1';
const LEGACY_ENDLESS_HIGHSCORE_KEY = 'scrollit-endless-highscore';
const DAILY_TIME_ZONE = 'America/New_York';
const DAILY_EPOCH_KEY = '2025-01-01';

function loadJsonStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return { ...fallback, ...JSON.parse(raw) };
    } catch (error) {
        return fallback;
    }
}

function saveJsonStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function getEasternDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: DAILY_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);

    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
        year: Number(lookup.year),
        month: Number(lookup.month),
        day: Number(lookup.day)
    };
}

function getEasternDateKey(date = new Date()) {
    const { year, month, day } = getEasternDateParts(date);
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
}

function dateKeyToUtcDayNumber(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function formatDateKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

function getDailyPuzzleIndex(totalPuzzles, dateKey = getEasternDateKey()) {
    if (!totalPuzzles) return 0;
    const offset = dateKeyToUtcDayNumber(dateKey) - dateKeyToUtcDayNumber(DAILY_EPOCH_KEY);
    return ((offset % totalPuzzles) + totalPuzzles) % totalPuzzles;
}

function getDailyStatsRecord() {
    const record = loadJsonStorage(DAILY_STATS_KEY, { solves: {} });
    if (!record.solves || typeof record.solves !== 'object') {
        record.solves = {};
    }
    return record;
}

function getDailySolve(dateKey) {
    return getDailyStatsRecord().solves[dateKey] || null;
}

function recordDailySolve(dateKey, solveData) {
    const record = getDailyStatsRecord();
    if (record.solves[dateKey]) {
        return false;
    }

    record.solves[dateKey] = {
        steps: solveData.steps,
        puzzleIndex: solveData.puzzleIndex,
        solvedAt: new Date().toISOString()
    };
    saveJsonStorage(DAILY_STATS_KEY, record);
    return true;
}

function summarizeDailyStats(record = getDailyStatsRecord()) {
    const entries = Object.entries(record.solves)
        .filter(([, value]) => value && Number.isFinite(Number(value.steps)))
        .sort(([left], [right]) => left.localeCompare(right));

    const totalWins = entries.length;
    const totalSteps = entries.reduce((sum, [, value]) => sum + Number(value.steps), 0);
    const averageSteps = totalWins ? (totalSteps / totalWins) : 0;
    const solvedDates = entries.map(([dateKey]) => dateKey);
    const lastSolvedDate = solvedDates.length ? solvedDates[solvedDates.length - 1] : null;

    let bestStreak = 0;
    let currentStreak = 0;
    let runningStreak = 0;
    let previousDay = null;

    for (const dateKey of solvedDates) {
        const dayNumber = dateKeyToUtcDayNumber(dateKey);
        if (previousDay !== null && dayNumber === previousDay + 1) {
            runningStreak += 1;
        } else {
            runningStreak = 1;
        }
        previousDay = dayNumber;
        bestStreak = Math.max(bestStreak, runningStreak);
    }

    if (lastSolvedDate) {
        let cursor = dateKeyToUtcDayNumber(lastSolvedDate);
        const solvedSet = new Set(solvedDates);
        while (solvedSet.has(new Date(cursor * 86400000).toISOString().slice(0, 10))) {
            currentStreak += 1;
            cursor -= 1;
        }
    }

    return {
        totalWins,
        currentStreak,
        bestStreak,
        averageSteps,
        lastSolvedDate
    };
}

function getEndlessStatsRecord() {
    const legacyHighScore = parseInt(localStorage.getItem(LEGACY_ENDLESS_HIGHSCORE_KEY) || '0', 10) || 0;
    const record = loadJsonStorage(ENDLESS_STATS_KEY, {
        bestScore: legacyHighScore,
        lastScore: 0,
        totalRuns: 0,
        totalScore: 0
    });

    if (legacyHighScore > (record.bestScore || 0)) {
        record.bestScore = legacyHighScore;
    }

    if (!Number.isFinite(record.lastScore)) record.lastScore = 0;
    if (!Number.isFinite(record.totalRuns)) record.totalRuns = 0;
    if (!Number.isFinite(record.totalScore)) record.totalScore = 0;
    if (!Number.isFinite(record.bestScore)) record.bestScore = legacyHighScore;

    return record;
}

function saveEndlessStatsRecord(record) {
    saveJsonStorage(ENDLESS_STATS_KEY, record);
    localStorage.setItem(LEGACY_ENDLESS_HIGHSCORE_KEY, String(record.bestScore || 0));
}

function recordEndlessRun(score) {
    const record = getEndlessStatsRecord();
    record.lastScore = score;
    record.totalRuns += 1;
    record.totalScore += score;
    record.bestScore = Math.max(record.bestScore || 0, score);
    saveEndlessStatsRecord(record);
    return record;
}

function summarizeEndlessStats(record = getEndlessStatsRecord()) {
    return {
        bestScore: record.bestScore || 0,
        lastScore: record.lastScore || 0,
        totalRuns: record.totalRuns || 0,
        averageScore: record.totalRuns ? (record.totalScore / record.totalRuns) : 0
    };
}
