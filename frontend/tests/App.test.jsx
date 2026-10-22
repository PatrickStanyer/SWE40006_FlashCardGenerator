import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';
import { normalizeCards } from '../src/api.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

async function submitTopic(topic = 'Docker') {
  const user = userEvent.setup();
  render(<App />);
  if (topic) await user.type(screen.getByLabelText('Topic'), topic);
  await user.click(screen.getByRole('button', { name: /generate cards/i }));
}

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('posts topic and count to /api/generate and shows the first card', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({
        cards: [{ question: 'What is Docker?', answer: 'A container platform.' }],
        source: 'model',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await submitTopic('Docker');

    expect(await screen.findByText('What is Docker?')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId('flashcard'));
    expect(screen.getByText('Answer')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/generate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ topic: 'Docker', count: 5 });
  });

  it('labels deterministic fallback content as a study prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({ cards: [{ front: 'What is Docker?', back: 'Explain Docker.' }], source: 'deterministic' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await submitTopic('Docker');

    await userEvent.setup().click(screen.getByTestId('flashcard'));
    expect(screen.getByText('How to answer')).toBeInTheDocument();
  });

  it('blocks empty topics without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await submitTopic('');

    expect(screen.getByRole('alert')).toHaveTextContent(/enter a topic/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows an error when the API responds with a failure status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await submitTopic();
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500');
  });

  it('shows an error when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await submitTopic();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });

  it('limits the requested card count to the supported range', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(ok({ cards: [] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await user.type(screen.getByLabelText('Topic'), 'Docker');
    const countInput = screen.getByLabelText('Number of cards');
    await user.clear(countInput);
    await user.type(countInput, '25');
    await user.click(screen.getByRole('button', { name: /generate cards/i }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).count).toBe(20);

    await user.clear(countInput);
    await user.type(countInput, '-5');
    await user.click(screen.getByRole('button', { name: /generate cards/i }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).count).toBe(1);
  });
});

describe('normalizeCards', () => {
  it('accepts a bare array of front/back cards', () => {
    expect(normalizeCards([{ front: 'Q', back: 'A' }])).toEqual([{ id: 0, front: 'Q', back: 'A' }]);
  });

  it('rejects payloads that contain no card list', () => {
    expect(() => normalizeCards({ detail: 'nope' })).toThrow(/unexpected response/i);
  });
});
