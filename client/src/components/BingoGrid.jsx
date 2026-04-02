import React from 'react';
import backgroundImage from '../Icons/2026Jan.png';

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

        return (
          <div
            key={cell.id}
            onClick={() => isClickable && onCellClick?.(cell)}
            className={`
              relative rounded-lg border-2 transition-all duration-200 overflow-hidden leading-none
              ${cell.is_checked
                ? 'text-white font-semibold shadow-lg'
                : cell.is_pending
                ? 'text-white font-semibold shadow-lg'
                : 'border-gray-600 text-gray-200'
              }
              ${isFreeSpace ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold border-purple-600 flex items-center justify-center text-center aspect-square' : ''}
              ${isEmpty ? 'bg-gray-900 border-gray-700 opacity-50 flex items-center justify-center text-center aspect-square' : ''}
              ${isClickable ? 'cursor-pointer hover:scale-105' : ''}
            `}
            style={{
              backgroundColor: !isFreeSpace && !isEmpty
                ? cell.is_checked ? '#16a34a'
                : cell.is_pending ? '#854d0e'
                : '#212326'
                : undefined,
              borderColor: !isFreeSpace && !isEmpty
                ? cell.is_checked ? '#16a34a'
                : cell.is_pending ? '#ca8a04'
                : undefined
                : undefined,
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
            {cell.is_checked && !isFreeSpace && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
            {cell.is_pending && !isFreeSpace && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
                <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
