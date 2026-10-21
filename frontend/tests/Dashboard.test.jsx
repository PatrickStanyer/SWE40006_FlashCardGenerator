import { render, screen, within } from '@testing-library/react';
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

function renderDashboard({ onSignOut = vi.fn(), signOutLoading = false } = {}) {
    return render(<Dashboard session={session} onSignOut={onSignOut} signOutLoading={signOutLoading} />);
}

beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', `${window.location.pathname}#decks`);
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
    it('navigates sidebar destinations and creates from the new deck menu', async () => {
        const user = userEvent.setup();
        renderDashboard();
        const navigation = within(screen.getByRole('navigation', { name: 'Dashboard navigation' }));

        expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
        expect(window.location.hash).toBe('#decks');
        await user.click(screen.getByRole('button', { name: /new deck/i }));
        expect(screen.getByRole('menu', { name: 'Create a deck' })).toBeInTheDocument();
        await user.click(screen.getByRole('menuitem', { name: 'Create manually' }));
        expect(await screen.findByRole('heading', { level: 1, name: 'Create a deck manually' })).toBeInTheDocument();
        expect(window.location.hash).toBe('#create-manual');

        await user.click(navigation.getByRole('link', { name: 'My decks' }));
        await user.click(screen.getByRole('button', { name: /new deck/i }));
        await user.click(screen.getByRole('menuitem', { name: 'Auto-generate' }));
        expect(await screen.findByRole('heading', { level: 1, name: 'Auto-generate a deck' })).toBeInTheDocument();
        expect(window.location.hash).toBe('#generate');

        await user.click(navigation.getByRole('link', { name: 'My decks' }));
        expect(await screen.findByRole('heading', { level: 1, name: 'My decks' })).toBeInTheDocument();
        expect(window.location.hash).toBe('#decks');
    });

    it('loads and displays decks belonging to the signed-in user', async () => {
        const user = userEvent.setup();
        renderDashboard();

        await user.click(within(screen.getByRole('navigation', { name: 'Dashboard navigation' })).getByRole('link', { name: /my decks/i }));
        expect(await screen.findByRole('heading', { level: 3, name: 'Docker basics' })).toBeInTheDocument();
        expect(mocks.from).toHaveBeenCalledWith('decks');
    });

    it('shows the empty-library state and allows the create form to be dismissed', async () => {
        const user = userEvent.setup();
        mocks.from.mockReturnValue({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
            })),
        });

        renderDashboard();

        await user.click(within(screen.getByRole('navigation', { name: 'Dashboard navigation' })).getByRole('link', { name: /my decks/i }));
        expect(await screen.findByRole('heading', { name: 'Your first deck is waiting.' })).toBeInTheDocument();
        await user.click(screen.getByRole('link', { name: 'Auto-generate your first deck' }));
        expect(screen.getByRole('heading', { name: 'What are you learning?' })).toBeInTheDocument();
        await user.click(screen.getByRole('link', { name: 'Close create deck form' }));
        expect(screen.queryByRole('heading', { name: 'What are you learning?' })).not.toBeInTheDocument();
    });

    it('shows a useful message when loading decks fails', async () => {
        mocks.from.mockReturnValue({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn().mockResolvedValue({
                        data: null,
                        error: { message: 'permission denied' },
                    }),
                })),
            })),
        });

        renderDashboard();

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not load decks: permission denied. Run frontend/supabase-schema.sql in your Supabase SQL Editor.',
        );
    });

    it('shows a message when loading decks rejects', async () => {
        mocks.from.mockReturnValue({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn().mockRejectedValue(new Error('network unavailable')),
                })),
            })),
        });

        renderDashboard();

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not load decks: network unavailable');
    });

    it('lets the user select a deck and updates the study preview', async () => {
        const user = userEvent.setup();
        const secondDeck = {
            ...savedDeck,
            id: 'deck-2',
            title: 'French basics',
            cards: [{ id: 0, front: 'Bonjour means?', back: 'Hello.' }],
        };
        mocks.from.mockReturnValue({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn().mockResolvedValue({ data: [savedDeck, secondDeck], error: null }),
                })),
            })),
        });

        renderDashboard();

        await user.click(within(screen.getByRole('navigation', { name: 'Dashboard navigation' })).getByRole('link', { name: /my decks/i }));
        const secondDeckButton = await screen.findByRole('button', { name: /French basics/ });
        await user.click(secondDeckButton);

        expect(secondDeckButton).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('heading', { level: 3, name: 'French basics' })).toBeInTheDocument();
        expect(screen.getByText('Bonjour means?')).toBeInTheDocument();
    });

    it('disables sign out while the sign-out action is loading', () => {
        const onSignOut = vi.fn();
        renderDashboard({ onSignOut, signOutLoading: true });

        const signOutButton = screen.getByRole('button', { name: 'Signing out…' });
        expect(signOutButton).toBeDisabled();
        expect(onSignOut).not.toHaveBeenCalled();
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
        await user.click(screen.getByRole('link', { name: /auto-generate deck/i }));
        await user.type(screen.getByLabelText('Topic'), 'French');
        await user.click(screen.getByRole('button', { name: /generate cards/i }));

        expect(await screen.findByText('Bonjour means?')).toBeInTheDocument();
        expect(mocks.generateCards).toHaveBeenCalledWith('French', 5);
        expect(mocks.insert).toHaveBeenCalledWith({ user_id: session.user.id, title: 'French', cards });
    });

    it('shows an error when card generation fails', async () => {
        const user = userEvent.setup();
        mocks.generateCards.mockRejectedValue(new Error('API unavailable'));

        renderDashboard();
        await user.click(screen.getByRole('link', { name: /auto-generate deck/i }));
        await user.type(screen.getByLabelText('Topic'), 'French');
        await user.click(screen.getByRole('button', { name: /generate cards/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent('API unavailable');
        expect(screen.getByRole('button', { name: /generate cards/i })).toBeEnabled();
    });

    it('shows an error when generated cards cannot be saved', async () => {
        const user = userEvent.setup();
        mocks.generateCards.mockResolvedValue([{ id: 0, front: 'Bonjour means?', back: 'Hello.' }]);
        mocks.insert.mockReturnValue({
            select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'database unavailable' },
                }),
            })),
        });

        renderDashboard();
        await user.click(screen.getByRole('link', { name: /auto-generate deck/i }));
        await user.type(screen.getByLabelText('Topic'), 'French');
        await user.click(screen.getByRole('button', { name: /generate cards/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not save this deck: database unavailable. Check frontend/supabase-schema.sql.',
        );
        expect(screen.getByRole('heading', { name: 'What are you learning?' })).toBeInTheDocument();
    });

    it('manually creates and saves a deck with multiple cards', async () => {
        const user = userEvent.setup();
        const cards = [
            { id: 0, front: 'What is Docker?', back: 'A container platform.' },
            { id: 1, front: 'What is an image?', back: 'A template for a container.' },
        ];
        mocks.insert.mockReturnValue({
            select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                    data: { ...savedDeck, id: 'deck-2', title: 'Docker basics', cards },
                    error: null,
                }),
            })),
        });

        renderDashboard();
        await user.click(screen.getByRole('link', { name: /create manually/i }));
        await user.type(screen.getByLabelText('Deck title'), 'Docker basics');
        await user.type(screen.getByLabelText('Question 1'), cards[0].front);
        await user.type(screen.getByLabelText('Answer 1'), cards[0].back);
        await user.click(screen.getByRole('button', { name: /add another card/i }));
        await user.type(screen.getByLabelText('Question 2'), cards[1].front);
        await user.type(screen.getByLabelText('Answer 2'), cards[1].back);
        await user.click(screen.getByRole('button', { name: 'Save deck' }));

        await screen.findByRole('heading', { level: 3, name: 'Docker basics' });
        await user.click(screen.getByRole('button', { name: 'Next' }));
        expect(await screen.findByText('What is an image?')).toBeInTheDocument();
        expect(mocks.generateCards).not.toHaveBeenCalled();
        expect(mocks.insert).toHaveBeenCalledWith({
            user_id: session.user.id,
            title: 'Docker basics',
            cards,
        });
    });
});
