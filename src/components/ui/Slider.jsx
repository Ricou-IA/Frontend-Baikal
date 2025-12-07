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
        {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
        {showValue && (
          <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
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
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-600',
          '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white',
          '[&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer',
          '[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:bg-indigo-600 [&::-moz-range-thumb]:border-2',
          '[&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md',
        )}
        style={{
          background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${percentage}%, #e2e8f0 ${percentage}%, #e2e8f0 100%)`,
        }}
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs text-slate-400">{formatValue(min)}</span>
        <span className="text-xs text-slate-400">{formatValue(max)}</span>
      </div>
      {helperText && <p className="mt-1.5 text-sm text-slate-500">{helperText}</p>}
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
      {label && <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>}
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
              '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-600',
              '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md',
              '[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full',
              '[&::-moz-range-thumb]:bg-indigo-600 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white',
            )}
            style={{
              background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${percentage}%, #e2e8f0 ${percentage}%, #e2e8f0 100%)`,
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
          className="w-20 px-2 py-1.5 text-sm text-center border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
        />
      </div>
      {helperText && <p className="mt-1.5 text-sm text-slate-500">{helperText}</p>}
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
          <span className="text-sm font-medium text-indigo-700">Vectoriel</span>
          <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
            {formatValue(vectorWeight)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
            {formatValue(fulltextWeight)}
          </span>
          <span className="text-sm font-medium text-amber-700">Full-text</span>
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
            'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6',
            '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-400',
            '[&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2',
            '[&::-moz-range-thumb]:border-slate-400 [&::-moz-range-thumb]:shadow-lg',
          )}
          style={{
            background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${percentage}%, #f59e0b ${percentage}%, #f59e0b 100%)`,
          }}
        />
      </div>
      
      <div className="flex justify-between mt-2">
        <span className="text-xs text-indigo-500">100% sémantique</span>
        <span className="text-xs text-amber-500">100% textuel</span>
      </div>
    </div>
  );
});

WeightSlider.displayName = 'WeightSlider';

export default Slider;
