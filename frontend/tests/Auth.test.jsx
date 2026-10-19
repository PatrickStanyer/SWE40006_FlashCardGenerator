import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  authCallback: null,
}));

vi.mock('../src/supabase.js', () => ({
  supabase: {
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  },
}));

// Dashboard has its own suite; here it is only a marker for "signed in".
vi.mock('../src/components/Dashboard.jsx', () => ({
  default: ({ session, onSignOut }) => (
    <div>
      <p>Dashboard for {session.user.email}</p>
      <button type="button" onClick={onSignOut}>Sign out</button>
    </div>
  ),
}));

const session = { user: { id: 'u1', email: 'study@example.com' } };

async function openDialog(user, name) {
  render(<App />);
  await user.click(screen.getByRole('button', { name }));
}

const dialogButton = (name) => within(screen.getByRole('dialog')).getByRole('button', { name });

async function fillCredentials(user) {
  await user.type(screen.getByLabelText('Email'), 'study@example.com');
  await user.type(screen.getByLabelText('Password'), 'hunter2hunter2');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.onAuthStateChange.mockImplementation((cb) => {
    mocks.authCallback = cb;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe('App authentication', () => {
  it('signs in with email and password and closes the dialog', async () => {
    const user = userEvent.setup();
    await openDialog(user, 'Sign in');
    await fillCredentials(user);
    await user.click(dialogButton('Sign in'));

    await waitFor(() => expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'study@example.com',
      password: 'hunter2hunter2',
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the auth error message when sign in fails', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') });
    const user = userEvent.setup();
    await openDialog(user, 'Sign in');
    await fillCredentials(user);
    await user.click(dialogButton('Sign in'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('asks the user to confirm their email after sign up without a session', async () => {
    const user = userEvent.setup();
    await openDialog(user, 'Sign up');
    await user.type(screen.getByLabelText('Name'), 'Ada');
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/check your email/i);
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'study@example.com',
      options: { data: { full_name: 'Ada' } },
    }));
  });

  it('closes the dialog after sign up when a session is returned immediately', async () => {
    mocks.signUp.mockResolvedValue({ data: { session }, error: null });
    const user = userEvent.setup();
    await openDialog(user, 'Sign up');
    await user.type(screen.getByLabelText('Name'), 'Ada');
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('switches between sign in and sign up, and closes via the close button', async () => {
    const user = userEvent.setup();
    await openDialog(user, 'Sign in');
    expect(screen.getByRole('heading', { name: /good to see you/i })).toBeInTheDocument();

    await user.click(dialogButton('Sign up'));
    expect(screen.getByRole('heading', { name: /start remembering/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the Dashboard once Supabase reports a session, then signs out', async () => {
    const user = userEvent.setup();
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    render(<App />);

    expect(await screen.findByText('Dashboard for study@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('reopens the sign-in dialog with a message if sign out fails', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('Network down') });
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    // Auth listener fires with no session -> landing page with the error dialog.
    mocks.authCallback('SIGNED_OUT', null);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
  });

  it('unsubscribes from auth changes on unmount', () => {
    const { unmount } = render(<App />);
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });
});
