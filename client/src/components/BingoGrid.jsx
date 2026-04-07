import React from 'react';
import backgroundImage from '../Icons/2026Jan.png';
import restrictedIcon from '../Icons/restricted-icon.png';

export default function BingoGrid({ board, onCellClick }) {
  return (
    <div
      className="grid grid-cols-5 gap-2 aspect-square rounded-lg p-2"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#212326',
      }}
    >
      {board.map((cell) => {
        const isFreeSpace = cell.position === 13;
        const isEmpty = cell.pokemon_name === 'EMPTY';
        const isClickable = !isFreeSpace && !isEmpty;

        // Determine background and border color
        let bgColor = '#212326';
        let borderColor = undefined;

        if (!isFreeSpace && !isEmpty) {
          if (cell.is_restricted) {
            bgColor = '#1e3a5f';
            borderColor = '#3b82f6';
          } else if (cell.is_checked) {
            bgColor = '#16a34a';
            borderColor = '#16a34a';
          } else if (cell.is_pending) {
            bgColor = '#854d0e';
            borderColor = '#ca8a04';
          }
        }

        return (
          <div
            key={cell.id}
            onClick={() => isClickable && onCellClick?.(cell)}
            className={`
              relative rounded-lg border-2 transition-all duration-200 overflow-hidden leading-none
              ${(cell.is_checked || cell.is_restricted || cell.is_pending)
                ? 'text-white font-semibold shadow-lg'
                : 'border-gray-600 text-gray-200'
              }
              ${isFreeSpace ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold border-purple-600 flex items-center justify-center text-center aspect-square' : ''}
              ${isEmpty ? 'bg-gray-900 border-gray-700 opacity-50 flex items-center justify-center text-center aspect-square' : ''}
              ${isClickable ? 'cursor-pointer hover:scale-105' : ''}
            `}
            style={{
              backgroundColor: !isFreeSpace && !isEmpty ? bgColor : undefined,
              borderColor: !isFreeSpace && !isEmpty ? borderColor : undefined,
            }}
          >
            {!isFreeSpace && !isEmpty && cell.pokemon_gif && (
              <img
                src={cell.pokemon_gif}
                alt={cell.pokemon_name}
                className="w-full block"
                style={{ verticalAlign: 'top' }}
              />
            )}
            {(isFreeSpace || isEmpty) && (
              <span className="text-xs md:text-sm leading-tight break-words px-1">
                {cell.pokemon_name}
              </span>
            )}

            {/* Restricted approved overlay — blue tint + restricted icon */}
            {cell.is_restricted && !isFreeSpace && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-900 bg-opacity-50">
                <img src={restrictedIcon} alt="Restricted" className="w-8 h-8 object-contain" />
              </div>
            )}

            {/* Standard approved overlay — green tint + checkmark */}
            {cell.is_checked && !cell.is_restricted && !isFreeSpace && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}

            {/* Pending overlay — clock icon */}
            {cell.is_pending && !isFreeSpace && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
                <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}

            {/* Historical corner badge */}
            {cell.is_historical && !isFreeSpace && (
              <div
                className="absolute top-0.5 right-0.5 text-white font-bold leading-none rounded"
                style={{
                  fontSize: '8px',
                  padding: '1px 3px',
                  backgroundColor: 'rgba(30, 58, 138, 0.85)',
                  border: '1px solid rgba(96, 165, 250, 0.6)',
                }}
              >
                H
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
