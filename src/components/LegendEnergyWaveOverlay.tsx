import React from 'react';

interface LegendEnergyWaveOverlayProps {
  testId?: string;
  accentColor?: string;
}

export const LegendEnergyWaveOverlay: React.FC<LegendEnergyWaveOverlayProps> = ({
  testId = 'qr-energy-wave-overlay',
  accentColor = '#F59E0B',
}) => {
  return (
    <div
      data-testid={testId}
      aria-hidden="true"
      className="pointer-events-none absolute -inset-2.5 sm:-inset-3 z-[6] flex items-center justify-center overflow-visible"
    >
      {/* Rotating radiant Legend League crown beams */}
      <div
        className="qr-legend-aura-rays absolute -inset-1.5 rounded-[34px] blur-md"
        style={{
          background: `conic-gradient(from 0deg, rgba(250,204,21,0.34), rgba(168,85,247,0.28), transparent 28%, rgba(250,204,21,0.26), ${accentColor}38, transparent 62%, rgba(192,132,252,0.3), rgba(250,204,21,0.3))`,
        }}
      />

      {/* Faceted League Crest Ring 1 */}
      <svg
        viewBox="0 0 240 240"
        className="qr-energy-wave-ring absolute h-[103%] w-[103%] overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`${testId}-gold-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE047" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#C084FC" stopOpacity="0.88" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.92" />
          </linearGradient>
        </defs>
        <polygon
          points="120,2 204,34 238,120 204,206 120,238 36,206 2,120 36,34"
          fill="none"
          stroke={`url(#${testId}-gold-grad)`}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </svg>

      {/* Faceted League Crest Ring 2 */}
      <svg
        viewBox="0 0 240 240"
        className="qr-energy-wave-ring-2 absolute h-full w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <polygon
          points="120,6 198,38 234,120 198,202 120,234 42,202 6,120 42,38"
          fill="none"
          stroke="#FACC15"
          strokeOpacity="0.72"
          strokeWidth="1.8"
          strokeDasharray="10 6"
          strokeLinejoin="round"
        />
      </svg>

      {/* Inner Royal Corona Ring 3 */}
      <div
        className="qr-energy-wave-ring-3 absolute inset-2 rounded-[26px] border"
        style={{
          borderColor: 'rgba(250, 204, 21, 0.55)',
          boxShadow: '0 0 24px rgba(192, 132, 252, 0.34), inset 0 0 18px rgba(250, 204, 21, 0.22)',
        }}
      />

      {/* Legend League Crest Corner Jewels & Floating Embers */}
      <span className="qr-legend-ember absolute left-4 top-2 h-2 w-2 rotate-45 rounded-[2px] bg-amber-300 shadow-[0_0_10px_#FDE047]" />
      <span
        className="qr-legend-ember absolute right-5 top-4 h-1.5 w-1.5 rotate-45 rounded-[2px] bg-fuchsia-300 shadow-[0_0_10px_#E879F9]"
        style={{ animationDelay: '0.7s' }}
      />
      <span
        className="qr-legend-ember absolute bottom-3 left-6 h-1.5 w-1.5 rotate-45 rounded-[2px] bg-amber-200 shadow-[0_0_10px_#FACC15]"
        style={{ animationDelay: '1.4s' }}
      />
      <span
        className="qr-legend-ember absolute bottom-4 right-5 h-2 w-2 rotate-45 rounded-[2px] bg-purple-300 shadow-[0_0_10px_#C084FC]"
        style={{ animationDelay: '2.1s' }}
      />
    </div>
  );
};
