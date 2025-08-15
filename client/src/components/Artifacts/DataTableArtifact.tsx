import React, { useState, useMemo } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Button } from '@librechat/client';
import type { Artifact } from '~/common';
import { cn } from '~/utils';

interface DataTableArtifactProps {
  artifact: Artifact & {
    data?: {
      headers?: string[];
      rows?: Array<Array<string | number | boolean | null>>;
      totalRows?: number;
      mimeType?: string;
      metadata?: Record<string, unknown>;
    };
  };
}

interface SortConfig {
  column: number;
  direction: 'asc' | 'desc';
}

export default function DataTableArtifact({ artifact }: DataTableArtifactProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const { headers = [], rows = [] } = artifact.data || {};

  // Filter rows based on search query
  const filteredRows = useMemo(() => {
    if (!searchQuery) return rows;

    const query = searchQuery.toLowerCase();
    return rows.filter((row) =>
      row.some((cell) => {
        if (cell === null || cell === undefined) return false;
        return String(cell).toLowerCase().includes(query);
      }),
    );
  }, [rows, searchQuery]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortConfig) return filteredRows;

    const sorted = [...filteredRows].sort((a, b) => {
      const aVal = a[sortConfig.column];
      const bVal = b[sortConfig.column];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (sortConfig.direction === 'asc') {
        return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      } else {
        return aStr > bStr ? -1 : aStr < bStr ? 1 : 0;
      }
    });

    return sorted;
  }, [filteredRows, sortConfig]);

  // Paginate rows
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return sortedRows.slice(start, end);
  }, [sortedRows, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(sortedRows.length / rowsPerPage);

  // Handle sorting
  const handleSort = (columnIndex: number) => {
    setSortConfig((prev) => {
      if (prev?.column === columnIndex) {
        return prev.direction === 'asc' ? { column: columnIndex, direction: 'desc' } : null;
      }
      return { column: columnIndex, direction: 'asc' };
    });
  };

  // Export functions
  const exportAsCSV = () => {
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((cell) => {
            if (cell === null || cell === undefined) return '';
            const str = String(cell);
            // Escape quotes and wrap in quotes if contains comma or quotes
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${artifact.title || 'data'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportAsJSON = () => {
    const jsonData = rows.map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${artifact.title || 'data'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col bg-surface-primary">
      {/* Header Controls */}
      <div className="border-b border-border-medium p-4">
        <div className="flex flex-col gap-3">
          {/* Search and Export */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search in table..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-border-medium bg-surface-primary py-2 pl-10 pr-3 text-sm focus:border-border-heavy focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportAsCSV}>
                <Download className="mr-1 h-4 w-4" />
                CSV
              </Button>
              <Button size="sm" variant="outline" onClick={exportAsJSON}>
                <Download className="mr-1 h-4 w-4" />
                JSON
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>
              Showing {paginatedRows.length} of {sortedRows.length} rows
              {searchQuery && ` (filtered from ${rows.length} total)`}
            </span>
            <span>{headers.length} columns</span>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-secondary">
            <tr>
              {headers.map((header, index) => (
                <th
                  key={index}
                  className="border-b border-r border-border-medium px-4 py-2 text-left font-medium text-text-primary last:border-r-0"
                >
                  <button
                    onClick={() => handleSort(index)}
                    className="flex items-center gap-1 hover:text-text-primary"
                  >
                    {header}
                    {sortConfig?.column === index &&
                      (sortConfig.direction === 'asc' ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  'border-b border-border-light hover:bg-surface-tertiary',
                  rowIndex % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-primary-alt',
                )}
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border-r border-border-light px-4 py-2 text-text-primary last:border-r-0"
                  >
                    {cell === null || cell === undefined ? (
                      <span className="text-text-tertiary">—</span>
                    ) : typeof cell === 'boolean' ? (
                      <span className={cell ? 'text-green-600' : 'text-red-600'}>
                        {String(cell)}
                      </span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-border-medium p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="rows-per-page" className="text-text-secondary">
                Rows per page:
              </label>
              <select
                id="rows-per-page"
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded border border-border-medium bg-surface-primary px-2 py-1 text-sm focus:border-border-heavy focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <span className="px-3 text-sm text-text-primary">
                Page {currentPage} of {totalPages}
              </span>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
