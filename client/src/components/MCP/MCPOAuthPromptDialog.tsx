import React from 'react';
import { KeyRound } from 'lucide-react';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  Button,
} from '@librechat/client';
import { useLocalize } from '~/hooks';

interface MCPOAuthPromptDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  servers: Array<{ name: string; oauthUrl: string; descriptiveText?: string }>;
  onAuthorize: (serverName: string) => void;
  mcpPlaceholder?: string;
  authPromptTitle?: string;
  authPromptText?: string;
  authPromptAction?: string;
}

export default function MCPOAuthPromptDialog({
  isOpen,
  onOpenChange,
  servers,
  onAuthorize,
  mcpPlaceholder,
  authPromptTitle,
  authPromptText,
  authPromptAction,
}: MCPOAuthPromptDialogProps) {
  const localize = useLocalize();

  if (servers.length === 0) {
    return null;
  }

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent className="flex max-h-screen w-11/12 max-w-lg flex-col">
        <OGDialogHeader>
          <div className="flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            <OGDialogTitle className="text-xl">
              {authPromptTitle || `Authorize ${mcpPlaceholder || 'MCP Servers'}`}
            </OGDialogTitle>
          </div>
        </OGDialogHeader>

        <div className="space-y-4">
          {authPromptText && (
            <p className="relative -top-1 text-sm text-text-secondary">{authPromptText}</p>
          )}

          <div className="space-y-4">
            {servers.map((server) => (
              <div
                key={server.name}
                className="flex items-center justify-between rounded-lg border border-border-medium bg-surface-secondary p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                    <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">{server.name}</p>
                    <p className="text-xs text-text-secondary">
                      {server.descriptiveText || 'OAuth required'}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    onAuthorize(server.name);
                    // If there's only one server, close the dialog after clicking
                    if (servers.length === 1) {
                      onOpenChange(false);
                    }
                  }}
                  className="bg-amber-600 text-white hover:bg-amber-700"
                >
                  {authPromptAction || 'Authorize'}
                </Button>
              </div>
            ))}
          </div>

          {
            // "Later" button only shown for multiple servers because:
            //   - Single server: "Authorize" button auto-closes modal (lines 73-75)
            //   - Multiple servers: User needs explicit dismiss option without authorizing all
            servers.length > 1 && (
              <div className="flex justify-end gap-2 border-t border-border-medium pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Later
                </Button>
              </div>
            )
          }
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
