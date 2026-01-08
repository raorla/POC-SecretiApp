'use client';

import { motion } from 'framer-motion';
import { Shield, Key, Cpu, Eye, Server, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const features = [
  {
    icon: Shield,
    title: 'TEE Protection',
    description: 'Your prompts are processed inside Trusted Execution Environments, invisible to everyone including operators.',
    gradient: 'from-green-500 to-emerald-500',
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
  },
  {
    icon: Key,
    title: 'Secure Key Management',
    description: 'API keys are encrypted and stored in iExec SMS. Only the TEE can access them during computation.',
    gradient: 'from-violet-500 to-purple-500',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-400',
  },
  {
    icon: Cpu,
    title: 'Multi-Model Support',
    description: 'Access OpenAI, Anthropic, Hugging Face, and custom models through a unified private interface.',
    gradient: 'from-blue-500 to-cyan-500',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
  },
  {
    icon: Eye,
    title: 'Zero Knowledge',
    description: 'Neither the platform nor the compute providers can see your queries or responses.',
    gradient: 'from-fuchsia-500 to-pink-500',
    iconBg: 'bg-fuchsia-500/10',
    iconColor: 'text-fuchsia-400',
  },
  {
    icon: Server,
    title: 'Decentralized',
    description: 'No single point of failure. Computation is distributed across the iExec network.',
    gradient: 'from-orange-500 to-amber-500',
    iconBg: 'bg-orange-500/10',
    iconColor: 'text-orange-400',
  },
  {
    icon: Lock,
    title: 'Session-Based',
    description: 'Create time-limited sessions with automatic key rotation and expiration.',
    gradient: 'from-cyan-500 to-teal-500',
    iconBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-400',
  },
];

export function Features() {
  return (
    <section className="py-24 px-6 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-violet-950/10 via-transparent to-transparent" />
      
      <div className="max-w-6xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Privacy by{' '}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              Design
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Every layer of the stack is built with security and privacy as the foundation.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="h-full bg-card/50 backdrop-blur-sm border-border/50 hover:border-violet-500/30 hover:bg-card/80 transition-all duration-300 group">
                <CardContent className="p-6">
                  <div className={`inline-flex p-3 rounded-xl ${feature.iconBg} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-violet-400 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
