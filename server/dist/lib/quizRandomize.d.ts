/** Fisher–Yates shuffle */
export declare function shuffle<T>(arr: T[]): T[];
export declare function pickRandomIds(pool: string[], count: number, randomize?: boolean): string[];
export declare function shuffleMcqOptions(options: string[]): {
    shuffled: string[];
    correctIndex: number;
    correctLabel: string;
};
//# sourceMappingURL=quizRandomize.d.ts.map