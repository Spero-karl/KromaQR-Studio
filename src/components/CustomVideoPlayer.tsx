import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  formatMediaTimestamp,
  inspectVideoSourceCompatibility,
} from '../utils/mediaReaderLogic';

interface CustomVideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  accentColor?: string;
  borderColor?: string;
  autoPlay?: boolean;
  loop?: boolean;
  className?: string;
}

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({
  src,
  poster,
  title = 'Vidéo SparkQR',
  accentColor = '#2563EB',
  borderColor = 'rgba(255,255,255,0.14)',
  autoPlay = false,
  loop = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const compatibility = useMemo(() => inspectVideoSourceCompatibility(src), [src]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(autoPlay);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    setIsPlaying(false);
    setHasStarted(false);
    setCurrentTime(0);
    setDuration(0);
    setBufferedEnd(0);
    setRuntimeError(null);
  }, [src]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const togglePlay = async () => {
    const el = videoRef.current;
    if (!el || !compatibility.playableInHtml5 || runtimeError) return;
    if (el.paused || el.ended) {
      try {
        await el.play();
        setHasStarted(true);
        setIsPlaying(true);
      } catch {
        // Autoplay or codec restriction
        setRuntimeError(
          'Lecture impossible dans ce navigateur. Vérifiez que le fichier est encodé en MP4 (H.264) ou WebM.'
        );
      }
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (nextTime: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleVolumeChange = (nextVol: number) => {
    const el = videoRef.current;
    const clamped = Math.max(0, Math.min(1, nextVol));
    setVolume(clamped);
    if (el) {
      el.volume = clamped;
      el.muted = clamped === 0;
    }
    setIsMuted(clamped === 0);
  };

  const toggleMute = () => {
    const el = videoRef.current;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (el) {
      el.muted = nextMuted;
      if (!nextMuted && el.volume === 0) {
        el.volume = 0.8;
        setVolume(0.8);
      }
    }
  };

  const toggleFullscreen = async () => {
    const box = containerRef.current;
    if (!box) return;
    try {
      if (!document.fullscreenElement) {
        if (box.requestFullscreen) {
          await box.requestFullscreen();
        } else if (
          (videoRef.current as unknown as { webkitEnterFullscreen?: () => void })
            ?.webkitEnterFullscreen
        ) {
          (
            videoRef.current as unknown as { webkitEnterFullscreen: () => void }
          ).webkitEnterFullscreen();
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen permissions errors in sandboxed iframes
    }
  };

  if (!compatibility.playableInHtml5 || runtimeError) {
    return (
      <div
        data-testid="video-incompatible-fallback"
        className={`rounded-2xl border p-5 sm:p-6 bg-[#0B0D12] text-[#F8FAFC] space-y-3 ${className}`}
        style={{ borderColor }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-300" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <h4 className="text-sm font-bold text-white">
              {runtimeError ? 'Format vidéo non compatible avec ce lecteur' : compatibility.label}
            </h4>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              {runtimeError || compatibility.hint}
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9CA3AF]">
          <span>Lecture intégrée sans redirection externe</span>
          {runtimeError && (
            <button
              type="button"
              onClick={() => {
                setRuntimeError(null);
                videoRef.current?.load();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Réessayer</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      data-testid="custom-video-player"
      className={`relative rounded-2xl overflow-hidden bg-[#050608] border select-none flex flex-col ${className}`}
      style={{ borderColor }}
    >
      {/* Video Viewport */}
      <div
        className="relative flex-1 flex items-center justify-center bg-black cursor-pointer group"
        onClick={() => void togglePlay()}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster || undefined}
          playsInline
          autoPlay={autoPlay}
          muted={isMuted}
          loop={loop}
          preload="metadata"
          aria-label={title}
          onLoadedMetadata={(e) => {
            const vid = e.currentTarget;
            if (Number.isFinite(vid.duration)) setDuration(vid.duration);
          }}
          onTimeUpdate={(e) => {
            const vid = e.currentTarget;
            setCurrentTime(vid.currentTime);
            if (vid.buffered.length > 0) {
              setBufferedEnd(vid.buffered.end(vid.buffered.length - 1));
            }
          }}
          onPlay={() => {
            setHasStarted(true);
            setIsPlaying(true);
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() =>
            setRuntimeError(
              'Le flux vidéo n’a pas pu être lu (format non supporté ou ressource inaccessible).'
            )
          }
          className="w-full max-h-[65vh] h-auto object-contain bg-black"
        />

        {/* Custom Miniature Poster Overlay before first play */}
        {poster && !hasStarted && !isPlaying && (
          <img
            src={poster}
            alt={`Miniature — ${title}`}
            className="absolute inset-0 w-full h-full object-contain bg-black pointer-events-none"
          />
        )}

        {/* Center Play Overlay when paused */}
        {!isPlaying && (
          <button
            type="button"
            data-testid="video-center-play"
            aria-label="Lire la vidéo"
            onClick={(e) => {
              e.stopPropagation();
              void togglePlay();
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors cursor-pointer"
          >
            <span
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-[0_12px_32px_rgba(0,0,0,0.35)] transition-transform group-hover:scale-105"
              style={{
                backgroundColor: accentColor,
                color: '#FFFFFF',
              }}
            >
              <Play className="w-6 h-6 fill-current ml-0.5" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>

      {/* Custom HTML5 Control Bar */}
      <div
        className="px-4 py-3 bg-[#090B10]/95 backdrop-blur-xs border-t border-white/10 text-white space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrubbable Progress Track */}
        <div className="relative h-4 flex items-center">
          <div className="w-full h-1.5 rounded-full bg-white/15 overflow-hidden relative">
            <div
              className="absolute inset-y-0 left-0 bg-white/25 transition-all"
              style={{ width: `${bufferedPercent}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${progressPercent}%`, backgroundColor: accentColor }}
            />
          </div>
          <input
            type="range"
            data-testid="video-seek-bar"
            aria-label="Progression de la vidéo"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.1}
            value={Math.min(currentTime, duration || 100)}
            disabled={duration <= 0}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
          />
        </div>

        {/* Transport, Volume, Fullscreen */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              data-testid="video-play-toggle"
              aria-label={isPlaying ? 'Mettre en pause' : 'Lire la vidéo'}
              onClick={() => void togglePlay()}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              )}
            </button>

            <span
              data-testid="video-time-display"
              className="text-[11px] font-mono text-[#D1D5DB] tabular-nums whitespace-nowrap"
            >
              {formatMediaTimestamp(currentTime)} / {formatMediaTimestamp(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="video-mute-toggle"
              aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
              onClick={toggleMute}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[#E5E7EB] transition-colors cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            <input
              type="range"
              data-testid="video-volume-slider"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-16 sm:w-20 accent-white cursor-pointer"
            />

            <button
              type="button"
              data-testid="video-fullscreen-btn"
              aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran vidéo'}
              onClick={() => void toggleFullscreen()}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[#E5E7EB] transition-colors cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
