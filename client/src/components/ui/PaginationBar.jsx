import { IoChevronBack, IoChevronForward } from 'react-icons/io5';
import AppSelect from './AppSelect';

export default function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  pageSizeOptions = [],
  onPageSizeChange = null,
  className = '',
}) {
  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(page * pageSize, totalItems);
  const showPageSize = pageSizeOptions.length > 0 && typeof onPageSizeChange === 'function';

  return (
    <div className={`flex flex-col gap-2 px-1 py-2 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium sm:text-sm">
        <p className="text-slate-500">
          {startItem}-{endItem} of {totalItems}
        </p>

        {showPageSize && (
          <div className="flex items-center gap-2 text-slate-500">
            <span aria-hidden="true" className="text-slate-300">|</span>
            <div className="flex items-center gap-1">
              <AppSelect
                value={String(pageSize)}
                onChange={(value) => onPageSizeChange(Number(value) || pageSize)}
                options={pageSizeOptions.map((size) => ({
                  value: String(size),
                  label: String(size),
                }))}
                menuOffset={0}
                buttonClassName="h-7 min-w-[68px] rounded-full border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-[0_3px_10px_rgba(15,23,42,0.05)] hover:border-slate-300 hover:bg-slate-50"
                menuClassName="min-w-[68px] rounded-[20px] border-slate-200 bg-white p-0 shadow-[0_8px_20px_rgba(15,23,42,0.10)]"
                optionClassName="rounded-none px-3 py-2 text-xs leading-4 first:rounded-t-[20px] last:rounded-b-[20px]"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="inline-flex h-7 items-center gap-1 rounded-[14px] border border-slate-200 bg-white px-3 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
        >
          <IoChevronBack className="text-xs" />
          Prev
        </button>

        <div className="inline-flex h-8 min-w-[42px] items-center justify-center rounded-[14px] bg-primary px-3 text-xs font-semibold text-white shadow-sm sm:text-sm">
          {page}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="inline-flex h-7 items-center gap-1 rounded-[14px] border border-slate-200 bg-white px-3 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
        >
          Next
          <IoChevronForward className="text-xs" />
        </button>
      </div>
    </div>
  );
}
