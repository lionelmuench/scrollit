function setStatValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function renderHomeStats() {
    const dailyStats = summarizeDailyStats();
    const endlessStats = summarizeEndlessStats();

    setStatValue('daily-total-wins', dailyStats.totalWins);
    setStatValue('daily-current-streak', dailyStats.currentStreak);
    setStatValue('daily-best-streak', dailyStats.bestStreak);
    setStatValue('daily-average-steps', dailyStats.totalWins ? dailyStats.averageSteps.toFixed(1) : '0.0');
    setStatValue('daily-last-solved', dailyStats.lastSolvedDate ? formatDateKey(dailyStats.lastSolvedDate) : 'Not yet');

    setStatValue('endless-best-score', endlessStats.bestScore);
    setStatValue('endless-last-score', endlessStats.lastScore);
    setStatValue('endless-total-runs', endlessStats.totalRuns);
    setStatValue('endless-average-score', endlessStats.totalRuns ? endlessStats.averageScore.toFixed(1) : '0.0');
}

document.addEventListener('DOMContentLoaded', renderHomeStats);
