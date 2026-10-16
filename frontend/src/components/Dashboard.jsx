import { useEffect, useState } from 'react';
import CardDeck from './CardDeck.jsx';
import GeneratorForm from './GeneratorForm.jsx';
import { generateCards } from '../api.js';
import { supabase } from '../supabase.js';

function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        .format(new Date(value));
}

export default function Dashboard({ session, onSignOut, signOutLoading }) {
    const [decks, setDecks] = useState([]);
    const [selectedDeckId, setSelectedDeckId] = useState(null);
    const [loadingDecks, setLoadingDecks] = useState(true);
    const [creatingDeck, setCreatingDeck] = useState(false);
    const [showGenerator, setShowGenerator] = useState(false);
    const [error, setError] = useState('');
    const selectedDeck = decks.find((deck) => deck.id === selectedDeckId);
    const displayName = session.user.user_metadata?.full_name || session.user.email;
    const avatar = (displayName || 'R').trim().charAt(0).toUpperCase();

    useEffect(() => {
        let active = true;

        async function loadDecks() {
            setLoadingDecks(true);
            setError('');
            const { data, error: loadError } = await supabase
                .from('decks')
                .select('id, title, cards, created_at')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            if (!active) return;
            if (loadError) {
                setError(`Could not load decks: ${loadError.message}. Run frontend/supabase-schema.sql in your Supabase SQL Editor.`);
                setLoadingDecks(false);
                return;
            }

            setDecks(data || []);
            setSelectedDeckId((currentId) => currentId || data?.[0]?.id || null);
            setLoadingDecks(false);
        }

        loadDecks().catch((loadError) => {
            if (!active) return;
            setError(`Could not load decks: ${loadError.message}`);
            setLoadingDecks(false);
        });

        return () => { active = false; };
    }, [session.user.id]);

    async function handleCreateDeck(topic, count) {
        setCreatingDeck(true);
        setError('');
        try {
            const cards = await generateCards(topic, count);
            const { data, error: saveError } = await supabase
                .from('decks')
                .insert({ user_id: session.user.id, title: topic, cards })
                .select('id, title, cards, created_at')
                .single();

            if (saveError) {
                throw new Error(`Cards were generated but could not be saved: ${saveError.message}. Check frontend/supabase-schema.sql.`);
            }

            setDecks((currentDecks) => [data, ...currentDecks]);
            setSelectedDeckId(data.id);
            setShowGenerator(false);
        } catch (createError) {
            setError(createError.message || 'Could not create this deck. Please try again.');
        } finally {
            setCreatingDeck(false);
        }
    }

    function showCreateForm() {
        setShowGenerator(true);
        setError('');
        document.getElementById('create-deck')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return (
        <div className="dashboard-shell">
            <aside className="dashboard-sidebar">
                <a className="wordmark dashboard-wordmark" href="#overview" aria-label="Recall dashboard">
                    <span className="wordmark-icon" aria-hidden="true">r</span>
                    <span>recall</span>
                </a>
                <p className="sidebar-label">YOUR SPACE</p>
                <nav className="dashboard-nav" aria-label="Dashboard navigation">
                    <a className="dashboard-nav-link is-active" href="#overview"><span aria-hidden="true">⌂</span>Overview</a>
                    <a className="dashboard-nav-link" href="#deck-library"><span aria-hidden="true">▤</span>My decks</a>
                    <button className="dashboard-nav-link" type="button" onClick={showCreateForm}><span aria-hidden="true">＋</span>Create a deck</button>
                </nav>
                <div className="sidebar-account">
                    <span className="account-avatar" aria-hidden="true">{avatar}</span>
                    <span className="sidebar-email" title={session.user.email}>{session.user.email}</span>
                    <button className="sidebar-signout" type="button" onClick={onSignOut} disabled={signOutLoading}>
                        {signOutLoading ? 'Signing out…' : 'Sign out'}
                    </button>
                </div>
            </aside>

            <main className="dashboard-main" id="overview">
                <header className="dashboard-header">
                    <div>
                        <p className="eyebrow"><span className="eyebrow-dot" /> YOUR LEARNING LIBRARY</p>
                        <h1>Good to see you, {displayName.split('@')[0]}.</h1>
                        <p className="dashboard-subtitle">Pick up where you left off, or make a new deck.</p>
                    </div>
                    <button className="dashboard-create-button" type="button" onClick={showCreateForm}><span aria-hidden="true">＋</span> New deck</button>
                </header>

                {showGenerator && (
                    <section className="dashboard-generator" id="create-deck" aria-labelledby="create-deck-title">
                        <div className="dashboard-generator-heading">
                            <div>
                                <p className="eyebrow">A FRESH START</p>
                                <h2 id="create-deck-title">What are you learning?</h2>
                            </div>
                            <button className="generator-dismiss" type="button" onClick={() => setShowGenerator(false)} aria-label="Close create deck form">×</button>
                        </div>
                        <GeneratorForm onGenerate={handleCreateDeck} loading={creatingDeck} />
                    </section>
                )}

                {error && <p className="dashboard-error" role="alert">{error}</p>}

                <section className="deck-library" id="deck-library" aria-labelledby="deck-library-title">
                    <div className="library-heading">
                        <div>
                            <p className="eyebrow">YOUR COLLECTION</p>
                            <h2 id="deck-library-title">My decks <span>{decks.length}</span></h2>
                        </div>
                        <button className="library-create-link" type="button" onClick={showCreateForm}>Create deck <span aria-hidden="true">↗</span></button>
                    </div>

                    {loadingDecks ? (
                        <p className="dashboard-status" role="status">Loading your decks…</p>
                    ) : decks.length === 0 ? (
                        <div className="empty-library">
                            <span className="empty-mark" aria-hidden="true">✳</span>
                            <h3>Your first deck is waiting.</h3>
                            <p>Choose a topic and Recall will turn it into a set of cards you can study anytime.</p>
                            <button className="dashboard-create-button" type="button" onClick={showCreateForm}>Create your first deck</button>
                        </div>
                    ) : (
                        <div className="dashboard-content">
                            <div className="deck-grid">
                                {decks.map((deck, index) => (
                                    <button
                                        className={`deck-tile${deck.id === selectedDeckId ? ' is-selected' : ''}`}
                                        key={deck.id}
                                        type="button"
                                        onClick={() => setSelectedDeckId(deck.id)}
                                        aria-pressed={deck.id === selectedDeckId}
                                    >
                                        <span className={`deck-tile-accent accent-${index % 4}`} aria-hidden="true"><span /><span /><span /></span>
                                        <span className="deck-tile-title">{deck.title}</span>
                                        <span className="deck-tile-meta">{deck.cards.length} cards <i /> {formatDate(deck.created_at)}</span>
                                        <span className="deck-tile-open" aria-hidden="true">↗</span>
                                    </button>
                                ))}
                            </div>
                            <aside className="deck-study-panel" aria-label="Selected deck preview">
                                {selectedDeck ? (
                                    <>
                                        <div className="study-heading">
                                            <div>
                                                <p className="eyebrow">READY WHEN YOU ARE</p>
                                                <h3>{selectedDeck.title}</h3>
                                            </div>
                                            <span className="study-count">{selectedDeck.cards.length} cards</span>
                                        </div>
                                        <CardDeck key={selectedDeck.id} cards={selectedDeck.cards} />
                                    </>
                                ) : <p className="dashboard-status">Select a deck to start studying.</p>}
                            </aside>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}