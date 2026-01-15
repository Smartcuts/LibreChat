import { useMemo } from 'react';
import { useGetStartupConfig } from '~/data-provider';
import { useMCPConnectionStatus } from './useMCPConnectionStatus';

interface MCPAuthRequirement {
  /** Whether chat is blocked due to missing MCP OAuth */
  isChatBlocked: boolean;
  /** List of server names that require OAuth before chat but are not connected */
  pendingAuthServers: string[];
}

/**
 * Hook to check if any MCP servers with requireAuthBeforeChat are not authenticated.
 * Returns whether chat should be blocked and which servers need authentication.
 */
export function useMCPAuthRequirement(): MCPAuthRequirement {
  const { data: startupConfig } = useGetStartupConfig();
  const { connectionStatus } = useMCPConnectionStatus({
    enabled: !!startupConfig?.mcpServers && Object.keys(startupConfig.mcpServers).length > 0,
  });

  return useMemo(() => {
    if (!startupConfig?.mcpServers) {
      return {
        isChatBlocked: false,
        pendingAuthServers: [],
      };
    }

    // Find servers that require auth before chat
    const requiredServers = Object.entries(startupConfig.mcpServers)
      .filter(([, config]) => config.oauthRequired === true)
      .map(([name]) => name);

    if (requiredServers.length === 0) {
      return {
        isChatBlocked: false,
        pendingAuthServers: [],
      };
    }

    // Don't block chat while connection status is still loading
    if (!connectionStatus) {
      return {
        isChatBlocked: false,
        pendingAuthServers: [],
      };
    }

    // Check which required servers are not connected
    const pendingAuthServers = requiredServers.filter((serverName) => {
      const status = connectionStatus[serverName];
      // Server needs auth if it's not connected
      return status?.connectionState !== 'connected';
    });

    return {
      isChatBlocked: pendingAuthServers.length > 0,
      pendingAuthServers,
    };
  }, [startupConfig?.mcpServers, connectionStatus]);
}
