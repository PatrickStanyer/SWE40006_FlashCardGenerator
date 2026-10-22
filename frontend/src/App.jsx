import { useEffect, useState } from 'react';
import GeneratorForm from './components/GeneratorForm.jsx';
import CardDeck from './components/CardDeck.jsx';
import Dashboard from './components/Dashboard.jsx';
import { generateCards } from './api.js';
import { supabase } from './supabase.js';

export default function App() {
  const [cards, setCards] = useState([]);
  const [source, setSource] = useState(null);
  const [deckId, setDeckId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [accountMode, setAccountMode] = useState(null);
  const [accountMessage, setAccountMessage] = useState('');
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!sessionError) setSession(data.session);
    }).catch(() => { });

    return () => subscription.unsubscribe();
  }, []);

  async function handleGenerate(topic, count) {
    setLoading(true);
    setError(null);
    try {
      const result = await generateCards(topic, count);
      setCards(result.cards);
      setSource(result.source);
      setDeckId((id) => id + 1); // remount the deck so it starts at card 1
    } catch (err) {
      setCards([]);
      setSource(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openAccount(mode) {
    setAccountMode(mode);
    setAccountMessage('');
  }

  async function handleAccountSubmit(event) {
    event.preventDefault();
    if (!supabase) return;

    setAuthLoading(true);
    setAccountMessage('');
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '');
    const password = String(formData.get('password') || '');

    try {
      if (accountMode === 'signup') {
        const name = String(formData.get('name') || '');
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });
        if (authError) throw authError;
        if (data.session) {
          setAccountMode(null);
        } else {
          setAccountMessage('Account created. Check your email to confirm your address before signing in.');
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        setAccountMode(null);
      }
    } catch (authError) {
      setAccountMessage(authError.message || 'Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) return;
    setAuthLoading(true);
    const { error: authError } = await supabase.auth.signOut();
    setAuthLoading(false);
    if (authError) {
      setAccountMode('signin');
      setAccountMessage(authError.message);
    }
  }

  if (session) {
    return <Dashboard session={session} onSignOut={handleSignOut} signOutLoading={authLoading} />;
  }

  return (
    <main className="app">
      <nav className="site-nav" aria-label="Main navigation">
        <a className="wordmark" href="#home" aria-label="Recall home">
          <span className="wordmark-icon" aria-hidden="true">r</span>
          <span>recall</span>
        </a>
        <div className="nav-actions">
          {session ? (
            <>
              <span className="nav-user">{session.user.email}</span>
              <button className="nav-signin" type="button" onClick={handleSignOut} disabled={authLoading}>Sign out</button>
            </>
          ) : (
            <>
              <button className="nav-signin" type="button" onClick={() => openAccount('signin')}>Sign in</button>
              <button className="nav-signup" type="button" onClick={() => openAccount('signup')}>Sign up</button>
            </>
          )}
        </div>
      </nav>

      <section className="hero" id="home">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> A better way to remember</p>
          <h1>Make the hard stuff <em>stick.</em></h1>
          <p className="hero-description">Turn any topic into a focused flashcard deck. Learn a little today, remember it tomorrow.</p>
          <a className="hero-link" href="#create">Create your first deck <span aria-hidden="true">↘</span></a>
          <p className="hero-note">No setup. Just your next good study session.</p>
        </div>
        <div className="hero-art" aria-label="Preview of a flashcard deck">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="preview-card preview-back" aria-hidden="true"><span>02 / 05</span><i /></div>
          <div className="preview-card preview-front">
            <span className="preview-label">QUICK STUDY · BIOLOGY</span>
            <p>What is the powerhouse of the cell?</p>
            <span className="preview-answer">Tap to reveal answer <b aria-hidden="true">↗</b></span>
          </div>
          <span className="art-spark" aria-hidden="true">✳</span>
          <span className="art-caption">Small cards.<br />Big breakthroughs.</span>
        </div>
      </section>

      <section className="create-section" id="create">
        <div className="section-heading">
          <div>
            <p className="eyebrow">START LEARNING</p>
            <h2>Your next deck starts here.</h2>
          </div>
          <span className="section-index">01 <i /> 02</span>
        </div>
        <div className="create-grid">
          <div className="create-intro">
            <span className="step-number">01</span>
            <h3>Pick a topic.<br />We’ll make the cards.</h3>
            <p>From class notes to curious questions, turn what you want to learn into a deck you can actually use.</p>
          </div>
          <div className="generator-panel">
            <GeneratorForm onGenerate={handleGenerate} loading={loading} />
            <CardDeck key={deckId} cards={cards} source={source} error={error} loading={loading} />
          </div>
        </div>
      </section>
      <footer className="site-footer"><span>recall</span><span>Learn it once. Know it longer.</span></footer>

      {accountMode && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountMode(null); }}>
          <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
            <button className="dialog-close" type="button" aria-label="Close" onClick={() => setAccountMode(null)}>×</button>
            <p className="eyebrow">WELCOME TO RECALL</p>
            <h2 id="account-title">{accountMode === 'signin' ? 'Good to see you.' : 'Start remembering.'}</h2>
            <p className="dialog-description">{accountMode === 'signin' ? 'Sign in to pick up where you left off.' : 'Create an account and keep your decks close.'}</p>
            {!supabase && <p className="account-config-note" role="alert">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the repository-root .env.local, then restart the dev server.</p>}
            <form className="account-form" onSubmit={handleAccountSubmit}>
              {accountMode === 'signup' && <label htmlFor="account-name">Name<input id="account-name" name="name" autoComplete="name" required /></label>}
              <label htmlFor="account-email">Email<input id="account-email" name="email" type="email" autoComplete="email" required /></label>
              <label htmlFor="account-password">Password<input id="account-password" name="password" type="password" autoComplete={accountMode === 'signin' ? 'current-password' : 'new-password'} required /></label>
              <button className="account-submit" type="submit" disabled={!supabase || authLoading}>{authLoading ? 'Please wait...' : accountMode === 'signin' ? 'Sign in' : 'Create account'}</button>
              {accountMessage && <p className="account-message" role="alert">{accountMessage}</p>}
            </form>
            <p className="account-switch">{accountMode === 'signin' ? 'New to Recall?' : 'Already have an account?'}{' '}
              <button type="button" onClick={() => openAccount(accountMode === 'signin' ? 'signup' : 'signin')}>{accountMode === 'signin' ? 'Sign up' : 'Sign in'}</button>
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
