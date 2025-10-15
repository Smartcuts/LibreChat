import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import isEqual from 'lodash/isEqual';
import { useRecoilState } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import { ephemeralAgentByConvoId, mcpValuesAtomFamily, mcpPinnedAtom } from '~/store';
import { useGetStartupConfig } from '~/data-provider';
import { setTimestamp } from '~/utils/timestamps';

export function useMCPSelect({ conversationId }: { conversationId?: string | null }) {
  const key = conversationId ?? Constants.NEW_CONVO;
  const { data: startupConfig } = useGetStartupConfig();
  const configuredServers = useMemo(() => {
    return new Set(Object.keys(startupConfig?.mcpServers ?? {}));
  }, [startupConfig?.mcpServers]);
  const hasAppliedDefaults = useRef<Set<string>>(new Set());

  const [isPinned, setIsPinned] = useAtom(mcpPinnedAtom);
  const [mcpValues, setMCPValuesRaw] = useAtom(mcpValuesAtomFamily(key));
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));

  // Sync Jotai state with ephemeral agent state
  useEffect(() => {
    const mcps = ephemeralAgent?.mcp ?? [];
    if (mcps.length === 1 && mcps[0] === Constants.mcp_clear) {
      setMCPValuesRaw([]);
    } else if (mcps.length > 0) {
      // Strip out servers that are not available in the startup config
      const activeMcps = mcps.filter((mcp) => configuredServers.has(mcp));
      setMCPValuesRaw(activeMcps);
    }
  }, [ephemeralAgent?.mcp, setMCPValuesRaw, configuredServers]);

  useEffect(() => {
    setEphemeralAgent((prev) => {
      if (!isEqual(prev?.mcp, mcpValues)) {
        return { ...(prev ?? {}), mcp: mcpValues };
      }
      return prev;
    });
  }, [mcpValues, setEphemeralAgent]);

  // Apply default selections for new conversations
  useEffect(() => {
    // Skip if we've already applied defaults for this conversation
    if (hasAppliedDefaults.current.has(key)) {
      return;
    }

    // Skip if there are already selected values (user has made a selection)
    if (mcpValues.length > 0) {
      return;
    }

    // Skip if no startup config available yet
    if (!startupConfig?.mcpServers) {
      return;
    }

    // Find servers with defaultSelected: true
    const defaultServers = Object.entries(startupConfig.mcpServers)
      .filter(([, config]) => config.defaultSelected === true && config.chatMenu !== false)
      .map(([serverName]) => serverName);

    if (defaultServers.length > 0) {
      hasAppliedDefaults.current.add(key);
      setMCPValuesRaw(defaultServers);
    }
  }, [key, mcpValues.length, startupConfig, setMCPValuesRaw]);

  useEffect(() => {
    const mcpStorageKey = `${LocalStorageKeys.LAST_MCP_}${key}`;
    if (mcpValues.length > 0) {
      setTimestamp(mcpStorageKey);
    }
  }, [mcpValues, key]);

  /** Stable memoized setter */
  const setMCPValues = useCallback(
    (value: string[]) => {
      if (!Array.isArray(value)) {
        return;
      }
      setMCPValuesRaw(value);
    },
    [setMCPValuesRaw],
  );

  return {
    isPinned,
    mcpValues,
    setIsPinned,
    setMCPValues,
  };
}
