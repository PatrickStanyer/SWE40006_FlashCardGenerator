import { expect, test } from '@playwright/test';

// Smoke suite for a deployed environment. It checks the core user journey end
// to end through the real nginx -> FastAPI path: page loads, API is healthy,
// a deck is generated, and the card can be flipped and navigated.
//
// Assertions target behaviour, not card wording, so the suite passes whether
// the backend is in AI_MOCK_MODE or calling a live LLM.
//
// Optional: set EXPECTED_VERSION (e.g. "sha-1a2b3c4") to also assert that the
// deployment serving traffic is the one CD just released.

const TOPIC = 'Playwright smoke test';
const COUNT = 3;

test.describe('Deployed environment smoke test', () => {
  test('health endpoint reports ok', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');

    if (process.env.EXPECTED_VERSION) {
      expect(body.version).toBe(process.env.EXPECTED_VERSION);
    }
  });

  test('generate API returns the requested number of cards', async ({ request }) => {
    const res = await request.post('/api/generate', { data: { topic: TOPIC, count: COUNT } });
    expect(res.status()).toBe(200);

    const { cards } = await res.json();
    expect(cards).toHaveLength(COUNT);
    for (const card of cards) {
      expect(card.front.trim()).not.toBe('');
      expect(card.back.trim()).not.toBe('');
    }
  });

  test('generate API rejects an invalid request', async ({ request }) => {
    const res = await request.post('/api/generate', { data: { count: COUNT } });
    expect(res.status()).toBe(422);
  });

  test('home page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByLabel('Topic')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate cards' })).toBeVisible();
  });

  test('user can generate, flip and navigate a deck', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Topic').fill(TOPIC);
    await page.getByLabel('Number of cards').fill(String(COUNT));
    await page.getByRole('button', { name: 'Generate cards' }).click();

    // First card appears with the question side up.
    const card = page.getByTestId('flashcard');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    await expect(card).toContainText('Question');
    await expect(page.getByText(`Card 1 of ${COUNT}`)).toBeVisible();

    const question = await card.textContent();

    // Flip reveals the answer ('Answer' on model decks, 'How to answer' on
    // deterministic decks).
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toContainText(/Answer|How to answer/);
    expect(await card.textContent()).not.toBe(question);

    // Next moves on and resets to the question side.
    const previous = page.getByRole('button', { name: 'Previous' });
    const next = page.getByRole('button', { name: 'Next' });
    await expect(previous).toBeDisabled();

    await next.click();
    await expect(page.getByText(`Card 2 of ${COUNT}`)).toBeVisible();
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    await expect(previous).toBeEnabled();

    // Last card disables Next.
    await next.click();
    await expect(page.getByText(`Card ${COUNT} of ${COUNT}`)).toBeVisible();
    await expect(next).toBeDisabled();
  });

  test('empty topic shows a validation message', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Generate cards' }).click();
    await expect(page.getByText('Enter a topic to generate cards.')).toBeVisible();
    await expect(page.getByTestId('flashcard')).toHaveCount(0);
  });
});
