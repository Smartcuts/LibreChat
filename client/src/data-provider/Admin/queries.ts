import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { UseQueryOptions, UseInfiniteQueryOptions } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { ConversationListParams, ConversationListResponse } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';

/**
 * Hook for fetching all conversations in admin console with infinite scroll pagination
 */
export const useAdminConversationsInfiniteQuery = (
  params: ConversationListParams & { userId?: string },
  config?: UseInfiniteQueryOptions<ConversationListResponse, unknown>,
) => {
  const { userId, sortBy, sortDirection, search } = params;

  return useInfiniteQuery<ConversationListResponse>({
    queryKey: [QueryKeys.adminConversations, { userId, sortBy, sortDirection, search }],
    queryFn: ({ pageParam }) =>
      dataService.adminListConversations({
        userId,
        sortBy,
        sortDirection,
        search,
        cursor: pageParam?.toString(),
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    keepPreviousData: true,
    staleTime: 1 * 60 * 1000, // 1 minute (admin data should be fresher)
    cacheTime: 5 * 60 * 1000, // 5 minutes
    ...config,
  });
};

/**
 * Hook for fetching a single conversation with messages in admin console
 */
export const useAdminConversationQuery = <
  TData = { conversation: t.TConversation; messages: t.TMessage[] },
>(
  conversationId: string,
  config?: UseQueryOptions<
    { conversation: t.TConversation; messages: t.TMessage[] },
    unknown,
    TData
  >,
) => {
  return useQuery<{ conversation: t.TConversation; messages: t.TMessage[] }, unknown, TData>(
    [QueryKeys.adminConversation, conversationId],
    () => dataService.adminGetConversation(conversationId),
    {
      enabled: !!conversationId,
      refetchOnWindowFocus: false,
      staleTime: 1 * 60 * 1000, // 1 minute
      ...config,
    },
  );
};

/**
 * Hook for searching users by email, name, or username
 */
export const useAdminUserSearchQuery = <
  TData = Array<{
    _id: string;
    email: string;
    name?: string;
    username?: string;
    role?: string;
    createdAt?: string;
  }>,
>(
  searchQuery: string,
  limit?: number,
  config?: UseQueryOptions<
    Array<{
      _id: string;
      email: string;
      name?: string;
      username?: string;
      role?: string;
      createdAt?: string;
    }>,
    unknown,
    TData
  >,
) => {
  return useQuery<
    Array<{
      _id: string;
      email: string;
      name?: string;
      username?: string;
      role?: string;
      createdAt?: string;
    }>,
    unknown,
    TData
  >(
    [QueryKeys.adminUserSearch, searchQuery, limit],
    () => dataService.adminSearchUsers(searchQuery, limit),
    {
      enabled: searchQuery?.length > 0,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000, // 30 seconds
      ...config,
    },
  );
};
