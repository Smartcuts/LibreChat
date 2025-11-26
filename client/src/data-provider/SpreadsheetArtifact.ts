import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult, UseMutationResult } from '@tantml:query/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type {
  CreateSpreadsheetRequest,
  UpdateSpreadsheetRequest,
  SpreadsheetArtifactResponse,
  SpreadsheetVersion,
} from 'librechat-data-provider';

// Query Keys
export const SpreadsheetQueryKeys = {
  artifact: (artifactId: string) => [QueryKeys.spreadsheetArtifact, artifactId] as const,
  versions: (artifactId: string) => [QueryKeys.spreadsheetVersions, artifactId] as const,
  list: (params?: { limit?: number; conversationId?: string }) =>
    [QueryKeys.spreadsheetList, params] as const,
};

// Create Spreadsheet Mutation
export const useCreateSpreadsheetMutation = (): UseMutationResult<
  SpreadsheetArtifactResponse,
  unknown,
  CreateSpreadsheetRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: CreateSpreadsheetRequest) => dataService.createSpreadsheetArtifact(payload),
    {
      onSuccess: (data, vars) => {
        // Cache the new artifact
        queryClient.setQueryData(SpreadsheetQueryKeys.artifact(data.artifactId), data);
        // Invalidate list queries
        queryClient.invalidateQueries([QueryKeys.spreadsheetList]);
      },
    },
  );
};

// Update Spreadsheet Mutation
export const useUpdateSpreadsheetMutation = (
  artifactId: string,
): UseMutationResult<
  SpreadsheetArtifactResponse,
  unknown,
  UpdateSpreadsheetRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: UpdateSpreadsheetRequest) =>
      dataService.updateSpreadsheetArtifact(artifactId, payload),
    {
      onSuccess: (data) => {
        // Update cached artifact
        queryClient.setQueryData(SpreadsheetQueryKeys.artifact(artifactId), data);
        // Invalidate versions list to refresh
        queryClient.invalidateQueries(SpreadsheetQueryKeys.versions(artifactId));
      },
    },
  );
};

// Get Spreadsheet Query
export const useSpreadsheetQuery = (
  artifactId: string,
  options?: { enabled?: boolean; s3Key?: string; versionId?: string },
): UseQueryResult<SpreadsheetArtifactResponse, unknown> => {
  return useQuery(
    SpreadsheetQueryKeys.artifact(artifactId),
    () => dataService.getSpreadsheetArtifact(artifactId, {
      s3Key: options?.s3Key,
      versionId: options?.versionId,
    }),
    {
      enabled: options?.enabled ?? true,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );
};

// List Versions Query
export const useSpreadsheetVersionsQuery = (
  artifactId: string,
  options?: { enabled?: boolean },
): UseQueryResult<SpreadsheetVersion[], unknown> => {
  return useQuery(
    SpreadsheetQueryKeys.versions(artifactId),
    () => dataService.listSpreadsheetVersions(artifactId),
    {
      enabled: options?.enabled ?? true,
      staleTime: 2 * 60 * 1000, // 2 minutes
    },
  );
};

// Restore Version Mutation
export const useRestoreVersionMutation = (
  artifactId: string,
): UseMutationResult<SpreadsheetArtifactResponse, unknown, { versionId: string }, unknown> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ versionId }: { versionId: string }) =>
      dataService.restoreSpreadsheetVersion(artifactId, versionId),
    {
      onSuccess: (data) => {
        // Update cached artifact
        queryClient.setQueryData(SpreadsheetQueryKeys.artifact(artifactId), data);
        // Refresh versions list
        queryClient.invalidateQueries(SpreadsheetQueryKeys.versions(artifactId));
      },
    },
  );
};

// Delete Spreadsheet Mutation
export const useDeleteSpreadsheetMutation = (): UseMutationResult<
  { success: boolean },
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((artifactId: string) => dataService.deleteSpreadsheetArtifact(artifactId), {
    onSuccess: (_, artifactId) => {
      // Remove from cache
      queryClient.removeQueries(SpreadsheetQueryKeys.artifact(artifactId));
      queryClient.removeQueries(SpreadsheetQueryKeys.versions(artifactId));
      // Invalidate list queries
      queryClient.invalidateQueries([QueryKeys.spreadsheetList]);
    },
  });
};

// List Spreadsheets Query
export const useListSpreadsheetsQuery = (params?: {
  limit?: number;
  conversationId?: string;
}): UseQueryResult<SpreadsheetArtifactResponse[], unknown> => {
  return useQuery(
    SpreadsheetQueryKeys.list(params),
    () => dataService.listSpreadsheetArtifacts(params),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );
};

// Update Title Mutation
export const useUpdateSpreadsheetTitleMutation = (
  artifactId: string,
): UseMutationResult<{ success: boolean }, unknown, string, unknown> => {
  const queryClient = useQueryClient();
  return useMutation((title: string) => dataService.updateSpreadsheetTitle(artifactId, title), {
    onSuccess: (_, title) => {
      // Update cached artifact title
      queryClient.setQueryData(
        SpreadsheetQueryKeys.artifact(artifactId),
        (old: SpreadsheetArtifactResponse | undefined) =>
          old ? { ...old, title } : old,
      );
      // Invalidate list to refresh
      queryClient.invalidateQueries([QueryKeys.spreadsheetList]);
    },
  });
};
