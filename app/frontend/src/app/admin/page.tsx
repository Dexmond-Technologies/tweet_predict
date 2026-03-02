'use client';
import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { Wallet, TrendingUp, DollarSign, AlertCircle, CheckCircle, ArrowDownToLine } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const AUTHORITY = '436RdD2mVZQedoe9yQUwyzorJrjSWqbQHtmWrhducnUe';
const D3X_DECIMALS = 1_000_000;

interface ProtocolState {
    authority: string;
    treasuryVault: string;
    feeBps: number;
    totalFeesCollected: string;
    totalMarketsCreated: number;
    totalVolume: string;
}

export default function AdminPage() {
    const { publicKey, sendTransaction } = useWallet();
    const { connection } = useConnection();
    const [protocol, setProtocol] = useState<ProtocolState | null>(null);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const isAuthorised = publicKey?.toBase58() === AUTHORITY;

    useEffect(() => {
        fetch(`${API_URL}/api/protocol`)
            .then(r => r.json())
            .then(setProtocol)
            .catch(() => { });
    }, []);

    const feesD3x = protocol
        ? (parseFloat(protocol.totalFeesCollected) / D3X_DECIMALS).toFixed(4)
        : '—';
    const volumeD3x = protocol
        ? (parseFloat(protocol.totalVolume) / D3X_DECIMALS).toFixed(2)
        : '—';

    async function handleWithdraw() {
        if (!publicKey || !withdrawAmount) return;
        setStatus('loading');
        setMessage('Building withdrawal transaction…');
        try {
            const r = await fetch(`${API_URL}/api/action/withdraw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account: publicKey.toBase58(), amount: withdrawAmount }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);

            const tx = Transaction.from(Buffer.from(data.transaction, 'base64'));
            setMessage('Approve in wallet…');
            const sig = await sendTransaction(tx, connection);
            await connection.confirmTransaction(sig, 'confirmed');

            setStatus('success');
            setMessage(`Withdrawn ${withdrawAmount} D3X! TX: ${sig.slice(0, 16)}…`);
            setWithdrawAmount('');
        } catch (e: any) {
            setStatus('error');
            setMessage(e.message || 'Failed');
        }
    }

    return (
        <div className="max-w-3xl mx-auto">
            <div className="mb-10">
                <h1 className="text-4xl font-extrabold gradient-text mb-2">Admin Dashboard</h1>
                <p className="text-gray-400">Treasury management for TweetPredict protocol</p>
            </div>

            {/* Auth check */}
            {!publicKey ? (
                <div className="glass p-8 text-center">
                    <Wallet size={40} className="mx-auto mb-4 text-gray-500" />
                    <p className="text-gray-400">Connect your wallet to access the admin panel.</p>
                </div>
            ) : !isAuthorised ? (
                <div className="glass p-8 text-center border border-red-500/30">
                    <AlertCircle size={40} className="mx-auto mb-4 text-red-400" />
                    <p className="text-red-400 font-bold">Access denied</p>
                    <p className="text-gray-500 text-sm mt-2">Only the protocol authority can access this page.</p>
                    <p className="text-gray-600 text-xs mt-2 font-mono">{AUTHORITY.slice(0, 20)}…</p>
                </div>
            ) : (
                <>
                    {/* Stats grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div className="glass p-6">
                            <div className="flex items-center gap-2 mb-2">
                                <DollarSign size={18} className="text-green-400" />
                                <span className="text-gray-400 text-sm">Fees Collected</span>
                            </div>
                            <div className="text-3xl font-bold">{feesD3x}</div>
                            <div className="text-xs text-gray-500 mt-1">D3X tokens</div>
                        </div>
                        <div className="glass p-6">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp size={18} className="text-blue-400" />
                                <span className="text-gray-400 text-sm">Total Volume</span>
                            </div>
                            <div className="text-3xl font-bold">{volumeD3x}</div>
                            <div className="text-xs text-gray-500 mt-1">D3X bet</div>
                        </div>
                        <div className="glass p-6">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp size={18} className="text-pink-400" />
                                <span className="text-gray-400 text-sm">Markets Created</span>
                            </div>
                            <div className="text-3xl font-bold">{protocol?.totalMarketsCreated ?? '—'}</div>
                            <div className="text-xs text-gray-500 mt-1">markets</div>
                        </div>
                    </div>

                    {/* Protocol info */}
                    <div className="glass p-6 mb-8">
                        <h2 className="font-bold mb-4 text-gray-300">Protocol Config</h2>
                        <div className="space-y-2 text-sm font-mono">
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">Fee</span>
                                <span className="text-white">{protocol?.feeBps} bps ({((protocol?.feeBps || 0) / 100).toFixed(2)}%)</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">Treasury</span>
                                <span className="text-white truncate">{protocol?.treasuryVault?.slice(0, 20)}…</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">Authority</span>
                                <span className="text-green-400 truncate">{publicKey?.toBase58().slice(0, 20)}… ✓</span>
                            </div>
                        </div>
                    </div>

                    {/* Withdraw */}
                    <div className="glass p-6">
                        <h2 className="font-bold mb-1 text-gray-300 flex items-center gap-2">
                            <ArrowDownToLine size={18} className="text-green-400" />
                            Withdraw D3X to Your Wallet
                        </h2>
                        <p className="text-gray-500 text-sm mb-5">Transfers D3X from the on-chain treasury vault to your wallet.</p>
                        <div className="flex gap-3 mb-4">
                            <input
                                type="number"
                                placeholder="Amount in D3X"
                                value={withdrawAmount}
                                onChange={e => setWithdrawAmount(e.target.value)}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-green-500 focus:outline-none"
                            />
                            <button
                                onClick={handleWithdraw}
                                disabled={status === 'loading' || !withdrawAmount}
                                className="px-6 py-3 rounded-xl font-bold bg-green-600 hover:bg-green-500 disabled:bg-green-600/40 disabled:cursor-not-allowed transition-all"
                            >
                                {status === 'loading' ? '⏳' : 'Withdraw'}
                            </button>
                        </div>

                        {message && (
                            <div className={`flex items-center gap-2 text-sm ${status === 'error' ? 'text-red-400' : status === 'success' ? 'text-green-400' : 'text-gray-400'}`}>
                                {status === 'error' && <AlertCircle size={14} />}
                                {status === 'success' && <CheckCircle size={14} />}
                                {message}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
