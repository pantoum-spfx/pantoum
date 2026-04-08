import { logger } from './logger.js';

/**
 * Generates fancy two-word names for run folders (adjective-noun combos).
 * ~2400 unique combinations to avoid collisions across sessions.
 */
class FancyNameGenerator {
  private adjectives = [
    'swift', 'bright', 'cosmic', 'golden', 'silent', 'blazing', 'frozen',
    'vivid', 'hidden', 'ancient', 'radiant', 'fierce', 'crystal', 'mystic',
    'scarlet', 'astral', 'iron', 'silver', 'dark', 'wild', 'noble', 'rapid',
    'bold', 'crimson', 'electric', 'sonic', 'lunar', 'solar', 'primal',
    'neon', 'shadow', 'hyper', 'turbo', 'stellar', 'quantum', 'digital',
    'atomic', 'molten', 'spectral', 'lucid',
  ];

  private nouns = [
    'nebula', 'nexus', 'nova', 'phoenix', 'orion', 'pulsar', 'vortex',
    'prism', 'helix', 'vector', 'sigma', 'omega', 'aurora', 'zenith',
    'plasma', 'photon', 'proton', 'quark', 'comet', 'meteor', 'titan',
    'atlas', 'apollo', 'artemis', 'falcon', 'dragon', 'raven', 'wolf',
    'eagle', 'hawk', 'cipher', 'matrix', 'apex', 'axiom', 'delta',
    'gamma', 'theta', 'zeta', 'fusion', 'neutron', 'electron', 'saturn',
    'jupiter', 'mars', 'venus', 'mercury', 'odin', 'thor', 'loki',
    'freya', 'valkyrie', 'athena', 'zeus', 'cortex', 'flare', 'surge',
    'drift', 'spark', 'blaze', 'echo',
  ];

  private usedNames = new Set<string>();

  /**
   * Generate a unique fancy name for a run folder
   */
  async generateFancyName(): Promise<string> {
    // Try up to 20 times to get an unused combination
    for (let i = 0; i < 20; i++) {
      const adj = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
      const noun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
      const name = `${adj}-${noun}`;

      if (!this.usedNames.has(name)) {
        this.usedNames.add(name);
        logger.info(`Generated fancy name: ${name}`);
        return name;
      }
    }

    // Fallback: adjective-noun with random numeric suffix
    const adj = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
    const noun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
    const suffix = Math.floor(Math.random() * 1000);
    const name = `${adj}-${noun}${suffix}`;
    logger.info(`Generated fancy name with suffix: ${name}`);
    return name;
  }

  /**
   * Reset used names (useful for testing or new sessions)
   */
  resetUsedNames(): void {
    this.usedNames.clear();
  }
}

// Singleton instance
export const fancyNameGenerator = new FancyNameGenerator();
