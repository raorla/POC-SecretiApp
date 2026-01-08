import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PrivateAI Gateway',
  description: 'Decentralized Private AI Oracle powered by iExec TEE',
  keywords: ['AI', 'Privacy', 'Blockchain', 'iExec', 'TEE', 'Decentralized'],
  openGraph: {
    title: 'PrivateAI Gateway',
    description: 'Your AI queries, truly private. Powered by iExec TEE.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
