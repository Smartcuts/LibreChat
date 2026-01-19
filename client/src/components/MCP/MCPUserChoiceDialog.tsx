import React, { useState } from 'react';
import { ListChecks } from 'lucide-react';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  Button,
  Label,
} from '@librechat/client';
import { useLocalize } from '~/hooks';
import type { PendingUserChoice } from '~/hooks/MCP/useMCPUserChoice';

interface MCPUserChoiceDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  pendingChoice: PendingUserChoice | null;
  onSubmit: (selection: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function MCPUserChoiceDialog({
  isOpen,
  onOpenChange,
  pendingChoice,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: MCPUserChoiceDialogProps) {
  const localize = useLocalize();
  const [selectedValue, setSelectedValue] = useState<string>('');

  if (!pendingChoice) {
    return null;
  }

  const { userChoice } = pendingChoice;
  const canCancel = !userChoice.required;

  const handleSubmit = () => {
    if (selectedValue) {
      onSubmit(selectedValue);
      setSelectedValue('');
    }
  };

  const handleCancel = () => {
    onCancel();
    setSelectedValue('');
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && canCancel) {
      handleCancel();
    } else if (!open && userChoice.required) {
      // Don't allow closing required dialogs
      return;
    }
    onOpenChange(open);
  };

  return (
    <OGDialog open={isOpen} onOpenChange={handleOpenChange}>
      <OGDialogContent className="flex max-h-screen w-11/12 max-w-lg flex-col [&>button]:hidden">
        <OGDialogHeader>
          <div className="flex items-center gap-3">
            <ListChecks className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <OGDialogTitle className="text-xl">
              {localize('com_ui_mcp_user_choice_title') || 'Selection Required'}
            </OGDialogTitle>
          </div>
        </OGDialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{userChoice.prompt}</p>

          <div className="space-y-2">
            {userChoice.options.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                  selectedValue === option.value
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                    : 'border-border-medium bg-surface-secondary hover:border-border-heavy'
                }`}
              >
                <input
                  type="radio"
                  name="user-choice"
                  value={option.value}
                  checked={selectedValue === option.value}
                  onChange={(e) => setSelectedValue(e.target.value)}
                  className="my-auto h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <Label className="cursor-pointer text-base font-medium text-text-primary">
                    {option.label}
                  </Label>
                  {option.description && (
                    <p className="mt-1 text-xs text-text-secondary">{option.description}</p>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2 border-t border-border-medium pt-4">
            {canCancel && (
              <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
                {localize('com_ui_cancel')}
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              disabled={!selectedValue || isSubmitting}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {isSubmitting ? 'Submitting...' : localize('com_ui_submit')}
            </Button>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
