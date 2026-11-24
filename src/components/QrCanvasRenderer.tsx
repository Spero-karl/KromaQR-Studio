import React, { useId, useMemo } from 'react';
import { DEFAULT_LAYERS, FONT_CATALOG, UNIQUE_LOGOS } from '../data/presets';
import type { QrConfig, QrEyeShape, QrLayerId, QrModuleShape, QrSourceState } from '../types/qr';
import {
  computeCornerStickerPositions,
  generateQrMatrix,
  getCardLayout,
  getEffectiveErrorCorrection,
  hasActiveLogo,
  isFinderCell,
  isInLogoKnockoutZone,
  relativeLuminance,
} from '../utils/qrLogic';

interface QrCanvasRendererProps {
  payload: string;
  config: QrConfig;
  source: QrSourceState;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  className?: string;
}

function buildLeafPath(x: number, y: number, w: number, h: number, r: number): string {
  return [
    `M ${x + r} ${y}`,
    `H ${x + w}`,
    `V ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H ${x}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

function buildChamferPath(x: number, y: number, w: number, h: number, c: number): string {
  return [
    `M ${x + c} ${y}`,
    `H ${x + w - c}`,
    `L ${x + w} ${y + c}`,
    `V ${y + h - c}`,
    `L ${x + w - c} ${y + h}`,
    `H ${x + c}`,
    `L ${x} ${y + h - c}`,
    `V ${y + c}`,
    'Z',
  ].join(' ');
}

function renderFinderEye(
  ox: number,
  oy: number,
  cellSize: number,
  shape: QrEyeShape,
  fill: string,
  keyPrefix: string
) {
  const outerSize = 7 * cellSize;
  const innerSize = 3 * cellSize;
  const innerOffset = 2 * cellSize;
  const strokeW = cellSize;

  if (shape === 'circle') {
    const cx = ox + outerSize / 2;
    const cy = oy + outerSize / 2;
    return (
      <g key={keyPrefix}>
        <circle
          cx={cx}
          cy={cy}
          r={outerSize / 2 - strokeW / 2}
          fill="none"
          stroke={fill}
          strokeWidth={strokeW}
        />
        <circle cx={cx} cy={cy} r={innerSize / 2} fill={fill} />
      </g>
    );
  }

  if (shape === 'orbite') {
    const cx = ox + outerSize / 2;
    const cy = oy + outerSize / 2;
    return (
      <g key={keyPrefix}>
        <circle
          cx={cx}
          cy={cy}
          r={outerSize / 2 - strokeW * 0.48}
          fill="none"
          stroke={fill}
          strokeWidth={strokeW * 1.02}
        />
        <circle cx={cx} cy={cy} r={innerSize * 0.52} fill={fill} />
      </g>
    );
  }

  if (shape === 'frame') {
    const x0 = ox + strokeW / 2;
    const y0 = oy + strokeW / 2;
    const span = outerSize - strokeW;
    const arm = cellSize * 1.9;
    const r = cellSize * 0.85;
    const cornerTicks = [
      `M ${x0} ${y0 + arm} V ${y0} H ${x0 + arm}`,
      `M ${x0 + span - arm} ${y0} H ${x0 + span} V ${y0 + arm}`,
      `M ${x0 + span} ${y0 + span - arm} V ${y0 + span} H ${x0 + span - arm}`,
      `M ${x0 + arm} ${y0 + span} H ${x0} V ${y0 + span - arm}`,
    ].join(' ');
    return (
      <g key={keyPrefix}>
        <rect
          x={x0}
          y={y0}
          width={span}
          height={span}
          rx={r}
          fill="none"
          stroke={fill}
          strokeWidth={strokeW}
        />
        <path
          d={cornerTicks}
          fill="none"
          stroke={fill}
          strokeWidth={strokeW * 0.96}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <rect
          x={ox + innerOffset}
          y={oy + innerOffset}
          width={innerSize}
          height={innerSize}
          rx={cellSize * 0.72}
          fill={fill}
        />
      </g>
    );
  }

  if (shape === 'shield') {
    const outerPath = buildChamferPath(
      ox + strokeW / 2,
      oy + strokeW / 2,
      outerSize - strokeW,
      outerSize - strokeW,
      cellSize * 1.55
    );
    const innerPath = buildChamferPath(
      ox + innerOffset,
      oy + innerOffset,
      innerSize,
      innerSize,
      cellSize * 0.72
    );
    return (
      <g key={keyPrefix}>
        <path d={outerPath} fill="none" stroke={fill} strokeWidth={strokeW} />
        <path d={innerPath} fill={fill} />
      </g>
    );
  }

  if (shape === 'leaf') {
    const outerPath = buildLeafPath(
      ox + strokeW / 2,
      oy + strokeW / 2,
      outerSize - strokeW,
      outerSize - strokeW,
      cellSize * 2.1
    );
    const innerPath = buildLeafPath(
      ox + innerOffset,
      oy + innerOffset,
      innerSize,
      innerSize,
      cellSize * 0.9
    );
    return (
      <g key={keyPrefix}>
        <path d={outerPath} fill="none" stroke={fill} strokeWidth={strokeW} />
        <path d={innerPath} fill={fill} />
      </g>
    );
  }

  const outerRx = shape === 'rounded' ? cellSize * 1.55 : 0;
  const innerRx = shape === 'rounded' ? cellSize * 0.65 : 0;

  return (
    <g key={keyPrefix}>
      <rect
        x={ox + strokeW / 2}
        y={oy + strokeW / 2}
        width={outerSize - strokeW}
        height={outerSize - strokeW}
        rx={outerRx}
        fill="none"
        stroke={fill}
        strokeWidth={strokeW}
      />
      <rect
        x={ox + innerOffset}
        y={oy + innerOffset}
        width={innerSize}
        height={innerSize}
        rx={innerRx}
        fill={fill}
      />
    </g>
  );
}

function buildLiquidModulePath(
  modules: boolean[][],
  row: number,
  col: number,
  x: number,
  y: number,
  s: number,
  size: number,
  logoSizeRatio: number,
  logoActive: boolean
): string {
  const hasNeighbor = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return false;
    if (isFinderCell(r, c, size)) return false;
    if (isInLogoKnockoutZone(r, c, size, logoSizeRatio, logoActive)) return false;
    return modules[r][c];
  };

  const top = hasNeighbor(row - 1, col);
  const right = hasNeighbor(row, col + 1);
  const bottom = hasNeighbor(row + 1, col);
  const left = hasNeighbor(row, col - 1);

  const rTL = !top && !left ? s * 0.44 : 0;
  const rTR = !top && !right ? s * 0.44 : 0;
  const rBR = !bottom && !right ? s * 0.44 : 0;
  const rBL = !bottom && !left ? s * 0.44 : 0;

  const pad = 0.16;
  const x0 = x - (left ? pad : 0);
  const y0 = y - (top ? pad : 0);
  const w = s + (left ? pad : 0) + (right ? pad : 0);
  const h = s + (top ? pad : 0) + (bottom ? pad : 0);

  return [
    `M ${x0 + rTL} ${y0}`,
    `H ${x0 + w - rTR}`,
    rTR ? `A ${rTR} ${rTR} 0 0 1 ${x0 + w} ${y0 + rTR}` : `L ${x0 + w} ${y0}`,
    `V ${y0 + h - rBR}`,
    rBR ? `A ${rBR} ${rBR} 0 0 1 ${x0 + w - rBR} ${y0 + h}` : `L ${x0 + w} ${y0 + h}`,
    `H ${x0 + rBL}`,
    rBL ? `A ${rBL} ${rBL} 0 0 1 ${x0} ${y0 + h - rBL}` : `L ${x0} ${y0 + h}`,
    `V ${y0 + rTL}`,
    rTL ? `A ${rTL} ${rTL} 0 0 1 ${x0 + rTL} ${y0}` : `L ${x0} ${y0}`,
    'Z',
  ].join(' ');
}

function renderDataModule(
  shape: QrModuleShape,
  modules: boolean[][],
  row: number,
  col: number,
  x: number,
  y: number,
  cellSize: number,
  size: number,
  logoSizeRatio: number,
  logoActive: boolean,
  fill: string
) {
  const key = `m-${row}-${col}`;

  if (shape === 'dots') {
    return (
      <circle
        key={key}
        cx={x + cellSize / 2}
        cy={y + cellSize / 2}
        r={cellSize * 0.495}
        fill={fill}
      />
    );
  }

  if (shape === 'starburst') {
    const cx = x + cellSize / 2;
    const cy = y + cellSize / 2;
    const outer = cellSize * 0.55;
    const inner = cellSize * 0.34;
    const d = [
      `M ${cx} ${cy - outer}`,
      `L ${cx + inner} ${cy - inner}`,
      `L ${cx + outer} ${cy}`,
      `L ${cx + inner} ${cy + inner}`,
      `L ${cx} ${cy + outer}`,
      `L ${cx - inner} ${cy + inner}`,
      `L ${cx - outer} ${cy}`,
      `L ${cx - inner} ${cy - inner}`,
      'Z',
    ].join(' ');
    return <path key={key} d={d} fill={fill} />;
  }

  if (shape === 'mosaic') {
    const hash = (row * 7 + col * 13) % 5;
    const inset = hash === 0 ? cellSize * 0.09 : hash === 2 ? cellSize * 0.06 : cellSize * 0.02;
    const rx = hash === 1 ? cellSize * 0.3 : cellSize * 0.08;
    const opacity = hash === 3 ? 0.92 : 1;
    return (
      <rect
        key={key}
        x={x + inset}
        y={y + inset}
        width={cellSize - inset * 2}
        height={cellSize - inset * 2}
        rx={rx}
        fill={fill}
        fillOpacity={opacity}
      />
    );
  }

  if (shape === 'capsule') {
    const isData = (r: number, c: number) => {
      if (r < 0 || c < 0 || r >= size || c >= size) return false;
      if (isFinderCell(r, c, size)) return false;
      if (isInLogoKnockoutZone(r, c, size, logoSizeRatio, logoActive)) return false;
      return modules[r][c];
    };
    const left = isData(row, col - 1);
    const right = isData(row, col + 1);
    const padY = cellSize * 0.055;
    const h = cellSize - padY * 2;
    const r = h / 2;

    if (!left && !right) {
      return (
        <circle
          key={key}
          cx={x + cellSize / 2}
          cy={y + cellSize / 2}
          r={r}
          fill={fill}
        />
      );
    }

    const rL = left ? 0 : r;
    const rR = right ? 0 : r;
    const x0 = x - (left ? 0.2 : -cellSize * 0.04);
    const x1 = x + cellSize + (right ? 0.2 : -cellSize * 0.04);
    const y0 = y + padY;
    const y1 = y0 + h;

    const d = [
      `M ${x0 + rL} ${y0}`,
      `H ${x1 - rR}`,
      rR ? `A ${rR} ${rR} 0 0 1 ${x1} ${y0 + rR}` : `L ${x1} ${y0}`,
      `V ${y1 - rR}`,
      rR ? `A ${rR} ${rR} 0 0 1 ${x1 - rR} ${y1}` : `L ${x1} ${y1}`,
      `H ${x0 + rL}`,
      rL ? `A ${rL} ${rL} 0 0 1 ${x0} ${y1 - rL}` : `L ${x0} ${y1}`,
      `V ${y0 + rL}`,
      rL ? `A ${rL} ${rL} 0 0 1 ${x0 + rL} ${y0}` : `L ${x0} ${y0}`,
      'Z',
    ].join(' ');

    return <path key={key} d={d} fill={fill} />;
  }

  if (shape === 'liquid') {
    const d = buildLiquidModulePath(
      modules,
      row,
      col,
      x,
      y,
      cellSize,
      size,
      logoSizeRatio,
      logoActive
    );
    return <path key={key} d={d} fill={fill} />;
  }

  if (shape === 'rounded') {
    const inset = cellSize * 0.06;
    return (
      <rect
        key={key}
        x={x + inset}
        y={y + inset}
        width={cellSize - inset * 2}
        height={cellSize - inset * 2}
        rx={cellSize * 0.28}
        fill={fill}
      />
    );
  }

  return (
    <rect
      key={key}
      x={x}
      y={y}
      width={cellSize + 0.06}
      height={cellSize + 0.06}
      fill={fill}
    />
  );
}

export const QrCanvasRenderer: React.FC<QrCanvasRendererProps> = ({
  payload,
  config,
  source,
  svgRef,
  className = '',
}) => {
  const rawId = useId().replace(/:/g, '');
  const uid = `qr-${rawId}`;

  const logoActive = hasActiveLogo(config, source);
  const ecLevel = getEffectiveErrorCorrection(config, source);

  const matrix = useMemo(() => {
    if (!payload || !payload.trim()) return null;
    return generateQrMatrix(payload, ecLevel);
  }, [payload, ecLevel]);

  const layout = useMemo(() => getCardLayout(config.frameStyle), [config.frameStyle]);

  if (!matrix) {
    return null;
  }

  const totalCells = matrix.size + config.margin * 2;
  const cellSize = layout.qrSize / totalCells;
  const matrixOriginX = layout.qrX + config.margin * cellSize;
  const matrixOriginY = layout.qrY + config.margin * cellSize;

  const fgFill =
    config.gradientType === 'solid'
      ? config.foregroundColor
      : `url(#${uid}-fg-grad)`;
  const eyeFill = config.useCustomEyeColor ? config.eyeColor : fgFill;

  const fontCss = FONT_CATALOG[config.fontId]?.cssFamily || FONT_CATALOG.bricolage.cssFamily;
  const subtitleFontCss =
    FONT_CATALOG[config.subtitleFontId]?.cssFamily || fontCss;
  const titleSize = Math.min(30, Math.max(14, config.titleSize || 21));
  const subtitleSize = Math.min(20, Math.max(10, config.subtitleSize || 13));
  const titleWeight = config.titleWeight || 700;
  const titleFontStyle = config.titleItalic ? 'italic' : 'normal';
  const rawTitle = (config.titleText || 'Mon Code QR').slice(0, 34);
  const displayTitle = config.titleUppercase ? rawTitle.toUpperCase() : rawTitle;
  const rawSubtitle = (config.subtitleText || 'Scannez pour découvrir').slice(0, 42);
  const titleOffsetY = config.titleOffsetY || 0;

  const textAlign = config.textAlign || 'center';
  const textAnchor =
    textAlign === 'left' ? 'start' : textAlign === 'right' ? 'end' : 'middle';
  const hasTopLeftCorner =
    config.cornerStickerPlacement === 'all-4' ||
    config.cornerStickerPlacement === 'top-2' ||
    config.cornerStickerPlacement === 'diagonal';
  const hasTopRightCorner =
    config.cornerStickerPlacement === 'all-4' ||
    config.cornerStickerPlacement === 'top-2';
  const hasBottomLeftCorner =
    config.cornerStickerPlacement === 'all-4' ||
    config.cornerStickerPlacement === 'bottom-2';
  const hasBottomRightCorner =
    config.cornerStickerPlacement === 'all-4' ||
    config.cornerStickerPlacement === 'bottom-2' ||
    config.cornerStickerPlacement === 'diagonal' ||
    config.cornerStickerPlacement === 'bottom-right';

  const topTextX =
    textAlign === 'center'
      ? layout.width / 2
      : textAlign === 'left'
      ? hasTopLeftCorner
        ? 70
        : 32
      : hasTopRightCorner
      ? layout.width - 70
      : layout.width - 32;

  const bottomTextX =
    textAlign === 'center'
      ? layout.width / 2
      : textAlign === 'left'
      ? hasBottomLeftCorner
        ? 70
        : 32
      : hasBottomRightCorner
      ? layout.width - 70
      : layout.width - 32;

  const intensity = config.filterIntensity / 100;

  const activeFilterAttr =
    config.filter === 'none' || config.filter === 'halftone'
      ? undefined
      : `url(#${uid}-fx-${config.filter})`;

  const angleRad = ((config.gradientAngle - 90) * Math.PI) / 180;
  const x1 = 50 - Math.cos(angleRad) * 50;
  const y1 = 50 - Math.sin(angleRad) * 50;
  const x2 = 50 + Math.cos(angleRad) * 50;
  const y2 = 50 + Math.sin(angleRad) * 50;

  const matrixPixelSize = matrix.size * cellSize;
  const logoSpan = matrixPixelSize * config.logoSize;
  const logoCenterX = matrixOriginX + matrixPixelSize / 2;
  const logoCenterY = matrixOriginY + matrixPixelSize / 2;
  const logoVisualCenterX = logoCenterX + (config.logoOffsetX || 0);
  const logoVisualCenterY = logoCenterY + (config.logoOffsetY || 0);
  const logoX = logoVisualCenterX - logoSpan / 2;
  const logoY = logoVisualCenterY - logoSpan / 2;
  const logoRotation = config.logoRotation || 0;

  const activeRasterLogo = config.customLogoDataUrl || null;

  const selectedVectorLogo = UNIQUE_LOGOS.find((l) => l.id === config.logoId) || null;
  const activeCenterEmoji =
    !activeRasterLogo && !selectedVectorLogo && config.centerEmoji?.trim()
      ? config.centerEmoji.trim()
      : null;

  const accentColor = config.useCustomEyeColor ? config.eyeColor : config.foregroundSecondaryColor;

  const cornerPoints = useMemo(
    () =>
      computeCornerStickerPositions(
        config.cornerStickerPlacement || 'none',
        config.frameStyle,
        layout,
        config.cornerStickerOffset || 0
      ),
    [config.cornerStickerPlacement, config.frameStyle, layout, config.cornerStickerOffset]
  );

  const cornerVectorSticker = useMemo(
    () => UNIQUE_LOGOS.find((l) => l.id === config.cornerStickerVectorId) || UNIQUE_LOGOS[1],
    [config.cornerStickerVectorId]
  );
  const cornerScale = config.cornerStickerScale || 1;
  const cornerColor = config.cornerStickerColor || accentColor;
  const cornerExtraRot = config.cornerStickerRotation || 0;

  const layersOrder =
    Array.isArray(config.layers) && config.layers.length > 0 ? config.layers : DEFAULT_LAYERS;

  const isLayerVisible = (id: QrLayerId) => {
    const found = layersOrder.find((l) => l.id === id);
    return found ? found.visible : true;
  };

  const renderFrameLayer = () => {
    if (!isLayerVisible('frame')) return null;
    const borderW = config.borderWidth || 0;
    const borderCol = config.borderColor || accentColor;

    return (
      <g key="layer-frame" data-card-chrome="true">
        {/* Glass Prism Decor */}
        {config.frameStyle === 'glass' && (
          <rect
            x="12"
            y="12"
            width={layout.width - 24}
            height={layout.height - 24}
            rx={Math.max(8, config.cornerRadius - 6)}
            fill="none"
            stroke={accentColor}
            strokeOpacity="0.35"
            strokeWidth="1.5"
          />
        )}

        {/* Smoked Glass Luxury Frame */}
        {config.frameStyle === 'smoked-glass' && (
          <g>
            <rect
              x="10"
              y="10"
              width={layout.width - 20}
              height={layout.height - 20}
              rx={Math.max(10, config.cornerRadius - 4)}
              fill={`url(#${uid}-smoked-sheen)`}
              stroke="#FFFFFF"
              strokeOpacity="0.16"
              strokeWidth="1.2"
            />
            <line
              x1="28"
              y1="66"
              x2={layout.width - 28}
              y2="66"
              stroke="#FFFFFF"
              strokeOpacity="0.14"
              strokeWidth="1"
            />
          </g>
        )}

        {/* Signature Gallery Mat Decor */}
        {config.frameStyle === 'signature' && (
          <g stroke={config.cardTextColor} strokeOpacity="0.18" strokeWidth="1">
            <rect
              x="14"
              y="14"
              width={layout.width - 28}
              height={layout.height - 28}
              rx={Math.max(6, config.cornerRadius - 8)}
              fill="none"
            />
            <line x1="28" y1="62" x2={layout.width - 28} y2="62" />
            <path d="M 24 28 H 32 M 28 24 V 32" />
            <path d={`M ${layout.width - 32} 28 H ${layout.width - 24} M ${layout.width - 28} 24 V 32`} />
          </g>
        )}

        {/* VIP Prestige Double Metallic Frame */}
        {config.frameStyle === 'vip-gold' && (
          <g>
            <rect
              x="12"
              y="12"
              width={layout.width - 24}
              height={layout.height - 24}
              rx={Math.max(8, config.cornerRadius - 6)}
              fill="none"
              stroke={borderCol}
              strokeOpacity="0.72"
              strokeWidth="1.6"
            />
            <rect
              x="18"
              y="18"
              width={layout.width - 36}
              height={layout.height - 36}
              rx={Math.max(6, config.cornerRadius - 10)}
              fill="none"
              stroke={borderCol}
              strokeOpacity="0.34"
              strokeWidth="0.9"
            />
            {/* Engraved Diamond Corner Marks */}
            <polygon points={`28,24 32,28 28,32 24,28`} fill={borderCol} fillOpacity="0.85" />
            <polygon
              points={`${layout.width - 28},24 ${layout.width - 24},28 ${layout.width - 28},32 ${layout.width - 32},28`}
              fill={borderCol}
              fillOpacity="0.85"
            />
            {config.editionLabel && (
              <text
                x={layout.width / 2}
                y={layout.height - 24}
                textAnchor="middle"
                fill={borderCol}
                fillOpacity="0.88"
                style={{
                  fontFamily: FONT_CATALOG.mono.cssFamily,
                  fontSize: '9px',
                  fontWeight: 600,
                  letterSpacing: '0.18em',
                }}
              >
                {config.editionLabel.slice(0, 32)}
              </text>
            )}
          </g>
        )}

        {/* Limited Collector Archival Frame */}
        {config.frameStyle === 'limited' && (
          <g>
            <rect
              x="13"
              y="13"
              width={layout.width - 26}
              height={layout.height - 26}
              rx={Math.max(8, config.cornerRadius - 6)}
              fill="none"
              stroke={accentColor}
              strokeOpacity="0.48"
              strokeWidth="1.4"
            />
            <line
              x1="32"
              y1="66"
              x2={layout.width - 32}
              y2="66"
              stroke={accentColor}
              strokeOpacity="0.28"
              strokeWidth="1"
            />
            {config.editionLabel && (
              <text
                x={layout.width / 2}
                y={layout.height - 24}
                textAnchor="middle"
                fill={config.cardTextColor}
                fillOpacity="0.62"
                style={{
                  fontFamily: FONT_CATALOG.mono.cssFamily,
                  fontSize: '9px',
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                }}
              >
                {config.editionLabel.slice(0, 32)}
              </text>
            )}
          </g>
        )}

        {/* Ticket Perforation Line */}
        {config.frameStyle === 'ticket' && (
          <line
            x1="22"
            y1="396"
            x2={layout.width - 22}
            y2="396"
            stroke={config.cardTextColor}
            strokeOpacity="0.24"
            strokeWidth="1.5"
            strokeDasharray="5 5"
          />
        )}

        {/* Polaroid hairline */}
        {config.frameStyle === 'polaroid' && (
          <rect
            x={layout.qrX}
            y={layout.qrY}
            width={layout.qrSize}
            height={layout.qrSize}
            rx={Math.max(8, config.cornerRadius * 0.55)}
            fill="none"
            stroke={config.cardTextColor}
            strokeOpacity="0.1"
            strokeWidth="1"
          />
        )}

        {/* Custom Outer Card Border */}
        {borderW > 0 && config.frameStyle !== 'none' && (
          <rect
            x={borderW / 2}
            y={borderW / 2}
            width={layout.width - borderW}
            height={layout.height - borderW}
            rx={Math.max(0, config.cornerRadius - borderW / 2)}
            fill="none"
            stroke={borderCol}
            strokeWidth={borderW}
          />
        )}
      </g>
    );
  };

  const renderModulesLayer = () => {
    if (!isLayerVisible('modules')) return null;
    return (
      <g key="layer-modules" clipPath={`url(#${uid}-qr-clip)`}>
        <rect
          data-qr-bg="true"
          x={layout.qrX}
          y={layout.qrY}
          width={layout.qrSize}
          height={layout.qrSize}
          fill={config.qrBackgroundColor}
        />

        {/* Three Finder Eyes */}
        {renderFinderEye(
          matrixOriginX,
          matrixOriginY,
          cellSize,
          config.eyeShape,
          eyeFill,
          `${uid}-tl`
        )}
        {renderFinderEye(
          matrixOriginX + (matrix.size - 7) * cellSize,
          matrixOriginY,
          cellSize,
          config.eyeShape,
          eyeFill,
          `${uid}-tr`
        )}
        {renderFinderEye(
          matrixOriginX,
          matrixOriginY + (matrix.size - 7) * cellSize,
          cellSize,
          config.eyeShape,
          eyeFill,
          `${uid}-bl`
        )}

        {/* Data Modules */}
        <g>
          {matrix.modules.map((rowArr, r) =>
            rowArr.map((isDark, c) => {
              if (!isDark) return null;
              if (isFinderCell(r, c, matrix.size)) return null;
              if (
                isInLogoKnockoutZone(
                  r,
                  c,
                  matrix.size,
                  config.logoSize,
                  logoActive
                )
              ) {
                return null;
              }
              const mx = matrixOriginX + c * cellSize;
              const my = matrixOriginY + r * cellSize;
              return renderDataModule(
                config.moduleShape,
                matrix.modules,
                r,
                c,
                mx,
                my,
                cellSize,
                matrix.size,
                config.logoSize,
                logoActive,
                fgFill
              );
            })
          )}
        </g>

        {config.filter === 'halftone' && (
          <rect
            x={layout.qrX}
            y={layout.qrY}
            width={layout.qrSize}
            height={layout.qrSize}
            fill={`url(#${uid}-halftone-pat)`}
            pointerEvents="none"
          />
        )}
      </g>
    );
  };

  const renderCenterLogoLayer = () => {
    if (!isLayerVisible('centerLogo') || !logoActive) return null;
    return (
      <g
        key="layer-centerLogo"
        clipPath={`url(#${uid}-qr-clip)`}
        transform={
          logoRotation !== 0
            ? `rotate(${logoRotation} ${logoVisualCenterX} ${logoVisualCenterY})`
            : undefined
        }
      >
        {config.logoKnockout === 'circle' && (
          <circle
            cx={logoVisualCenterX}
            cy={logoVisualCenterY}
            r={logoSpan * 0.52}
            fill={config.qrBackgroundColor}
          />
        )}
        {config.logoKnockout === 'squircle' && (
          <rect
            x={logoX}
            y={logoY}
            width={logoSpan}
            height={logoSpan}
            rx={logoSpan * 0.28}
            fill={config.qrBackgroundColor}
          />
        )}
        {config.logoKnockout === 'diamond' && (
          <polygon
            points={`${logoVisualCenterX},${logoY - logoSpan * 0.04} ${logoX + logoSpan * 1.04},${logoVisualCenterY} ${logoVisualCenterX},${logoY + logoSpan * 1.04} ${logoX - logoSpan * 0.04},${logoVisualCenterY}`}
            fill={config.qrBackgroundColor}
          />
        )}

        {activeRasterLogo ? (
          <image
            href={activeRasterLogo}
            x={logoX + logoSpan * 0.06}
            y={logoY + logoSpan * 0.06}
            width={logoSpan * 0.88}
            height={logoSpan * 0.88}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${uid}-logo-clip)`}
          />
        ) : selectedVectorLogo ? (
          <g
            transform={`translate(${logoX + logoSpan * 0.15}, ${logoY + logoSpan * 0.15}) scale(${(logoSpan * 0.7) / 48})`}
          >
            {selectedVectorLogo.circles?.map((circle, idx) => (
              <circle
                key={`lc-${idx}`}
                cx={circle.cx}
                cy={circle.cy}
                r={circle.r}
                fill={
                  circle.fill === false
                    ? config.qrBackgroundColor
                    : circle.fill
                    ? config.logoColor
                    : 'none'
                }
                stroke={circle.stroke ? config.logoColor : 'none'}
                strokeWidth={circle.strokeWidth || 0}
              />
            ))}
            {selectedVectorLogo.paths.map((p, idx) => (
              <path
                key={`lp-${idx}`}
                d={p.d}
                fill={p.fill ? config.logoColor : 'none'}
                stroke={p.stroke ? config.logoColor : 'none'}
                strokeWidth={p.strokeWidth || 0}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={p.opacity ?? 1}
              />
            ))}
            {selectedVectorLogo.id === 'monogram' && (
              <text
                x="24"
                y="24"
                dy="0.35em"
                textAnchor="middle"
                fill={config.logoColor}
                style={{
                  fontFamily: fontCss,
                  fontSize: (config.monogramText || 'KQ').length > 2 ? '13px' : '17px',
                  fontWeight: 700,
                }}
              >
                {(config.monogramText || 'KQ').slice(0, 3).toUpperCase()}
              </text>
            )}
          </g>
        ) : activeCenterEmoji ? (
          <text
            data-testid="qr-center-emoji"
            x={logoVisualCenterX}
            y={logoVisualCenterY}
            dominantBaseline="central"
            textAnchor="middle"
            style={{
              fontSize: `${Math.round(logoSpan * 0.62)}px`,
              lineHeight: 1,
            }}
          >
            {activeCenterEmoji}
          </text>
        ) : null}
      </g>
    );
  };

  const renderCornerStickersLayer = () => {
    if (!isLayerVisible('cornerStickers') || cornerPoints.length === 0) return null;
    return (
      <g key="layer-cornerStickers" data-testid="qr-corner-stickers" data-card-chrome="true">
        {cornerPoints.map((pt) => {
          const badgeRadius = 15 * cornerScale;
          const iconBox = 24 * cornerScale;
          return (
            <g
              key={pt.corner}
              transform={`translate(${pt.x}, ${pt.y}) rotate(${pt.rotation + cornerExtraRot})`}
            >
              {pt.needsBacking && (
                <circle
                  cx={0}
                  cy={0}
                  r={badgeRadius}
                  fill={config.cardBackgroundColor}
                  stroke={config.cardTextColor}
                  strokeOpacity="0.14"
                  strokeWidth="1.2"
                />
              )}

              {config.cornerStickerKind === 'emoji' ? (
                <text
                  x={0}
                  y={0}
                  dominantBaseline="central"
                  textAnchor="middle"
                  style={{
                    fontSize: `${Math.round(21 * cornerScale)}px`,
                    lineHeight: 1,
                  }}
                >
                  {config.cornerStickerEmoji || '✨'}
                </text>
              ) : (
                <g transform={`translate(${-iconBox / 2}, ${-iconBox / 2}) scale(${iconBox / 48})`}>
                  {cornerVectorSticker.circles?.map((circle, idx) => (
                    <circle
                      key={`sc-${idx}`}
                      cx={circle.cx}
                      cy={circle.cy}
                      r={circle.r}
                      fill={
                        circle.fill === false
                          ? config.cardBackgroundColor
                          : circle.fill
                          ? cornerColor
                          : 'none'
                      }
                      stroke={circle.stroke ? cornerColor : 'none'}
                      strokeWidth={circle.strokeWidth || 0}
                    />
                  ))}
                  {cornerVectorSticker.paths.map((p, idx) => (
                    <path
                      key={`sp-${idx}`}
                      d={p.d}
                      fill={p.fill ? cornerColor : 'none'}
                      stroke={p.stroke ? cornerColor : 'none'}
                      strokeWidth={p.strokeWidth || 0}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={p.opacity ?? 1}
                    />
                  ))}
                  {cornerVectorSticker.id === 'monogram' && (
                    <text
                      x="24"
                      y="24"
                      dy="0.35em"
                      textAnchor="middle"
                      fill={cornerColor}
                      style={{
                        fontFamily: fontCss,
                        fontSize: (config.monogramText || 'KQ').length > 2 ? '13px' : '17px',
                        fontWeight: 700,
                      }}
                    >
                      {(config.monogramText || 'KQ').slice(0, 3).toUpperCase()}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  const renderTypographyLayer = () => {
    if (!isLayerVisible('typography')) return null;
    const isTopTitleFrame =
      config.frameStyle === 'signature' ||
      config.frameStyle === 'glass' ||
      config.frameStyle === 'smoked-glass' ||
      config.frameStyle === 'vip-gold' ||
      config.frameStyle === 'limited';
    const isBottomTitleFrame =
      config.frameStyle === 'polaroid' || config.frameStyle === 'ticket';

    const topTitleY =
      config.frameStyle === 'glass' ||
      config.frameStyle === 'smoked-glass' ||
      config.frameStyle === 'vip-gold' ||
      config.frameStyle === 'limited'
        ? 50 + titleOffsetY
        : 46 + titleOffsetY;

    const topSubtitleY =
      config.frameStyle === 'vip-gold' || config.frameStyle === 'limited'
        ? layout.height - 52
        : 462;

    return (
      <g key="layer-typography" data-card-chrome="true">
        {isTopTitleFrame && (
          <>
            <text
              data-testid="qr-card-title"
              x={topTextX}
              y={topTitleY}
              textAnchor={textAnchor}
              fill={config.cardTextColor}
              style={{
                fontFamily: fontCss,
                fontSize: `${titleSize}px`,
                fontWeight: titleWeight,
                fontStyle: titleFontStyle,
                letterSpacing: config.titleUppercase ? '0.04em' : '-0.015em',
              }}
            >
              {displayTitle}
            </text>
            <text
              data-testid="qr-card-subtitle"
              x={bottomTextX}
              y={topSubtitleY}
              textAnchor={textAnchor}
              fill={config.cardTextColor}
              fillOpacity="0.72"
              style={{
                fontFamily: subtitleFontCss,
                fontSize: `${subtitleSize}px`,
                fontWeight: 500,
              }}
            >
              {rawSubtitle}
            </text>
          </>
        )}

        {isBottomTitleFrame && (
          <g>
            <text
              data-testid="qr-card-title"
              x={bottomTextX}
              y={(config.frameStyle === 'ticket' ? 444 : 426) + titleOffsetY}
              textAnchor={textAnchor}
              fill={config.cardTextColor}
              style={{
                fontFamily: fontCss,
                fontSize: `${titleSize}px`,
                fontWeight: titleWeight,
                fontStyle: titleFontStyle,
                letterSpacing: config.titleUppercase ? '0.04em' : '-0.01em',
              }}
            >
              {displayTitle}
            </text>
            <text
              data-testid="qr-card-subtitle"
              x={bottomTextX}
              y={config.frameStyle === 'ticket' ? 476 : 458}
              textAnchor={textAnchor}
              fill={config.cardTextColor}
              fillOpacity="0.66"
              style={{
                fontFamily: subtitleFontCss,
                fontSize: `${subtitleSize}px`,
                fontWeight: 500,
              }}
            >
              {rawSubtitle}
            </text>
          </g>
        )}

        {/* Custom Positioned Text Overlays */}
        {(config.extraTexts || []).map((overlay) => {
          const ox = (overlay.xPercent / 100) * layout.width;
          const oy = (overlay.yPercent / 100) * layout.height;
          const oFont = FONT_CATALOG[overlay.fontId]?.cssFamily || fontCss;
          return (
            <text
              key={overlay.id}
              data-testid={`extra-text-${overlay.id}`}
              x={ox}
              y={oy}
              textAnchor="middle"
              fill={overlay.color}
              transform={
                overlay.rotation ? `rotate(${overlay.rotation} ${ox} ${oy})` : undefined
              }
              style={{
                fontFamily: oFont,
                fontSize: `${overlay.fontSize}px`,
                fontWeight: 600,
              }}
            >
              {overlay.text}
            </text>
          );
        })}
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      data-testid="qr-svg"
      data-matrix-size={matrix.size}
      data-ec-level={ecLevel}
      data-qr-x={layout.qrX}
      data-qr-y={layout.qrY}
      data-qr-size={layout.qrSize}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className={`w-full h-auto select-none ${className}`}
      role="img"
      aria-label={`Code QR personnalisé : ${config.titleText || payload}`}
    >
      <defs>
        <clipPath id={`${uid}-card-clip`}>
          {config.frameStyle === 'ticket' ? (
            <path
              d={[
                `M ${config.cornerRadius} 0`,
                `H ${layout.width - config.cornerRadius}`,
                `Q ${layout.width} 0 ${layout.width} ${config.cornerRadius}`,
                `V 382`,
                `A 14 14 0 0 0 ${layout.width} 410`,
                `V ${layout.height - config.cornerRadius}`,
                `Q ${layout.width} ${layout.height} ${layout.width - config.cornerRadius} ${layout.height}`,
                `H ${config.cornerRadius}`,
                `Q 0 ${layout.height} 0 ${layout.height - config.cornerRadius}`,
                `V 410`,
                `A 14 14 0 0 0 0 382`,
                `V ${config.cornerRadius}`,
                `Q 0 0 ${config.cornerRadius} 0`,
                'Z',
              ].join(' ')}
            />
          ) : (
            <rect
              x="0"
              y="0"
              width={layout.width}
              height={layout.height}
              rx={config.cornerRadius}
            />
          )}
        </clipPath>

        <clipPath id={`${uid}-qr-clip`}>
          <rect
            x={layout.qrX}
            y={layout.qrY}
            width={layout.qrSize}
            height={layout.qrSize}
            rx={Math.max(8, config.cornerRadius * 0.55)}
          />
        </clipPath>

        <clipPath id={`${uid}-logo-clip`}>
          {config.logoKnockout === 'circle' ? (
            <circle cx={logoVisualCenterX} cy={logoVisualCenterY} r={logoSpan * 0.44} />
          ) : config.logoKnockout === 'diamond' ? (
            <polygon
              points={`${logoVisualCenterX},${logoY + logoSpan * 0.06} ${logoX + logoSpan * 0.94},${logoVisualCenterY} ${logoVisualCenterX},${logoY + logoSpan * 0.94} ${logoX + logoSpan * 0.06},${logoVisualCenterY}`}
            />
          ) : (
            <rect
              x={logoX + logoSpan * 0.06}
              y={logoY + logoSpan * 0.06}
              width={logoSpan * 0.88}
              height={logoSpan * 0.88}
              rx={logoSpan * 0.24}
            />
          )}
        </clipPath>

        <linearGradient id={`${uid}-prism-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={config.cardBackgroundColor} />
          <stop offset="65%" stopColor={config.cardBackgroundColor} />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0.26" />
        </linearGradient>

        <linearGradient id={`${uid}-smoked-sheen`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.09" />
          <stop offset="48%" stopColor="#FFFFFF" stopOpacity="0.01" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0.14" />
        </linearGradient>

        <linearGradient id={`${uid}-metallic-sheen`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.16" />
          <stop offset="32%" stopColor="#FFFFFF" stopOpacity="0.02" />
          <stop offset="64%" stopColor={accentColor} stopOpacity="0.10" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.08" />
        </linearGradient>

        <linearGradient id={`${uid}-holo-card`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F5F3FF" />
          <stop offset="35%" stopColor="#EFF6FF" />
          <stop offset="68%" stopColor="#FDF2F8" />
          <stop offset="100%" stopColor="#F3E8FF" />
        </linearGradient>

        <linearGradient id={`${uid}-holo-dark`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.22" />
          <stop offset="38%" stopColor="#818CF8" stopOpacity="0.14" />
          <stop offset="72%" stopColor="#22D3EE" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#A855F7" stopOpacity="0.18" />
        </linearGradient>

        {/* Subtle outer-card textures (never applied inside QR window) */}
        <pattern id={`${uid}-tex-brushed`} width="8" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="1" x2="8" y2="1" stroke="#FFFFFF" strokeOpacity="0.055" strokeWidth="0.7" />
          <line x1="0" y1="3" x2="8" y2="3" stroke="#000000" strokeOpacity="0.045" strokeWidth="0.6" />
        </pattern>

        <pattern id={`${uid}-tex-linen`} width="8" height="8" patternUnits="userSpaceOnUse">
          <line x1="0" y1="2" x2="8" y2="2" stroke="#000000" strokeOpacity="0.035" strokeWidth="0.6" />
          <line x1="4" y1="0" x2="4" y2="8" stroke="#000000" strokeOpacity="0.03" strokeWidth="0.6" />
        </pattern>

        <pattern id={`${uid}-tex-stone`} width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r="0.7" fill="#FFFFFF" fillOpacity="0.06" />
          <circle cx="7" cy="8" r="0.6" fill="#000000" fillOpacity="0.08" />
        </pattern>

        {config.gradientType === 'linear' && (
          <linearGradient
            id={`${uid}-fg-grad`}
            gradientUnits="userSpaceOnUse"
            x1={matrixOriginX + (x1 / 100) * matrixPixelSize}
            y1={matrixOriginY + (y1 / 100) * matrixPixelSize}
            x2={matrixOriginX + (x2 / 100) * matrixPixelSize}
            y2={matrixOriginY + (y2 / 100) * matrixPixelSize}
          >
            <stop offset="0%" stopColor={config.foregroundColor} />
            <stop offset="100%" stopColor={config.foregroundSecondaryColor} />
          </linearGradient>
        )}

        {config.gradientType === 'radial' && (
          <radialGradient
            id={`${uid}-fg-grad`}
            gradientUnits="userSpaceOnUse"
            cx={matrixOriginX + matrixPixelSize / 2}
            cy={matrixOriginY + matrixPixelSize / 2}
            r={matrixPixelSize * 0.62}
          >
            <stop offset="0%" stopColor={config.foregroundSecondaryColor} />
            <stop offset="100%" stopColor={config.foregroundColor} />
          </radialGradient>
        )}

        <pattern
          id={`${uid}-halftone-pat`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(35)"
        >
          <circle
            cx="3"
            cy="3"
            r={0.8 + intensity * 0.9}
            fill={config.qrBackgroundColor}
            opacity={0.18 + intensity * 0.16}
          />
        </pattern>

        <filter id={`${uid}-fx-glow`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={0.55 + intensity * 0.75}
            result="blur"
          />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={`${uid}-fx-grain`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={0.65 + intensity * 0.35}
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${0.035 + intensity * 0.045} 0`}
            in="noise"
            result="softNoise"
          />
          <feComposite operator="over" in="softNoise" in2="SourceGraphic" />
        </filter>

        <filter id={`${uid}-fx-sepia`}>
          <feColorMatrix
            type="matrix"
            values="0.393 0.769 0.189 0 0
                    0.349 0.686 0.168 0 0
                    0.272 0.534 0.131 0 0
                    0     0     0     1 0"
          />
        </filter>

        <filter id={`${uid}-fx-duotone`}>
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1" exponent={0.85 - intensity * 0.2} />
            <feFuncG type="gamma" amplitude="1" exponent={0.9 - intensity * 0.15} />
            <feFuncB type="gamma" amplitude="1" exponent={0.85 - intensity * 0.2} />
          </feComponentTransfer>
        </filter>

        <filter id={`${uid}-fx-brut`}>
          <feComponentTransfer>
            <feFuncR type="linear" slope={1.08 + intensity * 0.16} intercept={-0.05} />
            <feFuncG type="linear" slope={1.08 + intensity * 0.16} intercept={-0.05} />
            <feFuncB type="linear" slope={1.08 + intensity * 0.16} intercept={-0.05} />
          </feComponentTransfer>
        </filter>

        <filter id={`${uid}-fx-inverted`}>
          <feColorMatrix
            type="matrix"
            values="-1 0 0 0 1
                     0 -1 0 0 1
                     0 0 -1 0 1
                     0 0 0 1 0"
          />
        </filter>
      </defs>

      <g clipPath={`url(#${uid}-card-clip)`} filter={activeFilterAttr}>
        {/* Card base */}
        <rect
          data-card-bg="true"
          x="0"
          y="0"
          width={layout.width}
          height={layout.height}
          fill={
            config.cardTexture === 'holographic' &&
            relativeLuminance(config.cardBackgroundColor || '#FFFFFF') >= 0.22
              ? `url(#${uid}-holo-card)`
              : config.frameStyle === 'glass'
              ? `url(#${uid}-prism-bg)`
              : config.cardBackgroundColor
          }
        />
        {config.cardTexture === 'holographic' &&
          relativeLuminance(config.cardBackgroundColor || '#FFFFFF') < 0.22 && (
            <rect
              data-card-bg="true"
              x="0"
              y="0"
              width={layout.width}
              height={layout.height}
              fill={`url(#${uid}-holo-dark)`}
            />
          )}

        {/* Card-only texture overlay */}
        {config.cardTexture === 'brushed' && (
          <rect
            data-card-bg="true"
            x="0"
            y="0"
            width={layout.width}
            height={layout.height}
            fill={`url(#${uid}-tex-brushed)`}
          />
        )}
        {config.cardTexture === 'linen' && (
          <rect
            data-card-bg="true"
            x="0"
            y="0"
            width={layout.width}
            height={layout.height}
            fill={`url(#${uid}-tex-linen)`}
          />
        )}
        {config.cardTexture === 'grain-stone' && (
          <rect
            data-card-bg="true"
            x="0"
            y="0"
            width={layout.width}
            height={layout.height}
            fill={`url(#${uid}-tex-stone)`}
          />
        )}

        {/* Metallic Specular Reflection */}
        {config.metallicSheen && (
          <rect
            data-card-bg="true"
            x="0"
            y="0"
            width={layout.width}
            height={layout.height}
            fill={`url(#${uid}-metallic-sheen)`}
          />
        )}

        {/* Ordered Studio Layers */}
        {layersOrder.map((layer) => {
          if (layer.id === 'frame') return renderFrameLayer();
          if (layer.id === 'modules') return renderModulesLayer();
          if (layer.id === 'centerLogo') return renderCenterLogoLayer();
          if (layer.id === 'cornerStickers') return renderCornerStickersLayer();
          if (layer.id === 'typography') return renderTypographyLayer();
          return null;
        })}
      </g>
    </svg>
  );
};
