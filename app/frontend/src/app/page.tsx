'use client';
import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { TrendingUp, Share2, Trophy, Clock, Twitter, Calendar, Zap, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import dynamic from 'next/dynamic';

const BetModal = dynamic(() => import('../components/BetModal'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tweetpredict-api.onrender.com';
const D3X_DECIMALS = 1_000_000;

const ORACLES = [
    { value: 'manual', label: 'Manual (Creator resolves)' },
    { value: 'switchboard', label: 'Switchboard (Decentralized)' },
    { value: 'pyth', label: 'Pyth (Price feeds)' },
    { value: 'uma', label: 'UMA (Optimistic oracle)' },
    { value: 'community', label: 'Community Vote' },
];

const TAG_OPTIONS = ['Crypto', 'DeFi', 'Sports', 'Politics', 'Memes', 'Finance', 'Gaming', 'Other'];

const CRITERIA_TEMPLATES = [
    'BTC closing price on Binance > $200,000 on Dec 31, 2026 UTC per CoinGecko API',
    'ETH price exceeds $10,000 at any point before market close, per CoinGecko',
    'Team/candidate wins based on official announcement by the resolution date',
];

interface Market {
    pubkey: string;
    question: string;
    description: string;
    endTimestamp: number;
    status: { active?: {} } | { resolved?: { outcome: boolean } } | { challenged?: {} };
    totalYes: string;
    totalNo: string;
    yesVault: string;
    noVault: string;
}

function pct(yes: string, no: string) {
    const y = parseFloat(yes) || 0;
    const n = parseFloat(no) || 0;
    const total = y + n;
    if (total === 0) return { yes: 50, no: 50 };
    return { yes: Math.round((y / total) * 100), no: Math.round((n / total) * 100) };
}

function timeLeft(ts: number) {
    const diff = ts * 1000 - Date.now();
    if (diff <= 0) return 'Closed';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
}

function statusLabel(status: Market['status']) {
    if ('resolved' in status) {
        const outcome = (status as any).resolved.outcome;
        return outcome ? { label: 'YES Won', cls: 'badge-resolved-yes' } : { label: 'NO Won', cls: 'badge-resolved-no' };
    }
    if ('challenged' in status) return { label: 'Challenged', cls: 'badge-challenged' };
    return { label: 'Active', cls: 'badge-active' };
}

export default function Home() {
    // ── Markets state ──────────────────────────────────────────────────
    const [markets, setMarkets] = useState<Market[]>([]);
    const [loading, setLoading] = useState(true);
    const [betTarget, setBetTarget] = useState<Market | null>(null);
    const { publicKey, sendTransaction } = useWallet();
    const { connection } = useConnection();

    // ── Creation form state ────────────────────────────────────────────
    const [question, setQuestion] = useState('');
    const [criteria, setCriteria] = useState('');
    const [description, setDescription] = useState('');
    const [oracle, setOracle] = useState('manual');
    const [tags, setTags] = useState<string[]>([]);
    const [endDays, setEndDays] = useState('30');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [createStatus, setCreateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [createMsg, setCreateMsg] = useState('');
    const [newMarketPubkey, setNewMarketPubkey] = useState('');
    const [newMarketQuestion, setNewMarketQuestion] = useState('');

    const fetchMarkets = useCallback(async () => {
        try {
            const r = await fetch(`${API_URL}/api/markets`);
            if (r.ok) {
                const data = await r.json();
                setMarkets(data);
            }
        } catch { /* silently ignore */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchMarkets(); }, [fetchMarkets]);

    async function handleClaim(market: Market) {
        if (!publicKey) return;
        try {
            const r = await fetch(`${API_URL}/api/action/claim?market=${market.pubkey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account: publicKey.toBase58() }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            const tx = Transaction.from(Buffer.from(data.transaction, 'base64'));
            const sig = await sendTransaction(tx, connection);
            await connection.confirmTransaction(sig, 'confirmed');
            alert(`Winnings claimed! TX: ${sig}`);
            fetchMarkets();
        } catch (e: any) { alert('Claim failed: ' + e.message); }
    }

    function shareBlink(market: Market) {
        const base = typeof window !== 'undefined' ? window.location.origin : 'https://tweetpredict.app';
        const blinkUrl = `${base}/api/action/bet?market=${market.pubkey}&question=${encodeURIComponent(market.question)}`;
        const tweetText = `🔮 Bet on: "${market.question}"\n\nUse D3X tokens — directly from Twitter! 🚀\n\n${blinkUrl}`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
    }

    async function handleCreate() {
        if (!publicKey) return setCreateMsg('Connect your wallet first');
        if (!question.trim()) return setCreateMsg('Enter a question');
        if (!criteria.trim()) return setCreateMsg('Resolution criteria is required');
        if (question.length > 280) return setCreateMsg('Question too long (max 280 chars)');
        setCreateStatus('loading');
        setCreateMsg('Building transaction…');
        // Pack oracle + tags + criteria into the description field
        const oracleLabel = ORACLES.find(o => o.value === oracle)?.label || 'Manual';
        const tagLine = tags.length > 0 ? `[${tags.join(', ')}]` : '';
        const fullDescription = `[Oracle: ${oracleLabel}]${tagLine}\n${criteria}`;
        try {
            const params = new URLSearchParams({ question, description: fullDescription, endDays }).toString();
            const resp = await fetch(`${API_URL}/api/action/create?${params}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account: publicKey.toBase58() }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'API error');
            const tx = Transaction.from(Buffer.from(data.transaction, 'base64'));
            setCreateMsg('Approve in wallet…');
            const sig = await sendTransaction(tx, connection);
            await connection.confirmTransaction(sig, 'confirmed');
            setNewMarketPubkey(data.marketPubkey || '');
            setNewMarketQuestion(question);
            setCreateStatus('success');
            setCreateMsg('');
            setQuestion('');
            setCriteria('');
            setOracle('manual');
            setTags([]);
            setEndDays('30');
            fetchMarkets();
        } catch (err: any) {
            setCreateStatus('error');
            setCreateMsg(err.message || 'Transaction failed');
        }
    }

    function handleTweetNew() {
        const base = typeof window !== 'undefined' ? window.location.origin : 'https://tweetpredict.app';
        const blinkUrl = newMarketPubkey
            ? `${base}/api/action/bet?market=${newMarketPubkey}&question=${encodeURIComponent(newMarketQuestion)}`
            : `${base}/api/action/create`;
        const text = `🔮 Bet on: "${newMarketQuestion}"\n\nUse D3X tokens — directly from Twitter! 🚀\n\n${blinkUrl}`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    }

    const activeMarkets = markets.filter(m => 'active' in m.status);
    const resolvedMarkets = markets.filter(m => 'resolved' in m.status);
    const endDate = new Date(Date.now() + parseInt(endDays || '0') * 86400000).toLocaleDateString();

    return (
        <div>
            {/* ── HERO ───────────────────────────────────────────────── */}
            <div style={{ textAlign: 'center', marginBottom: '3rem', padding: '2rem 0 1rem 0' }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                    background: 'rgba(125,211,252,0.08)', border: '1px solid rgba(125,211,252,0.2)',
                    borderRadius: '999px', padding: '0.35rem 1rem', marginBottom: '1.5rem',
                    fontSize: '0.8rem', fontWeight: 700, color: '#7dd3fc', letterSpacing: '0.06em',
                }}>
                    <span style={{ width: 7, height: 7, background: '#4ade80', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 8px #4ade80' }} />
                    LIVE ON SOLANA DEVNET
                </div>

                <h1 style={{ fontSize: 'clamp(2.8rem, 6vw, 5rem)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 1rem 0', letterSpacing: '-0.02em' }}>
                    <span style={{ background: 'linear-gradient(135deg, #7dd3fc 0%, #c4b5fd 50%, #f9a8d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Predict. Win.</span>
                    <br />
                    <span style={{ color: '#e2e8f0' }}>Repeat.</span>
                </h1>

                <p style={{ fontSize: '1.1rem', color: '#94a3b8', maxWidth: '520px', margin: '0 auto', lineHeight: 1.7, fontWeight: 500 }}>
                    Launch a market → tweet it → earn <strong style={{ color: '#7dd3fc' }}>1% of every bet</strong> from your followers in D3X.
                </p>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem', flexWrap: 'wrap' }}>
                    {[
                        { value: markets.length.toString(), label: 'Markets' },
                        { value: '2%', label: 'Protocol Fee' },
                        { value: 'D3X', label: 'Currency' },
                    ].map(s => (
                        <div key={s.label} className="stat-pill" style={{ minWidth: '110px' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 900, background: 'linear-gradient(135deg, #7dd3fc, #f9a8d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.value}</div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '0.2rem' }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── CREATE MARKET FORM ────────────────────── */}
            <div className="glass-card" style={{ padding: '2rem', marginBottom: '3rem', maxWidth: '700px', margin: '0 auto 3rem auto' }}>
                {createStatus === 'success' ? (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
                        <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#e2e8f0', marginBottom: '0.5rem' }}>Market Created!</h3>
                        <div style={{ background: 'rgba(125,211,252,0.07)', border: '1px solid rgba(125,211,252,0.15)', borderRadius: '0.875rem', padding: '0.75rem 1rem', fontSize: '0.9rem', color: '#7dd3fc', fontWeight: 600, marginBottom: '0.75rem', lineHeight: 1.5 }}>
                            "{newMarketQuestion}"
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Tweet it now — your followers can bet directly from their Twitter timeline.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                            <button onClick={handleTweetNew} className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem' }}>
                                <Twitter size={18} /> Tweet this Market to your Followers
                            </button>
                            <button onClick={() => setCreateStatus('idle')} style={{ padding: '0.75rem', borderRadius: '0.875rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>Create Another</button>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {/* LEFT COLUMN: Fields */}
                        <div>
                            <h2 style={{ fontSize: '1.15rem', fontWeight: 900, color: '#e2e8f0', marginBottom: '0.2rem' }}>🌟 Create Your Market</h2>
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>Ask your followers anything. They bet YES or NO with D3X — you earn a fee on every bet, automatically.</p>

                            {/* Question */}
                            <div style={{ marginBottom: '0.875rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#7dd3fc', marginBottom: '0.4rem' }}>
                                    💬 What are you predicting? <span style={{ color: '#475569', fontWeight: 500 }}>({question.length}/280)</span>
                                </label>
                                <textarea value={question} onChange={e => setQuestion(e.target.value)} maxLength={280} rows={2}
                                    placeholder="Will BTC hit $200k before end of 2026?"
                                    className="input-glass" style={{ resize: 'none', borderRadius: '0.75rem', fontSize: '0.9rem' }} />
                            </div>

                            {/* Resolution Criteria */}
                            <div style={{ marginBottom: '0.875rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#f9a8d4', marginBottom: '0.3rem' }}>
                                    📋 How will this resolve?
                                </label>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.4rem', lineHeight: 1.5 }}>Describe what needs to happen for YES to win. Be as clear as you like — your followers will trust you more for it.</p>
                                <textarea value={criteria} onChange={e => setCriteria(e.target.value)} rows={3}
                                    placeholder="e.g. BTC closing price above $200,000 on Dec 31, 2026, per CoinGecko"
                                    className="input-glass" style={{ resize: 'none', borderRadius: '0.75rem', fontSize: '0.85rem' }} />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>💡 Try an example:</span>
                                    {CRITERIA_TEMPLATES.map((t, i) => (
                                        <button key={i} onClick={() => setCriteria(t)} style={{
                                            fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '999px',
                                            background: 'rgba(249,168,212,0.07)', border: '1px solid rgba(249,168,212,0.15)',
                                            color: '#f9a8d4', cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
                                        }}>{['Crypto price', 'ETH price', 'Real world event'][i]}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Description */}
                            <div style={{ marginBottom: '0.875rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.3rem' }}>
                                    📝 Extra context <span style={{ color: '#475569', fontWeight: 500 }}>(optional)</span>
                                </label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={2}
                                    placeholder="Anything else your followers should know? Links, background, notes…"
                                    className="input-glass"
                                    style={{ resize: 'none', borderRadius: '0.75rem', fontSize: '0.85rem' }}
                                />
                            </div>

                            {/* Oracle source */}
                            <div style={{ marginBottom: '0.875rem' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.3rem' }}>⚖️ Who decides the winner?</label>
                                <select value={oracle} onChange={e => setOracle(e.target.value)}
                                    style={{
                                        width: '100%', padding: '0.6rem 0.875rem', borderRadius: '0.75rem',
                                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#e2e8f0', fontSize: '0.875rem', outline: 'none', cursor: 'pointer',
                                        appearance: 'none', fontFamily: 'inherit',
                                    }}>
                                    {ORACLES.map(o => (
                                        <option key={o.value} value={o.value} style={{ background: '#0f172a' }}>{o.label}</option>
                                    ))}
                                </select>
                                {oracle !== 'manual' ? (
                                    <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.35rem', lineHeight: 1.5 }}>✨ Great choice! Automatic oracle resolution is coming in v2 — for now you'll resolve it manually.</p>
                                ) : (
                                    <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem', lineHeight: 1.5 }}>You'll call the result when the event ends. Your followers trust your judgement!</p>
                                )}
                            </div>

                            {/* Duration */}
                            <div style={{ marginBottom: '0.875rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem' }}>
                                    <Calendar size={13} /> ⏳ How long should this run? <span style={{ color: '#475569', fontWeight: 500 }}>Closes {endDate}</span>
                                </label>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    {[7, 14, 30, 60, 90].map(d => (
                                        <button key={d} onClick={() => setEndDays(String(d))} style={{
                                            flex: 1, padding: '0.45rem 0', borderRadius: '0.625rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease',
                                            background: endDays === String(d) ? 'rgba(125,211,252,0.15)' : 'rgba(0,0,0,0.25)',
                                            border: `1px solid ${endDays === String(d) ? 'rgba(125,211,252,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                            color: endDays === String(d) ? '#7dd3fc' : '#64748b',
                                        }}>{d}d</button>
                                    ))}
                                </div>
                            </div>

                            {/* Advanced toggle */}
                            <button onClick={() => setShowAdvanced(v => !v)} style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none',
                                color: '#7dd3fc', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', padding: '0.25rem 0', marginBottom: showAdvanced ? '0.625rem' : '0.875rem', opacity: 0.75,
                            }}>
                                {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                ✨ More options (tags, categories)
                            </button>

                            {/* Advanced section */}
                            {showAdvanced && (
                                <div style={{ marginBottom: '0.875rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem' }}>
                                        <Tag size={13} /> 🏷 What's this market about?
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {TAG_OPTIONS.map(t => {
                                            const selected = tags.includes(t);
                                            return (
                                                <button key={t} onClick={() => setTags(prev => selected ? prev.filter(x => x !== t) : [...prev, t])} style={{
                                                    padding: '0.3rem 0.7rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s ease',
                                                    background: selected ? 'rgba(196,181,253,0.18)' : 'rgba(0,0,0,0.2)',
                                                    border: `1px solid ${selected ? 'rgba(196,181,253,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                                    color: selected ? '#c4b5fd' : '#64748b',
                                                }}>{t}</button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Status msg */}
                            {createMsg && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.75rem',
                                    color: createStatus === 'error' ? '#fca5a5' : '#94a3b8',
                                    background: createStatus === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${createStatus === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)'}`,
                                    borderRadius: '0.625rem', padding: '0.5rem 0.75rem',
                                }}>
                                    {createStatus === 'error' && <Zap size={13} />}
                                    {createMsg}
                                </div>
                            )}

                            <button id="create-market-submit" onClick={handleCreate}
                                disabled={createStatus === 'loading' || !question.trim() || !criteria.trim()}
                                className="btn-primary" style={{ width: '100%', padding: '0.875rem', fontSize: '0.95rem' }}>
                                {createStatus === 'loading' ? '⏳ Creating on Solana…' : '🚀 Create Market'}
                            </button>
                        </div>

                        {/* RIGHT COLUMN: Live Blink Preview */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem' }}>👀 See how it'll look on Twitter</label>
                            <p style={{ fontSize: '0.72rem', color: '#475569', marginBottom: '0.75rem', lineHeight: 1.5 }}>This is the Blink card your followers will see in their feed — YES and NO buttons work right inside Twitter.</p>

                            {/* Simulated tweet card */}
                            <div style={{
                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem',
                                background: 'rgba(15,23,42,0.8)', overflow: 'hidden', marginBottom: '1rem',
                            }}>
                                {/* Tweet header */}
                                <div style={{ padding: '0.875rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #7dd3fc, #f9a8d4)', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#e2e8f0' }}>@yourhandle</div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Just now</div>
                                    </div>
                                    <div style={{ marginLeft: 'auto' }}><Twitter size={16} style={{ color: '#38bdf8' }} /></div>
                                </div>
                                {/* Tweet body */}
                                <div style={{ padding: '0.875rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <p style={{ fontSize: '0.875rem', color: '#e2e8f0', margin: 0, lineHeight: 1.55 }}>
                                        🔮 Bet on: &ldquo;<span style={{ color: '#7dd3fc', fontWeight: 600 }}>{question || 'Your question will appear here…'}</span>&rdquo;
                                        <br /><span style={{ color: '#64748b', fontSize: '0.78rem' }}>Use D3X tokens — directly from Twitter! 🚀</span>
                                    </p>
                                </div>
                                {/* Blink card */}
                                <div style={{ margin: '0.75rem', border: '1px solid rgba(125,211,252,0.18)', borderRadius: '0.75rem', overflow: 'hidden' }}>
                                    <div style={{ padding: '0.875rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>TweetPredict · Solana Blink</div>
                                        <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#e2e8f0', margin: 0, lineHeight: 1.4 }}>{question || 'Your question…'}</p>
                                        {criteria && <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.3rem 0 0 0', lineHeight: 1.4 }}>{criteria.slice(0, 80)}{criteria.length > 80 ? '…' : ''}</p>}
                                    </div>
                                    <div style={{ padding: '0.625rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                        <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: 'rgba(125,211,252,0.12)', border: '1px solid rgba(125,211,252,0.3)', textAlign: 'center', fontSize: '0.8rem', fontWeight: 800, color: '#7dd3fc' }}>✅ YES</div>
                                        <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: 'rgba(249,168,212,0.12)', border: '1px solid rgba(249,168,212,0.3)', textAlign: 'center', fontSize: '0.8rem', fontWeight: 800, color: '#f9a8d4' }}>❌ NO</div>
                                    </div>
                                </div>
                            </div>

                            {/* Info pills */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.72rem' }}>
                                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(125,211,252,0.08)', border: '1px solid rgba(125,211,252,0.15)', color: '#64748b', fontWeight: 600 }}>
                                    ⛽ ~0.000005 SOL gas
                                </span>
                                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(125,211,252,0.08)', border: '1px solid rgba(125,211,252,0.15)', color: '#64748b', fontWeight: 600 }}>
                                    🏷 {tags.length > 0 ? tags.join(' · ') : 'No tags'}
                                </span>
                                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(125,211,252,0.08)', border: '1px solid rgba(125,211,252,0.15)', color: '#64748b', fontWeight: 600 }}>
                                    🔮 {ORACLES.find(o => o.value === oracle)?.label || 'Manual'}
                                </span>
                                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.18)', color: '#4ade80', fontWeight: 600 }}>
                                    📅 {endDays}d market
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── LOADING SKELETONS ──────────────────────────────────── */}
            {loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="glass-card" style={{ padding: '1.75rem' }}>
                            {[1, 2, 3, 4].map(j => (
                                <div key={j} style={{ height: j === 2 ? '1.5rem' : '0.875rem', background: 'rgba(125,211,252,0.06)', borderRadius: '0.5rem', marginBottom: '1rem', width: j === 4 ? '60%' : '100%', animation: 'pulse 2s ease-in-out infinite' }} />
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {/* ── ACTIVE MARKETS ─────────────────────────────────────── */}
            {!loading && activeMarkets.length > 0 && (
                <section style={{ marginBottom: '3rem' }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800, marginBottom: '1.25rem', color: '#7dd3fc' }}>
                        <TrendingUp size={18} /> Active Markets ({activeMarkets.length})
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {activeMarkets.map(m => {
                            const p = pct(m.totalYes, m.totalNo);
                            const sl = statusLabel(m.status);
                            const totalD3x = ((parseFloat(m.totalYes) + parseFloat(m.totalNo)) / D3X_DECIMALS).toFixed(0);
                            return (
                                <div key={m.pubkey} className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className={sl.cls}>{sl.label}</span>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                                                <Clock size={11} />{timeLeft(m.endTimestamp)}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 700, marginTop: '0.15rem' }}>{totalD3x} D3X Pool</div>
                                        </div>
                                    </div>
                                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.45, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {m.question}
                                    </h3>
                                    <div>
                                        <div style={{ height: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                            <div style={{ height: '100%', width: `${p.yes}%`, background: 'linear-gradient(90deg, #7dd3fc, #818cf8)', borderRadius: '999px', transition: 'width 0.5s ease' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 800 }}>
                                            <span style={{ color: '#7dd3fc' }}>YES {p.yes}%</span>
                                            <span style={{ color: '#f9a8d4' }}>NO {p.no}%</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.625rem', marginTop: 'auto' }}>
                                        <button onClick={() => setBetTarget({ ...m })} style={{ flex: 1, padding: '0.625rem 0', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.2s ease', background: 'rgba(125,211,252,0.08)', border: '1px solid rgba(125,211,252,0.25)', color: '#7dd3fc' }}
                                            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(125,211,252,0.18)'; }}
                                            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(125,211,252,0.08)'; }}>YES</button>
                                        <button onClick={() => setBetTarget({ ...m })} style={{ flex: 1, padding: '0.625rem 0', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.2s ease', background: 'rgba(249,168,212,0.08)', border: '1px solid rgba(249,168,212,0.25)', color: '#f9a8d4' }}
                                            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(249,168,212,0.18)'; }}
                                            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(249,168,212,0.08)'; }}>NO</button>
                                        <button onClick={() => shareBlink(m)} title="Share on Twitter" style={{ padding: '0.625rem 0.75rem', borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.2s ease', background: 'rgba(29,161,242,0.08)', border: '1px solid rgba(29,161,242,0.25)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(29,161,242,0.2)'; }}
                                            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(29,161,242,0.08)'; }}>
                                            <Share2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ── RESOLVED MARKETS ───────────────────────────────────── */}
            {!loading && resolvedMarkets.length > 0 && (
                <section style={{ marginBottom: '3rem' }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 800, marginBottom: '1.25rem', color: '#fbbf24' }}>
                        <Trophy size={18} /> Resolved Markets ({resolvedMarkets.length})
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {resolvedMarkets.map(m => {
                            const sl = statusLabel(m.status);
                            return (
                                <div key={m.pubkey} className="glass-card" style={{ padding: '1.5rem', opacity: 0.8 }}>
                                    <span className={sl.cls}>{sl.label}</span>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', margin: '1rem 0 1.25rem 0', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {m.question}
                                    </h3>
                                    {publicKey && (
                                        <button onClick={() => handleClaim(m)} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.25s ease', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24', fontSize: '0.9rem' }}
                                            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(251,191,36,0.25)'; }}
                                            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(251,191,36,0.1)'; }}>
                                            🏆 Claim Winnings
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ── BET MODAL ──────────────────────────────────────────── */}
            {betTarget && (
                <BetModal market={betTarget} onClose={() => setBetTarget(null)} onSuccess={fetchMarkets} />
            )}
        </div>
    );
}
