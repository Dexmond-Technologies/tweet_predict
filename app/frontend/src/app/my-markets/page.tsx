'use client';
import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { TrendingUp, Share2, Coins, BarChart3, PlusCircle, Clock, Trophy } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tweetpredict-api-1mpm.onrender.com';
const D3X_DECIMALS = 1_000_000;

interface CreatorMarket {
    pubkey: string;
    question: string;
    endTimestamp: number;
    status: any;
    totalYes: string;
    totalNo: string;
    creatorFeeEarned: string;
}

interface CreatorStats {
    creator: string;
    totalEarned: string;
    marketsCount: number;
    markets: CreatorMarket[];
}

function timeLeft(ts: number) {
    const diff = ts * 1000 - Date.now();
    if (diff <= 0) return 'Closed';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
}

function statusLabel(status: any) {
    if ('resolved' in status) {
        const outcome = status.resolved.outcome;
        return { label: outcome ? 'YES Won' : 'NO Won', cls: outcome ? 'badge-resolved-yes' : 'badge-resolved-no' };
    }
    if ('challenged' in status) return { label: 'Challenged', cls: 'badge-challenged' };
    return { label: 'Active', cls: 'badge-active' };
}

export default function MyMarketsPage() {
    const { publicKey } = useWallet();
    const [stats, setStats] = useState<CreatorStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchStats = useCallback(async () => {
        if (!publicKey) return;
        setLoading(true);
        setError('');
        try {
            const r = await fetch(`${API_URL}/api/creator/${publicKey.toBase58()}`);
            if (!r.ok) throw new Error('Could not load creator stats');
            setStats(await r.json());
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [publicKey]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    function shareBlink(market: CreatorMarket) {
        const base = typeof window !== 'undefined' ? window.location.origin : 'https://dexmond-technologies.github.io/tweet_predict';
        const blinkUrl = `${base}/api/action/bet?market=${market.pubkey}&question=${encodeURIComponent(market.question)}`;
        const tweetText = `🔮 Bet on: "${market.question}"\n\nUse D3X tokens. Direct from Twitter! 🚀\n\n${blinkUrl}`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
    }

    const totalEarnedD3x = stats
        ? (Number(stats.totalEarned) / D3X_DECIMALS).toFixed(4)
        : '0';
    const totalVolumeD3x = stats
        ? (stats.markets.reduce((sum, m) => sum + (parseFloat(m.totalYes) + parseFloat(m.totalNo)), 0) / D3X_DECIMALS).toFixed(2)
        : '0';

    return (
        <div>
            {/* Page header */}
            <div style={{ marginBottom: '2.5rem' }}>
                <h1 style={{
                    fontSize: 'clamp(2rem, 4vw, 3rem)',
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    marginBottom: '0.5rem',
                    background: 'linear-gradient(135deg, #7dd3fc 0%, #c4b5fd 50%, #f9a8d4 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                }}>My Markets</h1>
                <p style={{ color: '#64748b', fontSize: '1rem' }}>
                    Your prediction markets and creator earnings — paid in D3X automatically on every bet.
                </p>
            </div>

            {/* Not connected */}
            {!publicKey && (
                <div className="glass-card" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
                    <Coins size={56} style={{ display: 'block', margin: '0 auto 1.5rem auto', color: '#7dd3fc', opacity: 0.6 }} />
                    <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#e2e8f0', marginBottom: '0.75rem' }}>Connect your wallet</h3>
                    <p style={{ color: '#64748b' }}>Connect to see your markets and track your D3X earnings.</p>
                </div>
            )}

            {/* Loading */}
            {publicKey && loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="glass-card" style={{ padding: '1.5rem' }}>
                            <div style={{ height: '1rem', background: 'rgba(125,211,252,0.07)', borderRadius: '0.5rem', marginBottom: '0.75rem', animation: 'pulse 2s ease-in-out infinite' }} />
                            <div style={{ height: '2rem', background: 'rgba(125,211,252,0.07)', borderRadius: '0.5rem', animation: 'pulse 2s ease-in-out infinite' }} />
                        </div>
                    ))}
                </div>
            )}

            {/* Loaded */}
            {publicKey && !loading && stats && (
                <>
                    {/* Stats banner */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
                        {/* Total Earned */}
                        <div className="glass-card" style={{ padding: '1.5rem', borderColor: 'rgba(249,168,212,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <Coins size={16} style={{ color: '#f9a8d4' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Earned</span>
                            </div>
                            <div style={{
                                fontSize: '2rem', fontWeight: 900,
                                background: 'linear-gradient(135deg, #f9a8d4, #c4b5fd)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>{totalEarnedD3x}</div>
                            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.25rem', fontWeight: 600 }}>D3X tokens</div>
                        </div>

                        {/* Markets Created */}
                        <div className="glass-card" style={{ padding: '1.5rem', borderColor: 'rgba(125,211,252,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <BarChart3 size={16} style={{ color: '#7dd3fc' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Markets Created</span>
                            </div>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#7dd3fc' }}>{stats.marketsCount}</div>
                            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.25rem', fontWeight: 600 }}>prediction markets</div>
                        </div>

                        {/* Total Volume */}
                        <div className="glass-card" style={{ padding: '1.5rem', borderColor: 'rgba(196,181,253,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <TrendingUp size={16} style={{ color: '#c4b5fd' }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Volume</span>
                            </div>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#c4b5fd' }}>{totalVolumeD3x}</div>
                            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.25rem', fontWeight: 600 }}>D3X bet</div>
                        </div>
                    </div>

                    {/* How it works callout */}
                    <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: '1rem',
                        background: 'rgba(125,211,252,0.05)',
                        border: '1px solid rgba(125,211,252,0.15)',
                        borderRadius: '1rem',
                        padding: '1.25rem 1.5rem',
                        marginBottom: '2rem',
                        fontSize: '0.875rem',
                        color: '#94a3b8',
                        lineHeight: 1.6,
                    }}>
                        <Coins size={18} style={{ color: '#7dd3fc', flexShrink: 0, marginTop: '0.1rem' }} />
                        <span>
                            You earn <strong style={{ color: '#7dd3fc' }}>1% of every bet</strong> placed on your markets — automatically sent to your Solana wallet in D3X at bet time. The other 1% goes to the protocol treasury. <strong style={{ color: '#e2e8f0' }}>No withdrawal needed.</strong>
                        </span>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.875rem', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                            {error}
                        </div>
                    )}

                    {/* Empty state */}
                    {stats.marketsCount === 0 && (
                        <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                            <TrendingUp size={52} style={{ display: 'block', margin: '0 auto 1.5rem auto', color: '#7dd3fc', opacity: 0.5 }} />
                            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e2e8f0', marginBottom: '0.75rem' }}>No markets yet</h3>
                            <p style={{ color: '#64748b', marginBottom: '2rem' }}>
                                Create your first market and share it on Twitter to start earning D3X.
                            </p>
                            <a href="/" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                                <PlusCircle size={18} /> Launch First Market
                            </a>
                        </div>
                    )}

                    {/* Market cards */}
                    {stats.marketsCount > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
                            {stats.markets.map(m => {
                                const sl = statusLabel(m.status);
                                const earnedD3x = (Number(m.creatorFeeEarned) / D3X_DECIMALS).toFixed(4);
                                const totalPool = ((parseFloat(m.totalYes) + parseFloat(m.totalNo)) / D3X_DECIMALS).toFixed(0);
                                return (
                                    <div key={m.pubkey} className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {/* Status + Time */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className={sl.cls}>{sl.label}</span>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Clock size={11} /> {timeLeft(m.endTimestamp)}
                                            </div>
                                        </div>

                                        {/* Question */}
                                        <p style={{
                                            fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.5, margin: 0,
                                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                        }}>{m.question}</p>

                                        {/* Earnings highlight */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            background: 'rgba(249,168,212,0.07)',
                                            border: '1px solid rgba(249,168,212,0.18)',
                                            borderRadius: '0.75rem',
                                            padding: '0.75rem 1rem',
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>You Earned</div>
                                                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f9a8d4' }}>{earnedD3x} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>D3X</span></div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pool</div>
                                                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#7dd3fc' }}>{totalPool} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>D3X</span></div>
                                            </div>
                                        </div>

                                        {/* Tweet Blink button */}
                                        <button
                                            onClick={() => shareBlink(m)}
                                            className="btn-primary"
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', fontSize: '0.875rem' }}
                                        >
                                            <Share2 size={16} /> Tweet this Market
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
