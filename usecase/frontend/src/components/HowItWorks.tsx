'use client';

import { motion } from 'framer-motion';
import { Wallet, Key, MessageSquare, Shield, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const steps = [
  {
    step: 1,
    icon: Wallet,
    title: 'Connect Wallet',
    description: 'Connect your Web3 wallet to authenticate and manage your sessions.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    step: 2,
    icon: Key,
    title: 'Create Session',
    description: 'Provide your encrypted API key. A secure session is created in the TEE.',
    color: 'from-violet-500 to-purple-500',
  },
  {
    step: 3,
    icon: MessageSquare,
    title: 'Send Prompts',
    description: 'Your encrypted prompts are sent to the AIOracle running inside the TEE.',
    color: 'from-fuchsia-500 to-pink-500',
  },
  {
    step: 4,
    icon: Shield,
    title: 'Private Processing',
    description: 'The TEE decrypts your prompt, calls the AI API, and encrypts the response.',
    color: 'from-green-500 to-emerald-500',
  },
  {
    step: 5,
    icon: CheckCircle,
    title: 'Receive Results',
    description: 'Get your encrypted response and decrypt it locally with your session key.',
    color: 'from-amber-500 to-orange-500',
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-6 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-950/20 to-transparent" />
      
      <div className="max-w-4xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            How It{' '}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              Works
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A simple flow that keeps your data private at every step.
          </p>
        </motion.div>

        <div className="relative">
          {/* Connection line */}
          <div className="absolute left-[31px] top-12 bottom-12 w-0.5 bg-gradient-to-b from-violet-500 via-fuchsia-500 to-orange-500 hidden md:block" />

          <div className="space-y-6">
            {steps.map((step, index) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex items-start gap-6"
              >
                {/* Step indicator */}
                <div className="relative flex-shrink-0">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} p-[2px] glow`}>
                    <div className="w-full h-full rounded-2xl bg-background flex items-center justify-center">
                      <step.icon className="w-7 h-7 text-foreground" />
                    </div>
                  </div>
                  <div className={`absolute -top-2 -right-2 w-7 h-7 rounded-lg bg-gradient-to-br ${step.color} flex items-center justify-center text-sm font-bold text-white shadow-lg`}>
                    {step.step}
                  </div>
                </div>

                {/* Content */}
                <Card className="flex-1 bg-card/50 backdrop-blur-sm border-border/50 hover:border-violet-500/30 transition-colors">
                  <CardContent className="p-5">
                    <h3 className="text-lg font-semibold mb-1">{step.title}</h3>
                    <p className="text-muted-foreground text-sm">{step.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
