'use client';
import { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { TrendingUp, X, AlertCircle, CheckCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const D3X_DECIMALS = 1_000_000; // 6 decimal places

interface BetModalProps {
    market: {
        pubkey: string;
        question: string;
        totalYes: string;
        totalNo: string;
    };
    onClose: () => void;
    onSuccess: () => void;
}

export default function BetModal({ market, onClose, onSuccess }: BetModalProps) {
    const { publicKey, sendTransaction } = useWallet();
    const { connection } = useConnection();
    const [side, setSide] = useState<'yes' | 'no'>('yes');
    const [amount, setAmount] = useState('100');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const totalYes = parseFloat(market.totalYes) / D3X_DECIMALS;
    const totalNo = parseFloat(market.totalNo) / D3X_DECIMALS;
    const totalPool = totalYes + totalNo;
    const yesPct = totalPool > 0 ? Math.round((totalYes / totalPool) * 100) : 50;
    const noPct = 100 - yesPct;

    const protocolFee = (parseFloat(amount) * 0.01).toFixed(2);
    const creatorFee = (parseFloat(amount) * 0.01).toFixed(2);
    const feeAmount = (parseFloat(amount) * 0.02).toFixed(2);
    const netAmount = (parseFloat(amount) * 0.98).toFixed(2);

    async function handleBet() {
        if (!publicKey) return setMessage('Connect your wallet first');
        const amtNum = parseFloat(amount);
        if (!amtNum || amtNum <= 0) return setMessage('Enter a valid amount');

        setStatus('loading');
        setMessage('Building transaction…');
        try {
            const resp = await fetch(
                `${API_URL}/api/action/bet?market=${market.pubkey}&side=${side}&amount=${amount}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account: publicKey.toBase58() }),
                }
            );
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'API error');

            const tx = Transaction.from(Buffer.from(data.transaction, 'base64'));
            setMessage('Please approve in wallet…');
            const sig = await sendTransaction(tx, connection);
            await connection.confirmTransaction(sig, 'confirmed');

            setStatus('success');
            setMessage(`Bet placed! TX: ${sig.slice(0, 16)}…`);
            setTimeout(() => { onSuccess(); onClose(); }, 2000);
        } catch (err: any) {
            setStatus('error');
            setMessage(err.message || 'Transaction failed');
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
            <div className="glass-card neon-border w-full max-w-md mx-4 p-8 relative" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-5 right-5 p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold mb-2">Place Your Bet</h2>
                <p className="text-gray-400 text-sm mb-6 line-clamp-2">{market.question}</p>

                {/* Odds bar */}
                <div className="mb-6">
                    <div className="flex justify-between text-xs font-bold mb-2">
                        <span className="text-[#00f0ff]">YES {yesPct}%</span>
                        <span className="text-[#ff0055]">NO {noPct}%</span>
                    </div>
                    <div className="h-4 bg-black/50 rounded-full overflow-hidden border border-white/5">
                        <div className="h-full bg-gradient-to-r from-[#0055ff] to-[#00f0ff] transition-all" style={{ width: `${yesPct}%` }} />
                    </div>
                </div>

                {/* Side selector */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                    <button
                        onClick={() => setSide('yes')}
                        className={`py-4 rounded-xl font-black border transition-all ${side === 'yes' ? 'bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff] shadow-[0_0_20px_rgba(0,240,255,0.3)]' : 'bg-black/30 border-white/10 text-gray-400 hover:border-[#00f0ff]/50'}`}
                    >
                        ✅ YES
                    </button>
                    <button
                        onClick={() => setSide('no')}
                        className={`py-4 rounded-xl font-black border transition-all ${side === 'no' ? 'bg-[#ff0055]/20 border-[#ff0055] text-[#ff0055] shadow-[0_0_20px_rgba(255,0,85,0.3)]' : 'bg-black/30 border-white/10 text-gray-400 hover:border-[#ff0055]/50'}`}
                    >
                        ❌ NO
                    </button>
                </div>

                {/* Amount */}
                <div className="mb-5">
                    <label className="block text-sm text-gray-400 mb-2">Amount (D3X)</label>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            min="1"
                            className="flex-1 input-glass rounded-xl px-5 py-4 text-xl font-bold"
                            placeholder="100"
                        />
                    </div>
                    <div className="flex gap-2 mt-2">
                        {[50, 100, 500, 1000].map(v => (
                            <button key={v} onClick={() => setAmount(String(v))} className="text-sm font-bold px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors text-white">
                                {v}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Fee breakdown */}
                <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(125,211,252,0.1)', borderRadius: '0.875rem', padding: '1rem 1.25rem', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '0.4rem' }}>
                        <span>Bet amount</span><span style={{ color: '#e2e8f0', fontWeight: 700 }}>{amount} D3X</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: '0.25rem' }}>
                        <span>Protocol fee (1%)</span><span>-{protocolFee} D3X</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: '0.5rem' }}>
                        <span>Creator fee (1%)</span><span>-{creatorFee} D3X</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontWeight: 800, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.5rem' }}>
                        <span>Net bet</span><span>{netAmount} D3X</span>
                    </div>
                </div>

                {message && (
                    <div className={`flex items-center gap-2 text-sm mb-4 ${status === 'error' ? 'text-red-400' : status === 'success' ? 'text-green-400' : 'text-gray-400'}`}>
                        {status === 'error' && <AlertCircle size={16} />}
                        {status === 'success' && <CheckCircle size={16} />}
                        {message}
                    </div>
                )}

                <button
                    onClick={handleBet}
                    disabled={status === 'loading' || status === 'success'}
                    className={`w-full py-5 rounded-xl font-black text-lg transition-all ${side === 'yes'
                        ? 'bg-[#00f0ff] hover:bg-white text-black shadow-[0_0_20px_rgba(0,240,255,0.4)] disabled:opacity-50'
                        : 'bg-[#ff0055] hover:bg-white text-black shadow-[0_0_20px_rgba(255,0,85,0.4)] disabled:opacity-50'
                        } disabled:cursor-not-allowed`}
                >
                    {status === 'loading' ? '⏳ Processing…' : status === 'success' ? '✅ Done!' : `Bet ${side.toUpperCase()} with D3X`}
                </button>
            </div>
        </div>
    );
}
