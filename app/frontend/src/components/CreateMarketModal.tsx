'use client';
import { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { X, Calendar, AlertCircle, Twitter } from 'lucide-react';

import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton, { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tweetpredict-api-1mpm.onrender.com';

const PYTH_FEEDS = [
    { label: "SOL / USD", pubkey: "H6ARHf6YXhGYeQfUzQNGk6dF7bT4H7hNqNtzZ5oW5eBv" },
    { label: "BTC / USD", pubkey: "GVXRSBjFk6e6J3NbHXkSnD19Z2ixaX5oQZhXm4Edb5V" },
    { label: "ETH / USD", pubkey: "JBu1AL4obBcYWjzPKtD6gZ5K74h47QpXYG8Lg4bS96V8" },
    { label: "USDC / USD", pubkey: "Gnt27xtC473ZT2Mw5u8wZ68Z3gEUcTNNZv59XnvSyMPB" },
    { label: "USDT / USD", pubkey: "3vxLXJqLqF3JG5TCbYycbKWRBbCJQLxQmBcoahS5NnmN" },
    { label: "BNB / USD", pubkey: "4CkQJBxhU8EZ2UjhigcqPdgYXQjAUNqE2EKSx3xRjYnB" },
    { label: "ADA / USD", pubkey: "3pyn4svB5Y9C4tKFXFvD2kEpsgHjS9jV9s18e1EWeA1i" },
    { label: "DOGE / USD", pubkey: "Boz7RBSns1Y9aGvQxX6p9tJ3eE8vD5jWjU4aLXZ2bN8U" },
    { label: "XRP / USD", pubkey: "FCPvJ671xsq5iU25X2JAdpB5Y2GjU2gCh3Yn1w1G2U1u" },
    { label: "AVAX / USD", pubkey: "E2wXb857mZJ8A6dD3XwV44hD4QyY7cZ6yP4tWgH2u5p3" },
    { label: "MATIC / USD", pubkey: "72a5a51Z2a9w4JqRZYW3y4t6t3u2Q6tZ9a9g8Y5e4P5C" },
    { label: "APT / USD", pubkey: "E1p2rZbXqL6mZ2XWgH4tQZ2X4aM6G4x8K4N5G3jS9q8y" }
];

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreateMarketModal({ onClose, onSuccess }: Props) {
    const { publicKey, sendTransaction } = useWallet();
    const { connection } = useConnection();
    const [question, setQuestion] = useState('');

    const [endDays, setEndDays] = useState('30');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [marketPubkey, setMarketPubkey] = useState('');

    const [oracleType, setOracleType] = useState('1'); // 1=Pyth
    const [oracleAccount, setOracleAccount] = useState('H6ARHf6YXhGYeQfUzQNGk6dF7bT4H7hNqNtzZ5oW5eBv'); // SOL/USD default
    const [targetPrice, setTargetPrice] = useState('');
    const [priceDirection, setPriceDirection] = useState('0'); // 0=Above, 1=Below

    async function handleCreate() {
        if (!publicKey) return setMessage('Connect your wallet first');
        if (!question.trim()) return setMessage('Enter a question');
        if (question.length > 280) return setMessage('Question too long (max 280 chars)');

        setStatus('loading');
        setMessage('Building transaction…');
        try {
            const params = new URLSearchParams({ 
                question, description: '', endDays, 
                oracleType, oracleAccount, targetPrice: targetPrice || '0', priceDirection 
            }).toString();
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
            await connection.confirmTransaction({
                signature: sig,
                blockhash: tx.recentBlockhash!,
                lastValidBlockHeight: data.lastValidBlockHeight
            }, 'confirmed');

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
        const base = typeof window !== 'undefined' ? window.location.origin : 'https://dexmond-technologies.github.io/tweetpredict';
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

                    <div style={{ background: 'rgba(255,0,255,0.08)', border: '1px solid rgba(255,0,255,0.3)', borderRadius: '0.875rem', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                        <p style={{ color: '#e2e8f0', fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>⚠️ Manual Twitter Share Required</p>
                        <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                            Due to the high price of the Twitter API, automated posting is disabled. You must <strong>manually copy</strong> the link below and paste it into a new Tweet to share this market on your timeline:
                        </p>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,240,255,0.3)', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.75rem', color: '#00f0ff', wordBreak: 'break-all', marginBottom: '1.5rem', userSelect: 'all', textAlign: 'left' }}>
                        {typeof window !== 'undefined' ? window.location.origin : 'https://dexmond-technologies.github.io/tweetpredict'}/api/action/bet?market={marketPubkey}&amp;question={encodeURIComponent(question)}
                    </div>
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



                {/* Oracle Selection */}
                <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#f9a8d4', marginBottom: '0.5rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        Who decides the winner?
                    </label>
                    <div className="input-glass" style={{ marginBottom: '1rem', color: '#e2e8f0', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 0.875rem' }}>
                        Pyth Price Feed (Decentralized)
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '0.875rem', padding: '1rem', marginTop: '0.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Target Asset</label>
                        <select value={oracleAccount} onChange={e => setOracleAccount(e.target.value)} className="input-glass" style={{ marginBottom: '1rem', padding: '0.625rem', width: '100%' }}>
                            {PYTH_FEEDS.map(feed => (
                                <option key={feed.pubkey} value={feed.pubkey} style={{ background: '#0f172a' }}>{feed.label}</option>
                            ))}
                        </select>

                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Resolution Condition (if price is)</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <select value={priceDirection} onChange={e => setPriceDirection(e.target.value)} className="input-glass" style={{ flex: 1, padding: '0.625rem' }}>
                                <option value="0" style={{ background: '#0f172a' }}>&gt;= (Above or Equal)</option>
                                <option value="1" style={{ background: '#0f172a' }}>&lt; (Below)</option>
                            </select>
                            <input type="number" step="any" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="Target Price ($)" className="input-glass" style={{ flex: 1.5, padding: '0.625rem' }} />
                        </div>
                    </div>
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

                {publicKey ? (
                    <button id="create-market-submit" onClick={handleCreate}
                        disabled={status === 'loading' || !question.trim()}
                        className="btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1rem' }}>
                        {status === 'loading' ? '⏳ Creating on Solana…' : '🚀 Create Market'}
                    </button>
                ) : (
                    <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '1.5rem', textAlign: 'center' }}>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1rem' }}>Connect your wallet to launch a prediction market</p>
                        <div style={{ display: 'inline-block' }}>
                            <WalletMultiButton />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
