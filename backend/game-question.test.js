const test = require('node:test');
const assert = require('node:assert/strict');
const {
    generateValidatedChallenge,
    generateWithFallback,
    parseGeneratedQuestion,
} = require('./game-question');

const challenge = () => ({
    title: 'Simple filter',
    question: 'Find IDs greater than one.',
    tables: [{
        name: 'students',
        columns: [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'TEXT' }],
        rows: [[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D']],
    }],
    hints: ['Look at IDs.', 'Use a comparison.', 'Filter IDs greater than one.'],
    solution: 'SELECT id FROM students WHERE id > 1',
    expectedOutput: { columns: ['id'], rows: [[2], [3], [4]] },
    explanation: 'The WHERE clause keeps IDs greater than one.',
});

test('retries one malformed AI response with the same selected difficulty', async () => {
    const prompts = [];
    const result = await generateValidatedChallenge('easy', async prompt => {
        prompts.push(prompt);
        if (prompts.length === 1) {
            const error = new Error('Malformed AI JSON');
            error.retryableGeneration = true;
            throw error;
        }
        return challenge();
    });

    assert.equal(result.title, 'Simple filter');
    assert.equal(prompts.length, 2);
    assert.match(prompts[0], /easy difficulty/);
    assert.match(prompts[1], /previous response did not meet the selected difficulty/i);
});

test('falls back only when the primary provider signals a rate limit', async () => {
    let fallbackCalls = 0;
    const response = await generateWithFallback(
        async () => {
            const error = new Error('Provider quota reached');
            error.isLimit = true;
            throw error;
        },
        async () => {
            fallbackCalls += 1;
            return 'Gemini response';
        },
    );
    assert.equal(response, 'Gemini response');
    assert.equal(fallbackCalls, 1);
});

test('falls back when the primary provider returns unusable challenge output', async () => {
    let fallbackCalls = 0;
    const response = await generateWithFallback(
        async () => {
            const error = new Error('Primary response was not JSON');
            error.fallbackEligible = true;
            throw error;
        },
        async () => {
            fallbackCalls += 1;
            return 'Gemini response';
        },
    );
    assert.equal(response, 'Gemini response');
    assert.equal(fallbackCalls, 1);
});

test('does not fall back on non-quota provider errors', async () => {
    let fallbackCalls = 0;
    await assert.rejects(
        generateWithFallback(
            async () => {
                const error = new Error('Invalid Groq key');
                error.isLimit = false;
                throw error;
            },
            async () => {
                fallbackCalls += 1;
            },
        ),
        /Invalid Groq key/,
    );
    assert.equal(fallbackCalls, 0);
});

test('parses challenge JSON surrounded by model commentary and marks malformed output retryable', () => {
    assert.deepEqual(parseGeneratedQuestion('Here is the challenge:\n```json\n{"title":"ok"}\n```'), { title: 'ok' });
    assert.throws(
        () => parseGeneratedQuestion('not valid JSON'),
        error => error.retryableGeneration === true && error.status === 502,
    );
});
