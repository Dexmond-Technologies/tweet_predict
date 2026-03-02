'use client';
import { SolanaContext } from '../components/SolanaProvider';
import dynamic from 'next/dynamic';
import { Inter } from 'next/font/google';
import './globals.css';

const WalletMultiButton = dynamic(
    async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
    { ssr: false }
);

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <title>TweetPredict — Decentralized Prediction Markets on Solana</title>
                <meta name="description" content="Bet with D3X tokens on viral events. Create markets, share as Blinks, settle on-chain. 100% permissionless." />
            </head>
            <body className={inter.className} style={{ position: 'relative', zIndex: 0 }}>
                <SolanaContext>
                    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem' }}>
                        {/* Header */}
                        <header className="glass" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '1rem 1.75rem',
                            margin: '1.5rem 0 2.5rem 0',
                        }}>
                            <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{
                                    fontSize: '1.5rem',
                                    fontWeight: 900,
                                    background: 'linear-gradient(135deg, #7dd3fc 0%, #f9a8d4 100%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                }}>TweetPredict</span>
                                <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    color: '#7dd3fc',
                                    background: 'rgba(125,211,252,0.12)',
                                    border: '1px solid rgba(125,211,252,0.3)',
                                    borderRadius: '999px',
                                    padding: '0.2rem 0.6rem',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                }}>DEVNET</span>
                            </a>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <a href="/my-markets" style={{
                                    fontSize: '0.875rem',
                                    color: '#94a3b8',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    transition: 'color 0.2s',
                                }}
                                    onMouseOver={e => (e.currentTarget.style.color = '#f9a8d4')}
                                    onMouseOut={e => (e.currentTarget.style.color = '#94a3b8')}
                                >My Markets</a>
                                <a href="/admin" style={{
                                    fontSize: '0.875rem',
                                    color: '#94a3b8',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    transition: 'color 0.2s',
                                }}
                                    onMouseOver={e => (e.currentTarget.style.color = '#7dd3fc')}
                                    onMouseOut={e => (e.currentTarget.style.color = '#94a3b8')}
                                >Admin</a>
                                <WalletMultiButton />
                            </div>
                        </header>

                        {/* Main content */}
                        <main style={{ paddingBottom: '6rem' }}>
                            {children}
                        </main>

                        {/* Footer */}
                        <footer style={{
                            textAlign: 'center',
                            padding: '2rem',
                            color: '#475569',
                            fontSize: '0.8rem',
                            borderTop: '1px solid rgba(125,211,252,0.08)',
                        }}>
                            © 2025 TweetPredict · Built on Solana · Powered by D3X
                        </footer>
                    </div>
                </SolanaContext>
            </body>
        </html>
    );
}
