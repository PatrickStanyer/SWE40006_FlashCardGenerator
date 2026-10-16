import { useState } from 'react';

const MIN_CARDS = 1;
const MAX_CARDS = 20;

export default function GeneratorForm({ onGenerate, loading = false }) {
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [submitted, setSubmitted] = useState(false);
  const trimmed = topic.trim();
  const showError = submitted && !trimmed;

  function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
    if (!trimmed) return;
    const safeCount = Math.min(MAX_CARDS, Math.max(MIN_CARDS, Number(count) || 5));
    onGenerate(trimmed, safeCount);
  }

  return (
    <form className="generator" onSubmit={handleSubmit} noValidate>
      <label htmlFor="topic">Topic</label>
      <input
        id="topic"
        type="text"
        value={topic}
        placeholder="e.g. Docker networking"
        onChange={(e) => setTopic(e.target.value)}
        aria-invalid={showError}
        aria-describedby={showError ? 'topic-error' : undefined}
      />
      {showError && (
        <p id="topic-error" role="alert" className="field-error">
          Enter a topic to generate cards.
        </p>
      )}
      <label htmlFor="count">Number of cards</label>
      <input
        id="count"
        type="number"
        min={MIN_CARDS}
        max={MAX_CARDS}
        value={count}
        onChange={(e) => setCount(e.target.value)}
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Generating…' : 'Generate cards'}
      </button>
    </form>
  );
}
