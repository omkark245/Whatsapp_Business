import { useEffect, useMemo, useRef, useState } from 'react';
import { IoCalendarOutline, IoChevronBack, IoChevronForward, IoTimeOutline } from 'react-icons/io5';
import AppSelect from './AppSelect';

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTimeValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplayValue(date) {
  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildCalendarDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const days = [];

  for (let i = startOffset - 1; i >= 0; i -= 1) {
    days.push({ day: daysInPrevMonth - i, inCurrentMonth: false, date: new Date(year, month - 1, daysInPrevMonth - i) });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({ day, inCurrentMonth: true, date: new Date(year, month, day) });
  }

  while (days.length < 42) {
    const day = days.length - (startOffset + daysInMonth) + 1;
    days.push({ day, inCurrentMonth: false, date: new Date(year, month + 1, day) });
  }

  return days;
}

export default function SimpleDateTimePicker({
  value,
  onChange,
  placeholder = 'Pick date & time',
}) {
  const parsedValue = useMemo(() => parseDateTime(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(parsedValue || new Date());
  const rootRef = useRef(null);

  useEffect(() => {
    const handleOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const selectedDate = parsedValue || new Date(viewDate);
  const hourOptions = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: pad(hour) }));
  const minuteOptions = Array.from({ length: 60 }, (_, minute) => ({ value: String(minute), label: pad(minute) }));

  const updateSelected = (updates) => {
    const nextDate = new Date(selectedDate);
    if (typeof updates.year === 'number') nextDate.setFullYear(updates.year);
    if (typeof updates.month === 'number') nextDate.setMonth(updates.month);
    if (typeof updates.day === 'number') nextDate.setDate(updates.day);
    if (typeof updates.hour === 'number') nextDate.setHours(updates.hour);
    if (typeof updates.minute === 'number') nextDate.setMinutes(updates.minute);
    nextDate.setSeconds(0, 0);
    onChange(formatDateTimeValue(nextDate));
  };

  const calendarDays = buildCalendarDays(viewDate);
  const today = new Date();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open && parsedValue) setViewDate(parsedValue);
          setOpen((prev) => !prev);
        }}
        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-sm outline-none transition-all hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        <span className={`min-w-0 truncate ${parsedValue ? 'text-gray-800' : 'text-gray-400'}`}>
          {parsedValue ? formatDisplayValue(parsedValue) : placeholder}
        </span>
        <IoCalendarOutline className="flex-shrink-0 text-base text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-2 w-[calc(100vw-2rem)] max-w-[320px] rounded-3xl border border-gray-200 bg-white p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100"
            >
              <IoChevronBack />
            </button>
            <p className="text-base font-semibold text-gray-800">
              {viewDate.toLocaleString([], { month: 'long', year: 'numeric' })}
            </p>
            <button
              type="button"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100"
            >
              <IoChevronForward />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-gray-400">
            {WEEK_DAYS.map((label) => <span key={label}>{label}</span>)}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map(({ day, inCurrentMonth, date }) => {
              const isSelected = parsedValue
                && parsedValue.getFullYear() === date.getFullYear()
                && parsedValue.getMonth() === date.getMonth()
                && parsedValue.getDate() === date.getDate();
              const isToday = today.getFullYear() === date.getFullYear()
                && today.getMonth() === date.getMonth()
                && today.getDate() === date.getDate();

              return (
                <button
                  key={`${date.toISOString()}-${day}`}
                  type="button"
                  onClick={() => {
                    setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
                    updateSelected({ year: date.getFullYear(), month: date.getMonth(), day: date.getDate() });
                  }}
                  className={`flex h-9 items-center justify-center rounded-xl text-sm transition-colors ${
                    isSelected
                      ? 'bg-primary text-white shadow-sm shadow-primary/30'
                      : isToday
                        ? 'bg-primary/10 font-bold text-primary'
                        : inCurrentMonth
                          ? 'text-gray-700 hover:bg-primary/10'
                        : 'text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-2xl bg-gray-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <IoTimeOutline className="text-gray-500" />
              Time
            </div>
            <div className="grid grid-cols-2 gap-2">
              <AppSelect
                value={String(selectedDate.getHours())}
                onChange={(hour) => updateSelected({ hour: Number(hour) })}
                options={hourOptions}
                placeholder="Hour"
                buttonClassName="bg-white"
              />
              <AppSelect
                value={String(selectedDate.getMinutes())}
                onChange={(minute) => updateSelected({ minute: Number(minute) })}
                options={minuteOptions}
                placeholder="Minute"
                buttonClassName="bg-white"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                now.setSeconds(0, 0);
                setViewDate(now);
                onChange(formatDateTimeValue(now));
              }}
              className="text-sm font-medium text-primary transition-colors hover:text-primary-hover"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
