window.GameHistoryRenderer = Object.freeze({
    render(container, history, createTable) {
        container.replaceChildren();
        history.forEach((item, index) => {
            const article = document.createElement('article');
            article.className = 'game-history-entry';

            const heading = document.createElement('div');
            heading.className = 'game-history-entry-heading';
            const title = document.createElement('h3');
            title.textContent = `${index + 1}. ${item.title || 'Question'}`;
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
            question.textContent = item.question || '';
            article.append(heading, question);

            const appendTable = (tableName, columns, rows) => {
                if (!Array.isArray(columns) || !Array.isArray(rows)) return;
                const tableHeading = document.createElement('p');
                tableHeading.className = 'game-history-attempt-label';
                tableHeading.textContent = `Table: ${tableName || 'Question data'}`;
                const wrapper = document.createElement('div');
                wrapper.className = 'game-history-table-wrap';
                wrapper.append(createTable(
                    columns.map(column => `${column.name} · ${column.type}`),
                    rows,
                    'schema-table',
                ));
                article.append(tableHeading, wrapper);
            };

            if (Array.isArray(item.tables)) {
                item.tables.forEach(table => appendTable(table.name, table.columns, table.rows));
            } else {
                appendTable(item.tableName, item.columns, item.rows);
            }

            if (!item.attempts?.length) {
                const unanswered = document.createElement('p');
                unanswered.className = 'game-history-attempt';
                unanswered.textContent = 'No answer was submitted for this question.';
                article.append(unanswered);
            } else {
                item.attempts.forEach((attempt, attemptIndex) => {
                    const attemptStatus = attempt.status === 'correct' ? 'Correct' : 'Incorrect';
                    const appendCode = (label, sql) => {
                        const codeHeading = document.createElement('p');
                        codeHeading.className = 'game-history-attempt-label';
                        codeHeading.textContent = label;
                        const code = document.createElement('pre');
                        code.className = 'game-history-code';
                        const codeContent = document.createElement('code');
                        codeContent.textContent = sql || '';
                        code.append(codeContent);
                        article.append(codeHeading, code);
                    };
                    appendCode(`Attempt ${attemptIndex + 1} · ${attemptStatus}`, attempt.submittedAnswer);
                    const feedback = document.createElement('p');
                    feedback.className = 'game-history-attempt';
                    feedback.textContent = attempt.feedback || '';
                    article.append(feedback);
                    if (attempt.status === 'incorrect' && typeof attempt.correctAnswer === 'string') {
                        appendCode('Correct answer', attempt.correctAnswer);
                    }
                });
            }
            container.append(article);
        });
    },
});