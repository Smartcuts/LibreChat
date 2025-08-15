import React, { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '~/utils';

interface CSVTableProps {
  data: string[];
  maxRows?: number;
  className?: string;
}

type SortConfig = {
  key: number;
  direction: 'asc' | 'desc';
} | null;

export default function CSVTable({ data, maxRows = 20, className }: CSVTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const { headers, rows } = useMemo(() => {
    if (data.length === 0) {
      return { headers: [], rows: [] };
    }

    // Parse CSV data
    const allRows = data.map((row) => {
      // Simple CSV parsing - handles basic cases
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < row.length; i++) {
        const char = row[i];

        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cells.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }

      if (current) {
        cells.push(current.trim());
      }

      return cells;
    });

    const headers = allRows[0] || [];
    let rows = allRows.slice(1);

    // Apply sorting if configured
    if (sortConfig !== null) {
      rows = [...rows].sort((a, b) => {
        const aVal = (a[sortConfig.key] || '') as string;
        const bVal = (b[sortConfig.key] || '') as string;

        // Try to parse as numbers first
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);

        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // Fall back to string comparison
        if (sortConfig.direction === 'asc') {
          return aVal.localeCompare(bVal);
        }
        return bVal.localeCompare(aVal);
      });
    }

    // Limit rows after sorting
    rows = rows.slice(0, maxRows);

    return { headers, rows };
  }, [data, maxRows, sortConfig]);

  const handleSort = (columnIndex: number) => {
    setSortConfig((current) => {
      if (current?.key === columnIndex) {
        if (current.direction === 'asc') {
          return { key: columnIndex, direction: 'desc' };
        }
        return null; // Reset sort
      }
      return { key: columnIndex, direction: 'asc' };
    });
  };

  if (data.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-lg border border-border-medium shadow-sm',
        className,
      )}
    >
      <div className="overflow-x-auto bg-white dark:bg-gray-900">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b-2 border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
              <th className="w-12 border-r border-gray-200 px-2 py-3 text-center text-xs font-bold text-gray-500 dark:border-gray-700 dark:text-gray-400">
                #
              </th>
              {headers.map((header, index) => (
                <th
                  key={index}
                  className="border-r border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-700 last:border-r-0 dark:border-gray-700 dark:text-gray-200"
                >
                  <button
                    onClick={() => handleSort(index)}
                    className="group flex items-center gap-1 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <span className="uppercase tracking-wider">{header}</span>
                    <span className="opacity-0 transition-opacity group-hover:opacity-100">
                      {sortConfig?.key === index ? (
                        sortConfig.direction === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900">
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  'border-b border-gray-100 transition-all dark:border-gray-800',
                  rowIndex % 2 === 0
                    ? 'bg-white dark:bg-gray-900'
                    : 'bg-gray-50/50 dark:bg-gray-850/50',
                  hoveredRow === rowIndex && 'bg-blue-50 dark:bg-blue-900/20',
                )}
                onMouseEnter={() => setHoveredRow(rowIndex)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td className="w-12 border-r border-gray-200 px-2 py-2 text-center text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  {rowIndex + 1}
                </td>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border-r border-gray-100 px-4 py-2 text-sm text-gray-700 last:border-r-0 dark:border-gray-800 dark:text-gray-300"
                    title={cell}
                  >
                    <div className="max-w-xs truncate font-mono text-xs">
                      {cell || <span className="text-gray-400 dark:text-gray-600">—</span>}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer with row count and controls */}
      <div className="flex items-center justify-between border-t-2 border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          Showing <span className="font-semibold">{rows.length}</span> of{' '}
          <span className="font-semibold">{data.length - 1}</span> rows
        </div>
        {sortConfig && (
          <button
            onClick={() => setSortConfig(null)}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Clear sort
          </button>
        )}
      </div>
    </div>
  );
}
