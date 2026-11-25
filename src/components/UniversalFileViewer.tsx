import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileCode,
  FileSpreadsheet,
  Film,
  FolderArchive,
  Globe,
  Maximize2,
  Music,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  buildHexDump,
  detectMagicSignature,
  formatBytes,
  isLikelyTextBuffer,
  parseCsvRows,
  parseZipEntries,
} from '../lib/universalFileParser';
import type { HiddenFileDecrypted } from '../types/hiddenVault';

interface UniversalFileViewerProps {
  file: HiddenFileDecrypted | null;
  queue?: HiddenFileDecrypted[];
  onClose: () => void;
  onSelectFromQueue?: (file: HiddenFileDecrypted) => void;
  onDownloadRestore: (file: HiddenFileDecrypted) => void;
}

export const UniversalFileViewer: React.FC<UniversalFileViewerProps> = ({
  file,
  queue = [],
  onClose,
  onSelectFromQueue,
  onDownloadRestore,
}) => {
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [viewMode, setViewMode] = useState<'native' | 'text' | 'hex' | 'archive'>('native');
  const [hexOffset, setHexOffset] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [videoRate, setVideoRate] = useState(1);
  const [videoLoadError, setVideoLoadError] = useState(false);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioLoop, setAudioLoop] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.9);

  // Video ref
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectUrl('');
      return;
    }
    setHexOffset(0);
    setZoom(100);
    setVideoRate(1);
    setVideoLoadError(false);
    setIsPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);

    if (file.appUrl || file.packageId || file.appScheme) {
      setObjectUrl('');
      setViewMode('native');
      return;
    }

    const blob = new Blob([file.data], {
      type: file.mimeType || 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);

    const ext = file.extension.toLowerCase();
    const mime = file.mimeType.toLowerCase();
    const isPdf = ext === 'pdf' || mime === 'application/pdf';
    const isImg =
      mime.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'].includes(ext);
    const isAudio = file.section === 'music' || mime.startsWith('audio/');
    const isVideo = file.section === 'videos' || mime.startsWith('video/');
    const isHtml = ext === 'html' || ext === 'htm';
    const isZipLike = ['zip', 'docx', 'xlsx', 'pptx', 'apk', 'jar', 'epub', 'odt'].includes(
      ext
    );

    if (isPdf || isImg || isAudio || isVideo || isHtml) {
      setViewMode('native');
    } else if (isZipLike) {
      setViewMode('archive');
    } else if (isLikelyTextBuffer(file.data, ext, mime)) {
      setViewMode('text');
    } else {
      setViewMode('hex');
    }

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Animated audio spectrum bars while playing
  useEffect(() => {
    if (!file || file.section !== 'music') return;
    let rafId = 0;
    const drawBars = (t: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          const barCount = 32;
          const gap = 4;
          const barW = (w - gap * (barCount - 1)) / barCount;
          for (let i = 0; i < barCount; i++) {
            const amp = isPlaying
              ? 0.25 +
                0.7 *
                  Math.abs(
                    Math.sin(t * 0.004 + i * 0.45) * Math.cos(t * 0.0023 + i * 0.2)
                  )
              : 0.14 + 0.08 * Math.sin(i * 0.6);
            const barH = Math.max(6, amp * (h - 8));
            ctx.fillStyle = isPlaying ? '#10B981' : '#64748B';
            ctx.beginPath();
            ctx.roundRect(i * (barW + gap), h - barH, barW, barH, 3);
            ctx.fill();
          }
        }
      }
      rafId = requestAnimationFrame(drawBars);
    };
    rafId = requestAnimationFrame(drawBars);
    return () => cancelAnimationFrame(rafId);
  }, [file, isPlaying]);

  const isAppEntry = Boolean(file?.appUrl || file?.packageId || file?.appScheme);

  const textContent = useMemo(() => {
    if (!file || isAppEntry) return '';
    try {
      const slice = file.data.slice(0, 512 * 1024);
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(slice);
      if (file.extension === 'json') {
        try {
          return JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          return raw;
        }
      }
      return raw;
    } catch {
      return '';
    }
  }, [file, isAppEntry]);

  const csvRows = useMemo(() => {
    if (!file || isAppEntry || !['csv', 'tsv'].includes(file.extension)) return null;
    return parseCsvRows(textContent);
  }, [file, isAppEntry, textContent]);

  const zipEntries = useMemo(() => {
    if (!file || isAppEntry) return [];
    return parseZipEntries(file.data);
  }, [file, isAppEntry]);

  const magicSignature = useMemo(() => {
    if (!file || isAppEntry) return '';
    return detectMagicSignature(file.data);
  }, [file, isAppEntry]);

  if (!file) return null;

  const ext = file.extension.toLowerCase();
  const mime = file.mimeType.toLowerCase();
  const isPdf = ext === 'pdf' || mime === 'application/pdf';
  const isImage =
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'].includes(ext);
  const isHtml = ext === 'html' || ext === 'htm';
  const isAudio = file.section === 'music' || mime.startsWith('audio/');
  const isVideo = file.section === 'videos' || mime.startsWith('video/');

  const currentQueueIdx = queue.findIndex((q) => q.id === file.id);

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleAudioPlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      await el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-6">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Viewer Bar */}
        <header className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white truncate">
              {file.name}
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <span>
                {file.packageId || file.appScheme
                  ? `Phone App · ${file.packageId || file.appScheme}`
                  : file.appUrl
                    ? 'Hidden App Launcher'
                    : magicSignature}
              </span>
              {!file.appUrl && !file.packageId && !file.appScheme && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono tabular-nums">{formatBytes(file.size)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!file.appUrl && !file.packageId && !file.appScheme && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {(isPdf || isImage || isAudio || isVideo || isHtml) && (
                  <button
                    type="button"
                    onClick={() => setViewMode('native')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                      viewMode === 'native'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Player / View
                  </button>
                )}
                {zipEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setViewMode('archive')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                      viewMode === 'archive'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Package ({zipEntries.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewMode('text')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    viewMode === 'text'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('hex')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    viewMode === 'hex'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Hex
                </button>
              </div>
            )}

            {!file.appUrl && !file.packageId && !file.appScheme && (
              <button
                type="button"
                onClick={() => onDownloadRestore(file)}
                className="min-h-[38px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Restore</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close viewer"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Viewer Body */}
        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6">
          {/* 1. Hidden Phone App Launcher & Web Session */}
          {(file.packageId || file.appScheme || file.appUrl) && (
            <div className="space-y-4">
              {(file.packageId || file.appScheme) && (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        Native Phone App Launcher
                      </div>
                      <div className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                        {file.packageId ? `Package: ${file.packageId}` : ''}
                        {file.packageId && file.appScheme ? ' · ' : ''}
                        {file.appScheme ? `URI: ${file.appScheme}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {file.appScheme && (
                        <a
                          href={file.appScheme}
                          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Launch on Phone</span>
                        </a>
                      )}
                      {file.packageId && (
                        <a
                          href={`intent://launch#Intent;package=${encodeURIComponent(file.packageId)};end`}
                          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <span>Android Intent</span>
                        </a>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Launches the installed app via its OS URI scheme or Android package intent. To
                    remove the original icon from your home screen, use Android Private Space or
                    Samsung Secure Folder.
                  </p>
                </div>
              )}

              {file.appUrl && (
                <div className="space-y-3 flex flex-col">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-mono text-slate-700 dark:text-slate-200 truncate">
                        {file.appUrl}
                      </span>
                    </div>
                    <a
                      href={file.appUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
                    >
                      <span>Open Tab</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <iframe
                    title={file.name}
                    src={file.appUrl}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    className="w-full h-[58vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white"
                  />
                </div>
              )}
            </div>
          )}

          {/* 2. Built-In Audio Player */}
          {!file.appUrl && !file.packageId && !file.appScheme && viewMode === 'native' && isAudio && objectUrl && (
            <div className="max-w-xl mx-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Music className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                    {file.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Encrypted Vault Audio Player · {formatBytes(file.size)}
                  </p>
                </div>
              </div>

              <canvas
                ref={canvasRef}
                width={480}
                height={72}
                className="w-full h-18 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2"
              />

              <audio
                ref={audioRef}
                src={objectUrl}
                loop={audioLoop}
                onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  setAudioDuration(e.currentTarget.duration);
                  e.currentTarget.volume = audioVolume;
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  if (
                    !audioLoop &&
                    onSelectFromQueue &&
                    currentQueueIdx >= 0 &&
                    currentQueueIdx + 1 < queue.length
                  ) {
                    onSelectFromQueue(queue[currentQueueIdx + 1]);
                  }
                }}
              />

              {/* Scrubber */}
              <div className="space-y-1.5">
                <input
                  type="range"
                  min={0}
                  max={audioDuration || 100}
                  value={audioCurrentTime}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (audioRef.current) audioRef.current.currentTime = next;
                    setAudioCurrentTime(next);
                  }}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <div className="flex justify-between font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>{formatTime(audioCurrentTime)}</span>
                  <span>{formatTime(audioDuration)}</span>
                </div>
              </div>

              {/* Transport Controls */}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setAudioLoop((l) => !l)}
                  aria-label="Toggle loop"
                  className={`min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    audioLoop
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  <Repeat className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={!onSelectFromQueue || currentQueueIdx <= 0}
                    onClick={() =>
                      onSelectFromQueue &&
                      currentQueueIdx > 0 &&
                      onSelectFromQueue(queue[currentQueueIdx - 1])
                    }
                    aria-label="Previous track"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void toggleAudioPlay()}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className="min-h-[52px] min-w-[52px] flex items-center justify-center rounded-2xl bg-emerald-600 text-white hover:bg-emerald-500 transition-colors cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>

                  <button
                    type="button"
                    disabled={
                      !onSelectFromQueue ||
                      currentQueueIdx < 0 ||
                      currentQueueIdx >= queue.length - 1
                    }
                    onClick={() =>
                      onSelectFromQueue &&
                      currentQueueIdx < queue.length - 1 &&
                      onSelectFromQueue(queue[currentQueueIdx + 1])
                    }
                    aria-label="Next track"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-slate-400" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={audioVolume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setAudioVolume(v);
                      if (audioRef.current) audioRef.current.volume = v;
                    }}
                    className="w-16 accent-emerald-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. Built-In Video Player */}
          {!file.appUrl && !file.packageId && !file.appScheme && viewMode === 'native' && isVideo && objectUrl && (
            <div className="space-y-4">
              {videoLoadError ? (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center space-y-3">
                  <Film className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    This browser cannot natively decode the .{ext} video codec inline.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    You can inspect its container signature/hex headers inside the app or restore it to play in a system media player.
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewMode('hex')}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 text-xs font-semibold text-white cursor-pointer"
                  >
                    Open Container Hex Inspector
                  </button>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center">
                    <video
                      ref={videoRef}
                      src={objectUrl}
                      controls
                      playsInline
                      onError={() => setVideoLoadError(true)}
                      className="w-full max-h-[64vh]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">
                        Speed:
                      </span>
                      {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => {
                            setVideoRate(rate);
                            if (videoRef.current) videoRef.current.playbackRate = rate;
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer ${
                            videoRate === rate
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => videoRef.current?.requestFullscreen?.()}
                      className="min-h-[38px] flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Fullscreen</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 4. Native PDF & HTML Reader */}
          {!file.appUrl && !file.packageId && !file.appScheme && viewMode === 'native' && (isPdf || isHtml) && objectUrl && (
            <iframe
              title={file.name}
              src={objectUrl}
              className="w-full h-[68vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white"
            />
          )}

          {/* 5. Zoomable Image Viewer */}
          {!file.appUrl && !file.packageId && !file.appScheme && viewMode === 'native' && isImage && objectUrl && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(25, z - 25))}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums w-12 text-center">
                  {zoom}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(300, z + 25))}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-2xl bg-slate-200/60 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 overflow-auto max-h-[64vh] flex items-center justify-center">
                <img
                  src={objectUrl}
                  alt={file.name}
                  style={{ width: `${zoom}%`, maxWidth: 'none' }}
                  className="rounded-lg object-contain"
                />
              </div>
            </div>
          )}

          {/* 6. Archive / Office / APK Package Inspector */}
          {!file.appUrl && !file.packageId && !file.appScheme && viewMode === 'archive' && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <FolderArchive className="w-4 h-4 text-emerald-600" />
                <span>Container Entries ({zipEntries.length})</span>
              </div>
              {zipEntries.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No central directory entries detected. Switch to Hex view to inspect raw bytes.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[60vh]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Entry Path</th>
                        <th className="px-4 py-2.5 font-medium text-right">Uncompressed</th>
                        <th className="px-4 py-2.5 font-medium text-right">Compressed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {zipEntries.map((entry, idx) => (
                        <tr key={`${entry.fileName}-${idx}`}>
                          <td className="px-4 py-2 font-mono text-slate-800 dark:text-slate-200">
                            {entry.fileName}
                          </td>
                          <td className="px-4 py-2 font-mono text-right text-slate-500 tabular-nums">
                            {formatBytes(entry.uncompressedSize)}
                          </td>
                          <td className="px-4 py-2 font-mono text-right text-slate-500 tabular-nums">
                            {formatBytes(entry.compressedSize)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 7. CSV Table / Text / Code / JSON Viewer */}
          {!file.appUrl && !file.packageId && !file.appScheme && viewMode === 'text' && (
            csvRows && csvRows.length > 0 ? (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Spreadsheet Preview ({csvRows.length} rows)</span>
                </div>
                <div className="overflow-auto max-h-[62vh]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950">
                      <tr>
                        {csvRows[0].map((cell, i) => (
                          <th
                            key={i}
                            className="px-3.5 py-2.5 font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800"
                          >
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {csvRows.slice(1).map((row, rIdx) => (
                        <tr key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3.5 py-2 text-slate-700 dark:text-slate-300"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <FileCode className="w-4 h-4 text-emerald-600" />
                  <span>Document / Text Reader</span>
                </div>
                <pre className="p-4 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-auto max-h-[62vh] whitespace-pre-wrap break-words leading-relaxed">
                  {textContent || '(Empty text content)'}
                </pre>
              </div>
            )
          )}

          {/* 8. Universal Hex & ASCII Binary Inspector (works for ANY file format in the world) */}
          {!file.appUrl && !file.packageId && !file.appScheme && viewMode === 'hex' && (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-emerald-400">
                  Universal Binary &amp; Hex Inspector · {magicSignature}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={hexOffset === 0}
                    onClick={() => setHexOffset((o) => Math.max(0, o - 2048))}
                    className="min-h-[32px] px-2.5 rounded-lg bg-slate-800 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev 2KB</span>
                  </button>
                  <button
                    type="button"
                    disabled={hexOffset + 2048 >= file.data.byteLength}
                    onClick={() => setHexOffset((o) => o + 2048)}
                    className="min-h-[32px] px-2.5 rounded-lg bg-slate-800 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Next 2KB</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <pre className="p-4 font-mono text-[11px] sm:text-xs text-slate-200 overflow-auto max-h-[60vh] leading-relaxed">
                {buildHexDump(file.data, hexOffset, 2048)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
