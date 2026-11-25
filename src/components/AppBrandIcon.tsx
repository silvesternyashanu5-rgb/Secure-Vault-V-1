import React from 'react';
import {
  Calculator,
  Calendar,
  Clock,
  CloudSun,
  Compass,
  Music,
  ShieldCheck,
  StickyNote,
} from 'lucide-react';
import type { AppIconPresetId } from '../types/vault';

interface AppBrandIconProps {
  preset: AppIconPresetId;
  customIconDataUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const PRESET_TILE_CLASSES: Record<Exclude<AppIconPresetId, 'custom'>, string> = {
  shield: 'bg-slate-900 dark:bg-emerald-600 text-emerald-400 dark:text-white',
  calculator: 'bg-slate-700 text-amber-400',
  notes: 'bg-amber-600 text-white',
  weather: 'bg-sky-600 text-yellow-300',
  calendar: 'bg-red-600 text-white',
  music: 'bg-violet-600 text-white',
  compass: 'bg-emerald-600 text-white',
  clock: 'bg-slate-600 text-white',
};

export const AppBrandIcon: React.FC<AppBrandIconProps> = ({
  preset,
  customIconDataUrl,
  size = 'md',
  className = '',
}) => {
  const dimensions =
    size === 'sm'
      ? 'w-8 h-8 rounded-lg'
      : size === 'lg'
        ? 'w-12 h-12 rounded-2xl'
        : 'w-9 h-9 rounded-xl';

  const iconSize =
    size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';

  if (preset === 'custom' && customIconDataUrl) {
    return (
      <img
        src={customIconDataUrl}
        alt="App icon"
        className={`${dimensions} object-cover shrink-0 ${className}`}
      />
    );
  }

  const resolvedPreset = preset === 'custom' ? 'shield' : preset;
  const tileClasses = PRESET_TILE_CLASSES[resolvedPreset];

  const renderIcon = () => {
    switch (resolvedPreset) {
      case 'calculator':
        return <Calculator className={iconSize} />;
      case 'notes':
        return <StickyNote className={iconSize} />;
      case 'weather':
        return <CloudSun className={iconSize} />;
      case 'calendar':
        return <Calendar className={iconSize} />;
      case 'music':
        return <Music className={iconSize} />;
      case 'compass':
        return <Compass className={iconSize} />;
      case 'clock':
        return <Clock className={iconSize} />;
      case 'shield':
      default:
        return <ShieldCheck className={iconSize} />;
    }
  };

  return (
    <div
      className={`${dimensions} ${tileClasses} flex items-center justify-center shrink-0 ${className}`}
    >
      {renderIcon()}
    </div>
  );
};
