// Environment-driven API base. Defaults to the same-origin "/api" path.
export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

// Accepts [{front, back}] or {cards: [{question, answer}]} so the UI keeps
// working whichever shape the backend contract settles on.
export function normalizeCards(payload) {
  const list = Array.isArray(payload) ? payload : payload?.cards;
  if (!Array.isArray(list)) {
    throw new Error('The server returned an unexpected response.');
  }
  return list.map((card, i) => ({
    id: card.id ?? i,
    front: card.front ?? card.question ?? '',
    back: card.back ?? card.answer ?? '',
  }));
}

export async function generateCards(topic, count) {
  let res;
  try {
    res = await fetch(`${API_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, count }),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    throw new Error(`Card generation failed (HTTP ${res.status}). Try again in a moment.`);
  }
  const payload = await res.json();
  return {
    cards: normalizeCards(payload),
    source: payload?.source,
  };
}
