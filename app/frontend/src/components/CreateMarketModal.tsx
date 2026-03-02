'use client';
import { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { X, Calendar, AlertCircle, Twitter } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreateMarketModal({ onClose, onSuccess }: Props) {
    const { publicKey, sendTransaction } = useWallet();
    const { connection } = useConnection();
    const [question, setQuestion] = useState('');
    const [description, setDescription] = useState('');
    const [endDays, setEndDays] = useState('30');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [marketPubkey, setMarketPubkey] = useState('');

    async function handleCreate() {
        if (!publicKey) return setMessage('Connect your wallet first');
        if (!question.trim()) return setMessage('Enter a question');
        if (question.length > 280) return setMessage('Question too long (max 280 chars)');

        setStatus('loading');
        setMessage('Building transaction…');
        try {
            const params = new URLSearchParams({ question, description, endDays }).toString();
            const resp = await fetch(`${API_URL}/api/action/create?${params}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account: publicKey.toBase58() }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'API error');

            const tx = Transaction.from(Buffer.from(data.transaction, 'base64'));
            setMessage('Please approve in wallet…');
            const sig = await sendTransaction(tx, connection);
            await connection.confirmTransaction(sig, 'confirmed');

            if (data.marketPubkey) setMarketPubkey(data.marketPubkey);
            setStatus('success');
            setMessage('');
            onSuccess();
        } catch (err: any) {
            setStatus('error');
            setMessage(err.message || 'Transaction failed');
        }
    }

    function handleTweet() {
        const base = typeof window !== 'undefined' ? window.location.origin : 'https://tweetpredict.app';
        const blinkUrl = marketPubkey
            ? `${base}/api/action/bet?market=${marketPubkey}&question=${encodeURIComponent(question)}`
            : `${base}/api/action/create`;
        const tweetText = `🔮 Bet on: "${question}"\n\nUse D3X tokens — directly from Twitter! 🚀\n\n${blinkUrl}`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
    }

    const endDate = new Date(Date.now() + parseInt(endDays || '0') * 86400000).toLocaleDateString();

    /* ── SUCCESS SCREEN ─────────────────────────────────────────────── */
    if (status === 'success') {
        return (
            <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                <div className="glass-card" style={{ width: '100%', maxWidth: '480px', padding: '2.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎉</div>

                    <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#e2e8f0', marginBottom: '0.5rem' }}>Market Created!</h2>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: 1.6 }}>
                        Your prediction market is live on Solana.
                    </p>
                    <div style={{
                        background: 'rgba(125,211,252,0.07)', border: '1px solid rgba(125,211,252,0.15)',
                        borderRadius: '0.875rem', padding: '0.875rem 1.25rem',
                        fontSize: '0.9rem', color: '#7dd3fc', fontWeight: 600, marginBottom: '2rem', lineHeight: 1.5,
                    }}>
                        "{question}"
                    </div>

                    <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
                        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.875rem' }}>
                            Next: Share it to earn D3X fees
                        </p>
                        {[
                            'Tweet your market — followers see it in their feed',
                            'They bet YES or NO directly from Twitter using D3X',
                            'You earn 1% of every bet, sent to your wallet instantly',
                        ].map((text, i) => (
                            <div key={i} style={{ display: 'flex', gap: '0.875rem', marginBottom: '0.625rem', alignItems: 'flex-start' }}>
                                <span style={{
                                    width: '1.5rem', height: '1.5rem', borderRadius: '50%', flexShrink: 0,
                                    background: 'linear-gradient(135deg, rgba(125,211,252,0.2), rgba(249,168,212,0.2))',
                                    border: '1px solid rgba(125,211,252,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.7rem', fontWeight: 800, color: '#7dd3fc',
                                }}>{i + 1}</span>
                                <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>{text}</p>
                            </div>
                        ))}
                    </div>

                    <button onClick={handleTweet} className="btn-primary" style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '0.625rem', padding: '1rem', fontSize: '1.05rem', marginBottom: '0.75rem',
                    }}>
                        <Twitter size={20} /> Tweet this Market to your Followers
                    </button>
                    <button onClick={onClose} style={{
                        width: '100%', padding: '0.75rem', borderRadius: '0.875rem',
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                        color: '#64748b', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                    }}>
                        Done
                    </button>
                </div>
            </div>
        );
    }

    /* ── CREATE FORM ────────────────────────────────────────────────── */
    return (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
            <div className="glass-card" style={{ width: '100%', maxWidth: '520px', padding: '2.5rem', position: 'relative' }} onClick={e => e.stopPropagation()}>

                <button onClick={onClose} style={{
                    position: 'absolute', top: '1.25rem', right: '1.25rem',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.6rem', padding: '0.5rem', cursor: 'pointer',
                    color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <X size={18} />
                </button>

                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.35rem', color: '#e2e8f0' }}>
                    Launch a Prediction Market
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '2rem' }}>
                    Create it → tweet it → earn 1% of every bet from your followers.
                </p>

                {/* Question */}
                <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#7dd3fc', marginBottom: '0.5rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        Question <span style={{ color: '#475569', textTransform: 'none', letterSpacing: 0 }}>({question.length}/280)</span>
                    </label>
                    <textarea value={question} onChange={e => setQuestion(e.target.value)} maxLength={280} rows={2}
                        placeholder="Will BTC hit $200k before the end of 2026?"
                        className="input-glass" style={{ resize: 'none', borderRadius: '0.875rem' }} />
                </div>

                {/* Description */}
                <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        Description <span style={{ color: '#475569', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                    </label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                        placeholder="Add context or resolution criteria…"
                        className="input-glass" style={{ resize: 'none', borderRadius: '0.875rem' }} />
                </div>

                {/* Duration */}
                <div style={{ marginBottom: '1.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        <Calendar size={13} /> Duration — closes {endDate}
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {[7, 14, 30, 60, 90].map(d => (
                            <button key={d} onClick={() => setEndDays(String(d))} style={{
                                flex: 1, padding: '0.625rem 0', borderRadius: '0.75rem',
                                fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease',
                                background: endDays === String(d) ? 'rgba(125,211,252,0.15)' : 'rgba(0,0,0,0.25)',
                                border: `1px solid ${endDays === String(d) ? 'rgba(125,211,252,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                color: endDays === String(d) ? '#7dd3fc' : '#64748b',
                            }}>{d}d</button>
                        ))}
                    </div>
                </div>

                {/* Error */}
                {message && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600,
                        marginBottom: '1rem', color: status === 'error' ? '#fca5a5' : '#94a3b8',
                        background: status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: '0.75rem', padding: '0.75rem 1rem',
                    }}>
                        {status === 'error' && <AlertCircle size={16} />}
                        {message}
                    </div>
                )}

                <button id="create-market-submit" onClick={handleCreate}
                    disabled={status === 'loading' || !question.trim()}
                    className="btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1rem' }}>
                    {status === 'loading' ? '⏳ Creating on Solana…' : '🚀 Create Market'}
                </button>
            </div>
        </div>
    );
}
