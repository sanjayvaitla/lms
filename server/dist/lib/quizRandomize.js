"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shuffle = shuffle;
exports.pickRandomIds = pickRandomIds;
exports.shuffleMcqOptions = shuffleMcqOptions;
/** Fisher–Yates shuffle */
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function pickRandomIds(pool, count, randomize = true) {
    const arr = randomize ? shuffle(pool) : [...pool];
    if (count >= arr.length)
        return arr;
    return arr.slice(0, count);
}
function shuffleMcqOptions(options) {
    const correctLabel = options[0];
    const shuffled = shuffle(options);
    const correctIndex = shuffled.indexOf(correctLabel);
    return { shuffled, correctIndex, correctLabel };
}
//# sourceMappingURL=quizRandomize.js.map