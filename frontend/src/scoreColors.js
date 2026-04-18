/**
 * Canonical score label → color mappings.
 * Import from here instead of defining locally — keeps all pages consistent.
 */

// Hex colors for inline styles (charts, SVG, canvas)
export const SCORE_HEX = {
  'Not Used':      '#f87171',   // red-400
  'Rarely Used':   '#fb923c',   // orange-400
  'Actively Used': '#facc15',   // yellow-400
  'Fully Used':    '#4ade80',   // green-400
  'Unknown':       '#6b7280',   // gray-500
}

// Tailwind class sets for badge / pill components
export const SCORE_STYLE = {
  'Not Used':      { bg: 'bg-red-900/40',    text: 'text-red-400',    border: 'border-red-800/50'    },
  'Rarely Used':   { bg: 'bg-orange-900/40', text: 'text-orange-400', border: 'border-orange-800/50' },
  'Actively Used': { bg: 'bg-yellow-900/40', text: 'text-yellow-400', border: 'border-yellow-800/50' },
  'Fully Used':    { bg: 'bg-green-900/40',  text: 'text-green-400',  border: 'border-green-800/50'  },
  'Unknown':       { bg: 'bg-gray-800/60',   text: 'text-gray-400',   border: 'border-gray-700/50'   },
}

// Tailwind text-color classes for inline text
export const SCORE_TEXT_CLASS = {
  'Not Used':      'text-red-400',
  'Rarely Used':   'text-orange-400',
  'Actively Used': 'text-yellow-400',
  'Fully Used':    'text-green-400',
  'Unknown':       'text-gray-400',
}

// Fallback hex for labels not in the map
export const SCORE_HEX_DEFAULT = '#6b7280'
