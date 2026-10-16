import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CardDeck from '../src/components/CardDeck.jsx';

const cards = [
  { id: 1, front: 'What is a container?', back: 'An isolated process with its own filesystem.' },
  { id: 2, front: 'What is an image?', back: 'A read-only template for containers.' },
];

describe('CardDeck', () => {
  it('shows the question first, then flips to the answer and back', async () => {
    const user = userEvent.setup();
    render(<CardDeck cards={cards} />);
    const card = screen.getByTestId('flashcard');

    expect(screen.getByText(cards[0].front)).toBeInTheDocument();
    expect(screen.queryByText(cards[0].back)).not.toBeInTheDocument();

    await user.click(card);
    expect(screen.getByText(cards[0].back)).toBeInTheDocument();
    expect(screen.queryByText(cards[0].front)).not.toBeInTheDocument();

    await user.click(card);
    expect(screen.getByText(cards[0].front)).toBeInTheDocument();
  });

  it('navigates with Previous/Next and resets to the question side', async () => {
    const user = userEvent.setup();
    render(<CardDeck cards={cards} />);
    const prev = screen.getByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });

    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
    expect(prev).toBeDisabled();

    await user.click(screen.getByTestId('flashcard')); // flip card 1
    await user.click(next);
    expect(screen.getByText('Card 2 of 2')).toBeInTheDocument();
    expect(screen.getByText(cards[1].front)).toBeInTheDocument();
    expect(next).toBeDisabled();

    await user.click(prev);
    expect(screen.getByText(cards[0].front)).toBeInTheDocument();
  });

  it('shows an empty state when there are no cards', () => {
    render(<CardDeck cards={[]} />);
    expect(screen.getByText(/no cards yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('flashcard')).not.toBeInTheDocument();
  });

  it('renders an error message as an alert instead of the deck', () => {
    render(<CardDeck cards={cards} error="Card generation failed (HTTP 500)." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Card generation failed (HTTP 500).');
    expect(screen.queryByTestId('flashcard')).not.toBeInTheDocument();
  });

  it('shows a loading status while generating', () => {
    render(<CardDeck loading />);
    expect(screen.getByRole('status')).toHaveTextContent(/generating/i);
  });
});
