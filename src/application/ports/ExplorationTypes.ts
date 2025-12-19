import {
  ExplorationSession,
  CheckpointReason,
  HumanGuidance,
} from '../../domain/exploration/ExplorationSession';
import { ActionDecision } from './LLMPort';

/**
 * Callback for human-in-the-loop interactions.
 */
export interface HumanInteractionCallback {
  onCheckpoint: (
    session: ExplorationSession,
    reason: CheckpointReason,
    proposedAction?: ActionDecision
  ) => Promise<HumanGuidance>;
}

/**
 * Callback for progress summaries (non-blocking).
 */
export interface ProgressCallback {
  onProgress: (summary: ProgressSummary) => void;
}

/**
 * Progress summary data.
 */
export interface ProgressSummary {
  currentStep: number;
  totalSteps: number;
  currentUrl: string;
  pagesVisited: string[];
  findingsCount: number;
  recentActions: string[];
  plannedActions: string[];
  personaSuggestionQueue: SuggestionQueueItem[];
}

/**
 * Item in the suggestion queue from personas.
 */
export interface SuggestionQueueItem {
  personaName: string;
  action: Partial<ActionDecision>;
  reasoning: string;
  targetUrl: string;
  priority: number;
}
