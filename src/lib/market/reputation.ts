/**
 * Persona reputation — settled-Deal win counts per persona.
 *
 * The buyer's fit scoring gives a small bonus to personas with more historical wins, making
 * the marketplace a compounding flywheel: sellers that deliver quality get more work at
 * (relatively) better prices. A real economic force, not a badge.
 *
 * Persisted in the store so it survives dev restarts. Reset with `resetReputation()`.
 */
import { store } from "../store";

const REP_TTL = 86400 * 365 * 10; // 10 years — effectively durable

export interface PersonaReputation {
  personaId: string;
  wins: number;
  totalRevenueLamports: number;
  lastWinAt?: string;
}

function key(personaId: string): string {
  return `reputation:${personaId}`;
}

export function getReputation(personaId: string): PersonaReputation {
  return (
    store.get<PersonaReputation>(key(personaId)) ?? {
      personaId,
      wins: 0,
      totalRevenueLamports: 0,
    }
  );
}

export function recordWin(personaId: string, priceLamports: number): PersonaReputation {
  const current = getReputation(personaId);
  const updated: PersonaReputation = {
    personaId,
    wins: current.wins + 1,
    totalRevenueLamports: current.totalRevenueLamports + priceLamports,
    lastWinAt: new Date().toISOString(),
  };
  store.set(key(personaId), updated, REP_TTL);
  return updated;
}

/**
 * Reputation boost applied to the buyer's fit score. Diminishing returns — first few wins
 * matter most; after ~50 wins the boost caps out. Max boost = +10% fit score.
 */
export function reputationBoost(personaId: string): number {
  const { wins } = getReputation(personaId);
  if (wins === 0) return 0;
  // Log-based; ln(50)/ln(51) ≈ 1.0 → ~0.10 boost
  const normalized = Math.log1p(wins) / Math.log(51);
  return Math.min(0.1, 0.1 * normalized);
}

export function resetReputation(personaId?: string): void {
  if (personaId) {
    store.delete(key(personaId));
    return;
  }
  for (const k of store.keys("reputation:")) store.delete(k);
}
