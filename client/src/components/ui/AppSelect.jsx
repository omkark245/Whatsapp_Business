import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IoCheckmark, IoChevronDown } from 'react-icons/io5';

export default function AppSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select option',
  className = '',
  buttonClassName = '',
  menuClassName = '',
  optionClassName = '',
  disabled = false,
  menuOffset = 8,
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)),
    [options, value]
  );

  useEffect(() => {
    const handleOutside = (event) => {
      if (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) {
        return;
      }

      if (rootRef.current) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return undefined;

    const updatePosition = () => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const preferredHeight = 220;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const shouldOpenUpwards = spaceBelow < 220 && spaceAbove > spaceBelow;
      const menuWidth = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, window.innerWidth - viewportPadding - menuWidth)
      );
      const maxHeight = Math.max(
        120,
        Math.min(preferredHeight, shouldOpenUpwards ? spaceAbove - menuOffset : spaceBelow - menuOffset)
      );
      const visibleMenuHeight = menuRef.current
        ? Math.min(menuRef.current.scrollHeight, maxHeight)
        : maxHeight;

      setMenuStyle({
        position: 'fixed',
        left,
        top: shouldOpenUpwards
          ? Math.max(viewportPadding, rect.top - visibleMenuHeight - menuOffset)
          : Math.min(window.innerHeight - viewportPadding, rect.bottom + menuOffset),
        width: menuWidth,
        maxHeight,
        zIndex: 1000,
      });
    };

    updatePosition();
    const frameId = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [menuOffset, open, options.length]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName}`}
      >
        <span className={`min-w-0 truncate ${selectedOption ? 'text-gray-800' : 'text-gray-400'}`}>
          {selectedOption?.label || placeholder}
        </span>
        <IoChevronDown className={`flex-shrink-0 text-base text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className={`overflow-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl ${menuClassName}`}
        >
          {options.map((option) => {
            const active = String(option.value) === String(value);
            return (
              <button
                key={`${option.value}`}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  active ? 'bg-primary/10 text-primary' : 'text-gray-700 hover:bg-gray-50'
                } ${optionClassName}`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {active && <IoCheckmark className="text-base" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
