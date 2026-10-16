import { useState } from 'react';

export default function CardDeck({ cards = [], error = null, loading = false }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (error) {
    return <p role="alert" className="notice notice-error">{error}</p>;
  }
  if (loading) {
    return <p role="status" className="notice">Generating your cards…</p>;
  }
  if (cards.length === 0) {
    return <p className="notice">No cards yet. Enter a topic above to generate a deck.</p>;
  }

  const card = cards[index];
  const goTo = (next) => {
    setIndex(next);
    setFlipped(false);
  };

  return (
    <section className="deck" aria-label="Flashcard deck">
      <button
        type="button"
        className="card"
        data-testid="flashcard"
        aria-pressed={flipped}
        onClick={() => setFlipped((f) => !f)}
      >
        <span className="card-side">{flipped ? 'Answer' : 'Question'}</span>
        <span className="card-text" key={`${index}-${flipped}`}>
          {flipped ? card.back : card.front}
        </span>
      </button>
      <div className="deck-controls">
        <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0}>
          Previous
        </button>
        <span aria-live="polite">
          Card {index + 1} of {cards.length}
        </span>
        <button type="button" onClick={() => goTo(index + 1)} disabled={index === cards.length - 1}>
          Next
        </button>
      </div>
    </section>
  );
}
