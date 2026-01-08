'use client';

import { Hero } from '@/components/Hero';
import { Features } from '@/components/Features';
import { HowItWorks } from '@/components/HowItWorks';
import { Dashboard } from '@/components/Dashboard';
import { useAccount } from 'wagmi';

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <main className="min-h-screen">
      {isConnected ? (
        <Dashboard />
      ) : (
        <>
          <Hero />
          <Features />
          <HowItWorks />
        </>
      )}
    </main>
  );
}
