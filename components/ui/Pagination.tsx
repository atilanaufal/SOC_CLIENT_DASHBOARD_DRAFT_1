'use client';

import React from 'react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  className?: string;
}

export function getPaginationRange(
  currentPage: number,
  totalPages: number,
  siblingCount = 1
): (number | string)[] {
  const totalPageNumbers = siblingCount * 2 + 5;

  if (totalPages <= totalPageNumbers) {
    return Array.from({ length: Math.max(1, totalPages) }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const shouldShowLeftDots = leftSiblingIndex > 2;
  const shouldShowRightDots = rightSiblingIndex < totalPages - 1;

  if (!shouldShowLeftDots && shouldShowRightDots) {
    const leftItemCount = 3 + 2 * siblingCount;
    const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
    return [...leftRange, '...', totalPages];
  }

  if (shouldShowLeftDots && !shouldShowRightDots) {
    const rightItemCount = 3 + 2 * siblingCount;
    const rightRange = Array.from(
      { length: rightItemCount },
      (_, i) => totalPages - rightItemCount + i + 1
    );
    return [1, '...', ...rightRange];
  }

  if (shouldShowLeftDots && shouldShowRightDots) {
    const middleRange = Array.from(
      { length: rightSiblingIndex - leftSiblingIndex + 1 },
      (_, i) => leftSiblingIndex + i
    );
    return [1, '...', ...middleRange, '...', totalPages];
  }

  return Array.from({ length: Math.max(1, totalPages) }, (_, i) => i + 1);
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  className = '',
}) => {
  if (totalPages <= 0) return null;

  const paginationRange = getPaginationRange(currentPage, totalPages, siblingCount);

  return (
    <div className={`flex items-center gap-1 text-xs select-none ${className}`}>
      {/* Previous Button */}
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1}
        className="px-2 py-1 rounded-md text-gray-700 font-bold hover:bg-gray-100 hover:text-[#002B9A] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-700 transition flex items-center justify-center"
        aria-label="Previous page"
      >
        ◄
      </button>

      {/* Page Numbers and Dots */}
      {paginationRange.map((pageNumber, index) => {
        if (pageNumber === '...' || typeof pageNumber === 'string') {
          return (
            <span
              key={`dots-${index}`}
              className="px-1.5 py-0.5 text-gray-400 font-black tracking-widest cursor-default select-none flex items-center"
            >
              ...
            </span>
          );
        }

        const isCurrent = pageNumber === currentPage;

        return (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber as number)}
            className={`min-w-[28px] h-7 px-2 py-0.5 rounded-md text-xs font-black transition flex items-center justify-center ${
              isCurrent
                ? 'bg-[#002B9A] text-white shadow-sm ring-1 ring-[#002B9A]'
                : 'text-gray-700 font-bold hover:bg-gray-100 hover:text-[#002B9A]'
            }`}
            aria-current={isCurrent ? 'page' : undefined}
          >
            {pageNumber}
          </button>
        );
      })}

      {/* Next Button */}
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage >= totalPages}
        className="px-2 py-1 rounded-md text-gray-700 font-bold hover:bg-gray-100 hover:text-[#002B9A] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-700 transition flex items-center justify-center"
        aria-label="Next page"
      >
        ►
      </button>
    </div>
  );
};
