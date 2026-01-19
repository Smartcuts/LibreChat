import { useState, useCallback } from 'react';
import { useSubmitMCPUserChoiceMutation } from 'librechat-data-provider/react-query';
import type { Agents } from 'librechat-data-provider';

/** User choice configuration without flowId (flowId is at top level of PendingUserChoice) */
export type UserChoiceConfig = {
  prompt: string;
  options: Array<{
    label: string;
    value: string;
    description?: string;
  }>;
  required?: boolean;
};

export interface PendingUserChoice {
  /** The flow ID for submitting the response */
  flowId: string;
  /** The tool call ID associated with this choice */
  toolCallId: string;
  /** The user choice configuration from the tool */
  userChoice: UserChoiceConfig;
}

interface UseMCPUserChoiceReturn {
  /** The currently pending user choice, if any */
  pendingChoice: PendingUserChoice | null;
  /** Set a new pending choice (triggered by step handler) */
  setPendingChoice: (choice: PendingUserChoice | null) => void;
  /** Submit the user's selection */
  handleSubmit: (selection: string) => Promise<void>;
  /** Cancel the choice (for non-required choices) */
  handleCancel: () => Promise<void>;
  /** Whether a submission is in progress */
  isSubmitting: boolean;
}

/**
 * Hook to manage MCP user choice modal state and submissions.
 * This hook provides state management for displaying user choice modals
 * and handles the API calls to submit selections.
 */
export function useMCPUserChoice(): UseMCPUserChoiceReturn {
  const [pendingChoice, setPendingChoice] = useState<PendingUserChoice | null>(null);
  const submitMutation = useSubmitMCPUserChoiceMutation();

  const handleSubmit = useCallback(
    async (selection: string) => {
      if (!pendingChoice) {
        return;
      }

      try {
        await submitMutation.mutateAsync({
          flowId: pendingChoice.flowId,
          selection,
        });
        setPendingChoice(null);
      } catch (error) {
        console.error('[MCP User Choice] Failed to submit selection:', error);
        throw error;
      }
    },
    [pendingChoice, submitMutation],
  );

  const handleCancel = useCallback(async () => {
    if (!pendingChoice) {
      return;
    }

    // Only allow cancel for non-required choices
    if (pendingChoice.userChoice.required) {
      console.warn('[MCP User Choice] Cannot cancel required choice');
      return;
    }

    try {
      await submitMutation.mutateAsync({
        flowId: pendingChoice.flowId,
        selection: null,
      });
      setPendingChoice(null);
    } catch (error) {
      console.error('[MCP User Choice] Failed to cancel choice:', error);
      throw error;
    }
  }, [pendingChoice, submitMutation]);

  return {
    pendingChoice,
    setPendingChoice,
    handleSubmit,
    handleCancel,
    isSubmitting: submitMutation.isLoading,
  };
}
