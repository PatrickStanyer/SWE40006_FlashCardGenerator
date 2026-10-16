import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../src/components/Dashboard.jsx';

const mocks = vi.hoisted(() => ({
    from: vi.fn(),
    insert: vi.fn(),
    generateCards: vi.fn(),
}));

vi.mock('../src/supabase.js', () => ({ supabase: { from: mocks.from } }));
vi.mock('../src/api.js', () => ({ generateCards: mocks.generateCards }));

const session = { user: { id: 'user-123', email: 'study@example.com', user_metadata: {} } };
const savedDeck = {
    id: 'deck-1',
    title: 'Docker basics',
    cards: [{ id: 0, front: 'What is Docker?', back: 'A container platform.' }],
    created_at: '2026-01-01T00:00:00.000Z',
};

function renderDashboard() {
    return render(<Dashboard session={session} onSignOut={vi.fn()} signOutLoading={false} />);
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({ data: [savedDeck], error: null }),
            })),
        })),
        insert: mocks.insert,
    });
    mocks.insert.mockReturnValue({
        select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: savedDeck, error: null }),
        })),
    });
});

describe('Dashboard', () => {
    it('loads and displays decks belonging to the signed-in user', async () => {
        renderDashboard();

        expect(await screen.findByRole('heading', { level: 3, name: 'Docker basics' })).toBeInTheDocument();
        expect(mocks.from).toHaveBeenCalledWith('decks');
    });

    it('generates and saves a new deck for the signed-in user', async () => {
        const user = userEvent.setup();
        const cards = [{ id: 0, front: 'Bonjour means?', back: 'Hello.' }];
        mocks.generateCards.mockResolvedValue(cards);
        mocks.insert.mockReturnValue({
            select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                    data: { ...savedDeck, id: 'deck-2', title: 'French', cards },
                    error: null,
                }),
            })),
        });

        renderDashboard();
        await user.click(screen.getByRole('button', { name: /create a deck/i }));
        await user.type(screen.getByLabelText('Topic'), 'French');
        await user.click(screen.getByRole('button', { name: /generate cards/i }));

        expect(await screen.findByText('Bonjour means?')).toBeInTheDocument();
        expect(mocks.generateCards).toHaveBeenCalledWith('French', 5);
        expect(mocks.insert).toHaveBeenCalledWith({ user_id: session.user.id, title: 'French', cards });
    });
});
