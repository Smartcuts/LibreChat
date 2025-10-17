import React, { memo, useCallback, useEffect, useRef } from 'react';
import { MultiSelect, MCPIcon, Spinner } from '@librechat/client';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import MCPOAuthPromptDialog from '~/components/MCP/MCPOAuthPromptDialog';
import { useBadgeRowContext } from '~/Providers';

function MCPSelectContent() {
  const { conversationId, mcpServerManager } = useBadgeRowContext();
  const {
    localize,
    isPinned,
    mcpValues,
    isInitializing,
    placeholderText,
    configuredServers,
    batchToggleServers,
    getConfigDialogProps,
    getServerStatusIconProps,
    hasAnyInitializing,
    isOAuthPromptOpen,
    oauthPromptServers,
    handleOAuthPromptAuthorize,
    handleOAuthPromptOpenChange,
    authPromptTitle,
    authPromptText,
    authPromptAction,
  } = mcpServerManager;

  const hasInitializedRef = useRef(false);

  // Auto-initialize default servers on component mount if they're selected
  useEffect(() => {
    // Only run once and only if we haven't initialized yet
    if (hasInitializedRef.current || !mcpValues || mcpValues.length === 0) {
      return;
    }

    hasInitializedRef.current = true;
    // Trigger batchToggleServers which will initialize any non-connected servers
    // Note: OAuth popups may be blocked by browser popup blockers when not triggered by direct user action
    // In that case, the UI will show the server as needing authorization and user can click to authorize
    batchToggleServers(mcpValues);
  }, [mcpValues, batchToggleServers]);

  const renderSelectedValues = useCallback(
    (values: string[], placeholder?: string) => {
      if (values.length === 0) {
        return placeholder || localize('com_ui_select') + '...';
      }
      if (values.length === 1) {
        return values[0];
      }
      return localize('com_ui_x_selected', { 0: values.length });
    },
    [localize],
  );

  const renderItemContent = useCallback(
    (serverName: string, defaultContent: React.ReactNode) => {
      const statusIconProps = getServerStatusIconProps(serverName);
      const isServerInitializing = isInitializing(serverName);

      /**
       Common wrapper for the main content (check mark + text).
       Ensures Check & Text are adjacent and the group takes available space.
        */
      const mainContentWrapper = (
        <button
          type="button"
          className={`flex flex-grow items-center rounded bg-transparent p-0 text-left transition-colors focus:outline-none ${
            isServerInitializing ? 'opacity-50' : ''
          }`}
          tabIndex={0}
          disabled={isServerInitializing}
        >
          {defaultContent}
        </button>
      );

      const statusIcon = statusIconProps && <MCPServerStatusIcon {...statusIconProps} />;

      if (statusIcon) {
        return (
          <div className="flex w-full items-center justify-between">
            {mainContentWrapper}
            <div className="ml-2 flex items-center">{statusIcon}</div>
          </div>
        );
      }

      return mainContentWrapper;
    },
    [getServerStatusIconProps, isInitializing],
  );

  if (!isPinned && mcpValues?.length === 0) {
    return null;
  }

  const configDialogProps = getConfigDialogProps();

  return (
    <>
      <MultiSelect
        items={configuredServers}
        selectedValues={mcpValues ?? []}
        setSelectedValues={batchToggleServers}
        renderSelectedValues={renderSelectedValues}
        renderItemContent={renderItemContent}
        placeholder={placeholderText}
        popoverClassName="min-w-fit"
        className="badge-icon min-w-fit"
        selectIcon={
          hasAnyInitializing ? (
            <Spinner className="icon-md" />
          ) : (
            <MCPIcon className="icon-md text-text-primary" />
          )
        }
        selectItemsClassName="border border-blue-600/50 bg-blue-500/10 hover:bg-blue-700/10"
        selectClassName={`group relative inline-flex items-center justify-center md:justify-start gap-1.5 rounded-full border text-sm font-medium transition-all md:w-full size-9 p-2 md:p-3 shadow-sm hover:shadow-md active:shadow-inner ${
          hasAnyInitializing
            ? 'border-blue-500 bg-blue-500/10 animate-pulse'
            : 'border-border-medium bg-transparent hover:bg-surface-hover'
        }`}
      />
      {configDialogProps && (
        <MCPConfigDialog {...configDialogProps} conversationId={conversationId} />
      )}
      <MCPOAuthPromptDialog
        isOpen={isOAuthPromptOpen}
        onOpenChange={handleOAuthPromptOpenChange}
        servers={oauthPromptServers}
        onAuthorize={handleOAuthPromptAuthorize}
        mcpPlaceholder={placeholderText}
        authPromptTitle={authPromptTitle}
        authPromptText={authPromptText}
        authPromptAction={authPromptAction}
      />
    </>
  );
}

function MCPSelect() {
  const { mcpServerManager } = useBadgeRowContext();
  const { configuredServers } = mcpServerManager;

  if (!configuredServers || configuredServers.length === 0) {
    return null;
  }

  return <MCPSelectContent />;
}

export default memo(MCPSelect);
