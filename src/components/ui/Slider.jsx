/**
 * Slider - Composants slider réutilisables
 * ============================================================================
 */

import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';

/**
 * Slider simple
 */
export const Slider = forwardRef(({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  helperText,
  showValue = true,
  disabled = false,
  className,
}, ref) => {
  const percentage = ((value - min) / (max - min)) * 100;

  const formatValue = (val) => {
    if (step < 1) {
      const decimals = Math.max(1, (step.toString().split('.')[1] || '').length);
      return val.toFixed(decimals);
    }
    return val.toString();
  };

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-2">
        {label && <label className="text-sm font-medium text-white font-mono">{label}</label>}
        {showValue && (
          <span className="text-sm font-semibold text-baikal-cyan bg-baikal-cyan/20 px-2 py-0.5 rounded font-mono">
            {formatValue(value)}
          </span>
        )}
      </div>
      <input
        ref={ref}
        type="range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={cn(
          'w-full h-2 rounded-full appearance-none cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-baikal-cyan/20 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-baikal-cyan',
          '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-baikal-bg',
          '[&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer',
          '[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:bg-baikal-cyan [&::-moz-range-thumb]:border-2',
          '[&::-moz-range-thumb]:border-baikal-bg [&::-moz-range-thumb]:shadow-md',
        )}
        style={{
          background: `linear-gradient(to right, #00F0FF 0%, #00F0FF ${percentage}%, #2D3748 ${percentage}%, #2D3748 100%)`,
        }}
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs text-baikal-text font-mono">{formatValue(min)}</span>
        <span className="text-xs text-baikal-text font-mono">{formatValue(max)}</span>
      </div>
      {helperText && <p className="mt-1.5 text-sm text-baikal-text font-sans">{helperText}</p>}
    </div>
  );
});

Slider.displayName = 'Slider';

/**
 * Slider avec input numérique
 */
export const SliderWithInput = forwardRef(({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.1,
  helperText,
  disabled = false,
  className,
}, ref) => {
  const percentage = ((value - min) / (max - min)) * 100;

  const handleInputChange = (e) => {
    let newValue = parseFloat(e.target.value);
    if (isNaN(newValue)) return;
    newValue = Math.max(min, Math.min(max, newValue));
    onChange(newValue);
  };

  return (
    <div className={cn('w-full', className)}>
      {label && <label className="block text-sm font-medium text-white font-mono mb-2">{label}</label>}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="range"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className={cn(
              'w-full h-2 rounded-full appearance-none cursor-pointer',
              'focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
              '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5',
              '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-baikal-cyan',
              '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-baikal-bg [&::-webkit-slider-thumb]:shadow-md',
              '[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full',
              '[&::-moz-range-thumb]:bg-baikal-cyan [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-baikal-bg',
            )}
            style={{
              background: `linear-gradient(to right, #00F0FF 0%, #00F0FF ${percentage}%, #2D3748 ${percentage}%, #2D3748 100%)`,
            }}
          />
        </div>
        <input
          ref={ref}
          type="number"
          value={value}
          onChange={handleInputChange}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="w-20 px-2 py-1.5 text-sm text-center border border-baikal-border rounded-lg bg-black text-white focus:outline-none focus:ring-2 focus:ring-baikal-cyan/20 focus:border-baikal-cyan disabled:bg-baikal-surface disabled:text-baikal-text font-mono"
        />
      </div>
      {helperText && <p className="mt-1.5 text-sm text-baikal-text font-sans">{helperText}</p>}
    </div>
  );
});

SliderWithInput.displayName = 'SliderWithInput';

/**
 * Slider double pour répartition vectoriel/full-text
 */
export const WeightSlider = forwardRef(({
  value,
  onChange,
  step = 0.05,
  disabled = false,
  className,
}, ref) => {
  const vectorWeight = value;
  const fulltextWeight = 1 - value;
  const percentage = value * 100;

  const formatValue = (val) => val.toFixed(2);

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-baikal-cyan font-mono">Vectoriel</span>
          <span className="text-sm font-bold text-baikal-cyan bg-baikal-cyan/20 px-2 py-0.5 rounded font-mono">
            {formatValue(vectorWeight)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded font-mono">
            {formatValue(fulltextWeight)}
          </span>
          <span className="text-sm font-medium text-emerald-400 font-mono">Full-text</span>
        </div>
      </div>
      
      <div className="relative">
        <input
          ref={ref}
          type="range"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          min={0}
          max={1}
          step={step}
          disabled={disabled}
          className={cn(
            'w-full h-3 rounded-full appearance-none cursor-pointer',
            'focus:outline-none focus:ring-2 focus:ring-baikal-cyan/20 focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6',
            '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-baikal-border',
            '[&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2',
            '[&::-moz-range-thumb]:border-baikal-border [&::-moz-range-thumb]:shadow-lg',
          )}
          style={{
            background: `linear-gradient(to right, #00F0FF 0%, #00F0FF ${percentage}%, #10b981 ${percentage}%, #10b981 100%)`,
          }}
        />
      </div>
      
      <div className="flex justify-between mt-2">
        <span className="text-xs text-baikal-cyan font-mono">100% sémantique</span>
        <span className="text-xs text-emerald-400 font-mono">100% textuel</span>
      </div>
    </div>
  );
});

WeightSlider.displayName = 'WeightSlider';

export default Slider;
