import { useEffect, useState } from 'react';
import CardDeck from './CardDeck.jsx';
import GeneratorForm from './GeneratorForm.jsx';
import { generateCards } from '../api.js';
import { supabase } from '../supabase.js';

function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        .format(new Date(value));
}

const DASHBOARD_PAGES = ['decks', 'create-manual', 'generate'];

function getDashboardPage() {
    const page = window.location.hash.slice(1);
    return DASHBOARD_PAGES.includes(page) ? page : 'decks';
}

export default function Dashboard({ session, onSignOut, signOutLoading }) {
    const [page, setPage] = useState(getDashboardPage);
    const [showCreateMenu, setShowCreateMenu] = useState(false);
    const [decks, setDecks] = useState([]);
    const [selectedDeckId, setSelectedDeckId] = useState(null);
    const [loadingDecks, setLoadingDecks] = useState(true);
    const [creatingDeck, setCreatingDeck] = useState(false);
    const [manualTitle, setManualTitle] = useState('');
    const [manualCards, setManualCards] = useState([{ id: 0, front: '', back: '' }]);
    const [nextManualCardId, setNextManualCardId] = useState(1);
    const [error, setError] = useState('');
    const selectedDeck = decks.find((deck) => deck.id === selectedDeckId);
    const displayName = session.user.user_metadata?.full_name || session.user.email;
    const avatar = (displayName || 'R').trim().charAt(0).toUpperCase();

    useEffect(() => {
        if (!DASHBOARD_PAGES.includes(window.location.hash.slice(1))) {
            window.history.replaceState(
                window.history.state,
                '',
                `${window.location.pathname}${window.location.search}#decks`,
            );
        }

        function handleHashChange() {
            const nextPage = getDashboardPage();
            setPage((currentPage) => currentPage === nextPage ? currentPage : nextPage);
        }

        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    function navigateTo(nextPage) {
        setShowCreateMenu(false);
        if (window.location.hash !== `#${nextPage}`) {
            window.location.hash = `#${nextPage}`;
        }
        setPage(nextPage);
    }

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

    async function saveDeck(title, cards, source = null) {
        const { data, error: saveError } = await supabase
            .from('decks')
            .insert({ user_id: session.user.id, title, cards })
            .select('id, title, cards, created_at')
            .single();

        if (saveError) {
            throw new Error(`Could not save this deck: ${saveError.message}. Check frontend/supabase-schema.sql.`);
        }

        setDecks((currentDecks) => [{ ...data, source }, ...currentDecks]);
        setSelectedDeckId(data.id);
        setManualTitle('');
        setManualCards([{ id: 0, front: '', back: '' }]);
        setNextManualCardId(1);
        navigateTo('decks');
    }

    async function handleCreateDeck(topic, count) {
        setCreatingDeck(true);
        setError('');
        try {
            const { cards, source } = await generateCards(topic, count);
            await saveDeck(topic, cards, source);
        } catch (createError) {
            setError(createError.message || 'Could not create this deck. Please try again.');
        } finally {
            setCreatingDeck(false);
        }
    }

    async function handleManualDeckSubmit(event) {
        event.preventDefault();
        setCreatingDeck(true);
        setError('');
        try {
            const cards = manualCards.map(({ front, back }, index) => ({
                id: index,
                front: front.trim(),
                back: back.trim(),
            }));
            await saveDeck(manualTitle.trim(), cards);
        } catch (createError) {
            setError(createError.message || 'Could not save this deck. Please try again.');
        } finally {
            setCreatingDeck(false);
        }
    }

    const pageDetails = {
        decks: ['YOUR COLLECTION', 'My decks', 'Browse and study your saved decks.'],
        'create-manual': ['BUILD YOUR OWN', 'Create a deck manually', 'Write your own questions and answers.'],
        generate: ['A FRESH START', 'Auto-generate a deck', 'Choose a topic and let Recall make the cards.'],
    }[page];

    return (
        <div className="dashboard-shell">
            <aside className="dashboard-sidebar">
                <a className="wordmark dashboard-wordmark" href="#decks" aria-label="Recall dashboard" onClick={(event) => { event.preventDefault(); navigateTo('decks'); }}>
                    <span className="wordmark-icon" aria-hidden="true">r</span>
                    <span>recall</span>
                </a>
                <p className="sidebar-label">YOUR SPACE</p>
                <nav className="dashboard-nav" aria-label="Dashboard navigation">
                    <a className={`dashboard-nav-link${page === 'decks' ? ' is-active' : ''}`} href="#decks" aria-current={page === 'decks' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigateTo('decks'); }}><span aria-hidden="true">▤</span>My decks</a>
                    <a className={`dashboard-nav-link${page === 'create-manual' ? ' is-active' : ''}`} href="#create-manual" aria-current={page === 'create-manual' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigateTo('create-manual'); }}><span aria-hidden="true">✎</span>Create manually</a>
                    <a className={`dashboard-nav-link${page === 'generate' ? ' is-active' : ''}`} href="#generate" aria-current={page === 'generate' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigateTo('generate'); }}><span aria-hidden="true">✳</span>Auto-generate deck</a>
                </nav>
                <div className="sidebar-account">
                    <span className="account-avatar" aria-hidden="true">{avatar}</span>
                    <span className="sidebar-email" title={session.user.email}>{session.user.email}</span>
                    <button className="sidebar-signout" type="button" onClick={onSignOut} disabled={signOutLoading}>
                        {signOutLoading ? 'Signing out…' : 'Sign out'}
                    </button>
                </div>
            </aside>

            <main className="dashboard-main" id={page}>
                <header className="dashboard-header">
                    <div>
                        <p className="eyebrow"><span className="eyebrow-dot" /> {pageDetails[0]}</p>
                        <h1>{pageDetails[1]}</h1>
                        <p className="dashboard-subtitle">{pageDetails[2]}</p>
                    </div>
                    {page === 'decks' && (
                        <div className="dashboard-create-menu">
                            <button
                                className="dashboard-create-button"
                                type="button"
                                aria-expanded={showCreateMenu}
                                aria-haspopup="menu"
                                onClick={() => setShowCreateMenu((isOpen) => !isOpen)}
                            >
                                <span aria-hidden="true">＋</span> New deck
                            </button>
                            {showCreateMenu && (
                                <div
                                    className="dashboard-create-menu-items"
                                    role="menu"
                                    aria-label="Create a deck"
                                    onKeyDown={(event) => { if (event.key === 'Escape') setShowCreateMenu(false); }}
                                >
                                    <a href="#create-manual" role="menuitem" onClick={(event) => { event.preventDefault(); navigateTo('create-manual'); }}>Create manually</a>
                                    <a href="#generate" role="menuitem" onClick={(event) => { event.preventDefault(); navigateTo('generate'); }}>Auto-generate</a>
                                </div>
                            )}
                        </div>
                    )}
                </header>

                {page === 'generate' && (
                    <section className="dashboard-generator" id="create-deck" aria-labelledby="create-deck-title">
                        <div className="dashboard-generator-heading">
                            <div>
                                <p className="eyebrow">A FRESH START</p>
                                <h2 id="create-deck-title">What are you learning?</h2>
                            </div>
                            <a className="generator-dismiss" href="#decks" aria-label="Close create deck form" onClick={(event) => { event.preventDefault(); navigateTo('decks'); }}>×</a>
                        </div>
                        <GeneratorForm onGenerate={handleCreateDeck} loading={creatingDeck} />
                    </section>
                )}

                {page === 'create-manual' && (
                    <section className="dashboard-generator" id="create-deck" aria-labelledby="create-deck-title">
                        <div className="dashboard-generator-heading">
                            <div>
                                <p className="eyebrow">BUILD YOUR OWN</p>
                                <h2 id="create-deck-title">Write your cards</h2>
                            </div>
                            <a className="generator-dismiss" href="#decks" aria-label="Close create deck form" onClick={(event) => { event.preventDefault(); navigateTo('decks'); }}>×</a>
                        </div>
                        <form className="manual-deck-form" onSubmit={handleManualDeckSubmit}>
                            <label htmlFor="manual-deck-title">Deck title</label>
                            <input
                                id="manual-deck-title"
                                value={manualTitle}
                                onChange={(event) => setManualTitle(event.target.value)}
                                placeholder="e.g. Biology revision"
                                required
                            />
                            {manualCards.map((card, index) => (
                                <fieldset className="manual-card-fields" key={card.id}>
                                    <legend>Card {index + 1}</legend>
                                    <label htmlFor={`manual-front-${card.id}`}>Question {index + 1}</label>
                                    <textarea
                                        id={`manual-front-${card.id}`}
                                        value={card.front}
                                        onChange={(event) => setManualCards((cards) => cards.map((item) => item.id === card.id ? { ...item, front: event.target.value } : item))}
                                        required
                                    />
                                    <label htmlFor={`manual-back-${card.id}`}>Answer {index + 1}</label>
                                    <textarea
                                        id={`manual-back-${card.id}`}
                                        value={card.back}
                                        onChange={(event) => setManualCards((cards) => cards.map((item) => item.id === card.id ? { ...item, back: event.target.value } : item))}
                                        required
                                    />
                                    {manualCards.length > 1 && (
                                        <button
                                            className="manual-card-remove"
                                            type="button"
                                            onClick={() => setManualCards((cards) => cards.filter((item) => item.id !== card.id))}
                                        >
                                            Remove card
                                        </button>
                                    )}
                                </fieldset>
                            ))}
                            <button
                                className="manual-card-add"
                                type="button"
                                onClick={() => {
                                    setManualCards((cards) => [...cards, { id: nextManualCardId, front: '', back: '' }]);
                                    setNextManualCardId((id) => id + 1);
                                }}
                            >
                                + Add another card
                            </button>
                            <button className="manual-deck-save" type="submit" disabled={creatingDeck}>
                                {creatingDeck ? 'Saving…' : 'Save deck'}
                            </button>
                        </form>
                    </section>
                )}

                {error && <p className="dashboard-error" role="alert">{error}</p>}

                {page === 'decks' && <section className="deck-library" id="deck-library" aria-labelledby="deck-library-title">
                    <div className="library-heading">
                        <div>
                            <p className="eyebrow">YOUR COLLECTION</p>
                            <h2 id="deck-library-title">My decks <span>{decks.length}</span></h2>
                        </div>
                        <a className="library-create-link" href="#generate" onClick={(event) => { event.preventDefault(); navigateTo('generate'); }}>Auto-generate a deck <span aria-hidden="true">↗</span></a>
                    </div>

                    {loadingDecks ? (
                        <p className="dashboard-status" role="status">Loading your decks…</p>
                    ) : decks.length === 0 ? (
                        <div className="empty-library">
                            <span className="empty-mark" aria-hidden="true">✳</span>
                            <h3>Your first deck is waiting.</h3>
                            <p>Choose a topic and Recall will turn it into a set of cards you can study anytime.</p>
                            <a className="dashboard-create-button" href="#generate" onClick={(event) => { event.preventDefault(); navigateTo('generate'); }}>Auto-generate your first deck</a>
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
                                        <CardDeck key={selectedDeck.id} cards={selectedDeck.cards} source={selectedDeck.source} />
                                    </>
                                ) : <p className="dashboard-status">Select a deck to start studying.</p>}
                            </aside>
                        </div>
                    )}
                </section>}
            </main>
        </div>
    );
}