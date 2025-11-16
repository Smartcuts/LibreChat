import { useState, useEffect } from 'react';
import { useAdminUserSearchQuery } from '~/data-provider/Admin';

interface UserSearchFilterProps {
  onUserSelect: (userId: string | null) => void;
  selectedUserId: string | null;
}

export default function UserSearchFilter({ onUserSelect, selectedUserId }: UserSearchFilterProps) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const { data: users = [], isLoading } = useAdminUserSearchQuery(debouncedSearch, 10);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleUserClick = (user: { _id: string; email: string; name?: string }) => {
    onUserSelect(user._id);
    setSearchInput(user.email);
    setIsOpen(false);
  };

  const handleClearFilter = () => {
    onUserSelect(null);
    setSearchInput('');
    setDebouncedSearch('');
  };

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        Filter by User
      </label>
      <div className="relative">
        <input
          type="text"
          placeholder="Search by email, name, or username..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
        />
        {selectedUserId && (
          <button
            onClick={handleClearFilter}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Clear filter"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && debouncedSearch && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              Searching...
            </div>
          ) : users.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              No users found
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {users.map((user) => (
                <button
                  key={user._id}
                  onClick={() => handleUserClick(user)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div className="font-medium text-gray-900 dark:text-white">
                    {user.email}
                  </div>
                  {user.name && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {user.name}
                      {user.role && ` • ${user.role}`}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
