import React from 'react';
import {
  WEAPON_ORDER,
  getHealthBarColor,
  type KillFeedEntry,
  type MatchStats,
  type PlayerState,
  type WeaponArsenal,
  type WeaponId,
  type WeaponState,
} from '../game/rules';

export interface HudSnapshot {
  player: PlayerState;
  weapon: WeaponState;
  arsenal: WeaponArsenal;
  stats: MatchStats;
  killFeed: KillFeedEntry[];
  crosshairSpread: number;
  hitMarkerTimer: number;
  hitMarkerHeadshot: boolean;
  killConfirmTimer?: number;
  killConfirmHeadshot?: boolean;
  combatFlashAlpha?: number;
  damageFlashAlpha: number;
  isPointerLocked: boolean;
  isMuted: boolean;
  waveAnnouncementText: string | null;
}

interface GameHudProps {
  hud: HudSnapshot;
  onToggleMute: () => void;
  onPauseGame: () => void;
  onRestartGame: () => void;
  onSwitchWeapon: (weaponId: WeaponId) => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  onToggleMute,
  onPauseGame,
  onRestartGame,
  onSwitchWeapon,
}) => {
  const { player, weapon, arsenal, stats } = hud;
  const hpInt = Math.max(0, Math.round(player.hp));
  const hpColorKey = getHealthBarColor(hpInt);

  const hpBarColorClass =
    hpColorKey === 'green'
      ? 'bg-emerald-500'
      : hpColorKey === 'yellow'
        ? 'bg-amber-400'
        : 'bg-red-500';

  const hpTextColorClass =
    hpColorKey === 'green'
      ? 'text-emerald-400'
      : hpColorKey === 'yellow'
        ? 'text-amber-300'
        : 'text-red-400';

  const isLowAmmo =
    !weapon.isReloading && weapon.magazine <= weapon.lowAmmoThreshold;
  const isOutOfAmmo =
    !weapon.isReloading && weapon.magazine === 0 && weapon.reserve === 0;

  // Crosshair gap & color (wider base gap for shotgun)
  const baseGap = weapon.id === 'shotgun' ? 11 : 5;
  const gapPx = Math.round(baseGap + hud.crosshairSpread * 14);
  const isHitActive = hud.hitMarkerTimer > 0;
  const crosshairColor = isHitActive
    ? hud.hitMarkerHeadshot
      ? '#f59e0b'
      : '#ef4444'
    : '#ffffff';

  const reloadProgress = weapon.isReloading
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(
            ((weapon.reloadDurationSec - weapon.reloadTimerSec) /
              weapon.reloadDurationSec) *
              100,
          ),
        ),
      )
    : 0;

  return (
    <div
      className="fixed inset-0 pointer-events-none select-none z-10 overflow-hidden"
      data-testid="game-hud"
    >
      {/* Subtle Red Screen-Edge Damage Vignette */}
      <div
        className="fixed inset-0 pointer-events-none transition-opacity duration-100"
        style={{
          opacity: Math.max(
            hud.damageFlashAlpha,
            hpInt > 0 && hpInt < 30 ? 0.28 : 0,
          ),
          boxShadow: 'inset 0 0 110px 36px rgba(220, 38, 38, 0.85)',
        }}
      />

      {/* Subtle Warm Combat / Muzzle / Explosion Screen Edge Flash */}
      {(hud.combatFlashAlpha ?? 0) > 0.01 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            opacity: hud.combatFlashAlpha ?? 0,
            boxShadow: 'inset 0 0 95px 24px rgba(251, 191, 36, 0.55)',
          }}
        />
      )}

      {/* TOP CENTER: Current Wave & Current Score */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 flex items-center gap-6 px-6 py-2.5 bg-[#0b0e14]/85 border border-slate-700/70 rounded">
        <div className="flex flex-col items-center min-w-[84px]">
          <span className="text-[11px] font-semibold tracking-widest text-slate-400 uppercase">
            WAVE
          </span>
          <span
            className="text-2xl font-bold text-white tabular-nums tracking-tight font-['Chakra_Petch']"
            data-testid="hud-wave"
          >
            {stats.wave}
          </span>
        </div>

        <div className="w-px h-8 bg-slate-700/80" />

        <div className="flex flex-col items-center min-w-[120px]">
          <span className="text-[11px] font-semibold tracking-widest text-slate-400 uppercase">
            SCORE
          </span>
          <span
            className="text-2xl font-bold text-amber-400 tabular-nums tracking-tight font-['Chakra_Petch']"
            data-testid="hud-score"
          >
            {Math.round(stats.score)}
          </span>
        </div>
      </div>

      {/* Wave Announcement Banner */}
      {hud.waveAnnouncementText && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 px-6 py-2 bg-[#0b0e14]/90 border border-amber-500/60 rounded text-center">
          <div className="text-lg font-bold tracking-widest text-amber-400 uppercase font-['Chakra_Petch']">
            {hud.waveAnnouncementText}
          </div>
        </div>
      )}

      {/* TOP RIGHT: Enemies Remaining + Compact Utility Controls + Real-Time Kill & Ammo Feed */}
      <div className="fixed top-4 right-5 flex flex-col items-end gap-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-4 py-2 bg-[#0b0e14]/85 border border-slate-700/70 rounded">
            {/* Custom Tactical Hostile Target SVG Icon */}
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-red-500 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="8" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
            </svg>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                ENEMIES REMAINING
              </span>
              <span
                className="text-xl font-bold text-white tabular-nums leading-tight font-['Chakra_Petch']"
                data-testid="hud-enemies"
              >
                {stats.enemiesRemainingInWave}
              </span>
            </div>
          </div>

          {/* Utility Buttons (pointer-events-auto) */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-label={hud.isMuted ? 'Unmute audio' : 'Mute audio'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-10 h-10 flex items-center justify-center bg-[#0b0e14]/85 hover:bg-slate-800 border border-slate-700/70 rounded text-slate-200 transition-colors cursor-pointer"
              title="Mute / Unmute [M]"
            >
              {hud.isMuted ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-200" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause game"
              onClick={(e) => {
                e.currentTarget.blur();
                onPauseGame();
              }}
              className="w-10 h-10 flex items-center justify-center bg-[#0b0e14]/85 hover:bg-slate-800 border border-slate-700/70 rounded text-slate-200 transition-colors cursor-pointer"
              title="Pause Game [ESC / P]"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Restart match"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestartGame();
              }}
              className="w-10 h-10 flex items-center justify-center bg-[#0b0e14]/85 hover:bg-slate-800 border border-slate-700/70 rounded text-slate-200 transition-colors cursor-pointer"
              title="Quick Restart"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Real-Time Kill & Ammo Resupply Feed Stack */}
        {hud.killFeed.length > 0 && (
          <div
            className="flex flex-col items-end gap-1.5 w-full max-w-[330px]"
            data-testid="hud-kill-feed"
            aria-live="polite"
          >
            {hud.killFeed.map((item) => {
              const fadeOpacity =
                item.remainingSec < 0.6
                  ? Math.max(0.15, item.remainingSec / 0.6)
                  : 1;
              const isAmmo = item.kind === 'ammo';
              const isHealth = item.kind === 'health';

              return (
                <div
                  key={item.id}
                  data-testid="kill-feed-item"
                  style={{ opacity: fadeOpacity }}
                  className={`flex items-center justify-between gap-3 w-full px-3.5 py-2 bg-[#0b0e14]/90 border rounded transition-opacity duration-100 ${
                    isHealth
                      ? 'border-rose-500/75'
                      : isAmmo
                        ? 'border-emerald-500/70'
                        : item.isHeadshot
                          ? 'border-amber-500/70'
                          : 'border-slate-700/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isHealth ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4 text-rose-400 shrink-0"
                        fill="currentColor"
                      >
                        <path d="M9 2h6v3h-1v2.38l4.42 6.63A3 3 0 0 1 15.92 19H8.08a3 3 0 0 1-2.5-4.99L10 7.38V5H9V2zm2 9v2H9v2h2v2h2v-2h2v-2h-2v-2h-2z" />
                      </svg>
                    ) : isAmmo ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4 text-emerald-400 shrink-0"
                        fill="currentColor"
                      >
                        <path d="M4 7h16v13H4V7zm2-4h12v3H6V3zm5 7v3H8v2h3v3h2v-3h3v-2h-3v-3h-2z" />
                      </svg>
                    ) : item.isHeadshot ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4 text-amber-400 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <circle cx="12" cy="12" r="8" />
                        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                        <line x1="12" y1="1" x2="12" y2="5" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="1" y1="12" x2="5" y2="12" />
                        <line x1="19" y1="12" x2="23" y2="12" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4 text-red-400 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    )}

                    <div className="flex flex-col min-w-0">
                      <span
                        className={`text-xs font-bold tracking-wider uppercase font-['Chakra_Petch'] truncate ${
                          isHealth
                            ? 'text-rose-400'
                            : isAmmo
                              ? 'text-emerald-400'
                              : item.isHeadshot
                                ? 'text-amber-400'
                                : 'text-white'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400 truncate">
                        {isAmmo || isHealth
                          ? item.archetypeLabel
                          : `${item.archetypeLabel} · ${item.weaponName}`}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-bold tabular-nums font-['Chakra_Petch'] shrink-0 ${
                      isHealth
                        ? 'text-rose-300'
                        : isAmmo
                          ? 'text-emerald-300'
                          : item.isHeadshot
                            ? 'text-amber-300'
                            : 'text-emerald-400'
                    }`}
                  >
                    {item.badgeText ?? `+${item.points}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CENTER: Permanent 4-Line Crosshair */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        data-testid="hud-crosshair"
      >
        <div
          className="w-1 h-1 rounded-full"
          style={{
            backgroundColor: crosshairColor,
            boxShadow: '0 0 2px rgba(0,0,0,0.95)',
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[2px] h-[9px]"
          style={{
            bottom: `${gapPx}px`,
            backgroundColor: crosshairColor,
            boxShadow: '0 0 2px rgba(0,0,0,0.95)',
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[2px] h-[9px]"
          style={{
            top: `${gapPx}px`,
            backgroundColor: crosshairColor,
            boxShadow: '0 0 2px rgba(0,0,0,0.95)',
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[2px] w-[9px]"
          style={{
            right: `${gapPx}px`,
            backgroundColor: crosshairColor,
            boxShadow: '0 0 2px rgba(0,0,0,0.95)',
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[2px] w-[9px]"
          style={{
            left: `${gapPx}px`,
            backgroundColor: crosshairColor,
            boxShadow: '0 0 2px rgba(0,0,0,0.95)',
          }}
        />

        {/* Animated Diagonal Hit Marker & Distinct Headshot Double-Chevron */}
        {isHitActive && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            data-testid="hud-hit-marker"
          >
            <svg
              viewBox="0 0 44 44"
              className="w-9 h-9"
              style={{
                transform: `scale(${1 + (0.2 - Math.min(0.2, hud.hitMarkerTimer)) * 1.6})`,
              }}
            >
              {/* Primary 45-degree X Hit Ticks */}
              <line
                x1="10"
                y1="10"
                x2="16"
                y2="16"
                stroke={hud.hitMarkerHeadshot ? '#fbbf24' : '#ffffff'}
                strokeWidth={hud.hitMarkerHeadshot ? '2.6' : '2'}
                strokeLinecap="round"
              />
              <line
                x1="34"
                y1="10"
                x2="28"
                y2="16"
                stroke={hud.hitMarkerHeadshot ? '#fbbf24' : '#ffffff'}
                strokeWidth={hud.hitMarkerHeadshot ? '2.6' : '2'}
                strokeLinecap="round"
              />
              <line
                x1="10"
                y1="34"
                x2="16"
                y2="28"
                stroke={hud.hitMarkerHeadshot ? '#fbbf24' : '#ffffff'}
                strokeWidth={hud.hitMarkerHeadshot ? '2.6' : '2'}
                strokeLinecap="round"
              />
              <line
                x1="34"
                y1="34"
                x2="28"
                y2="28"
                stroke={hud.hitMarkerHeadshot ? '#fbbf24' : '#ffffff'}
                strokeWidth={hud.hitMarkerHeadshot ? '2.6' : '2'}
                strokeLinecap="round"
              />

              {/* Distinct Outer Crimson/Gold Double-Ticks on Headshot */}
              {hud.hitMarkerHeadshot && (
                <>
                  <line x1="6" y1="6" x2="11" y2="11" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" />
                  <line x1="38" y1="6" x2="33" y2="11" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" />
                  <line x1="6" y1="38" x2="11" y2="33" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" />
                  <line x1="38" y1="38" x2="33" y2="33" stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" />
                </>
              )}
            </svg>
          </div>
        )}

        {/* Satisfying Kill Confirmation Micro-Flare below Crosshair */}
        {(hud.killConfirmTimer ?? 0) > 0 && (
          <div
            className="absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-0.5 bg-[#0b0e14]/90 border rounded text-[10px] font-bold tracking-widest uppercase font-['Chakra_Petch']"
            style={{
              borderColor: hud.killConfirmHeadshot ? 'rgba(245, 158, 11, 0.8)' : 'rgba(239, 68, 68, 0.8)',
              color: hud.killConfirmHeadshot ? '#fbbf24' : '#f87171',
            }}
            data-testid="hud-kill-confirm"
          >
            {hud.killConfirmHeadshot ? '✦ HEADSHOT ELIMINATED +250' : '✕ HOSTILE ELIMINATED +100'}
          </div>
        )}

        {weapon.isReloading && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 bg-[#0b0e14]/90 border border-amber-500/60 rounded text-[10px] font-bold tracking-widest text-amber-400 uppercase">
            RELOADING {reloadProgress}%
          </div>
        )}
      </div>

      {/* BOTTOM LEFT: Player Health Bar & Health Number */}
      <div className="fixed bottom-5 left-5 w-72 px-4 py-3 bg-[#0b0e14]/85 border border-slate-700/70 rounded">
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className={`w-4 h-4 ${hpTextColorClass}`} fill="currentColor">
              <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z" />
            </svg>
            <span className="text-xs font-semibold tracking-widest text-slate-300 uppercase">
              HEALTH
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-bold tabular-nums font-['Chakra_Petch'] ${hpTextColorClass}`}
              data-testid="hud-health"
            >
              {hpInt}
            </span>
            <span className="text-xs text-slate-400 tabular-nums">/ {player.maxHp}</span>
          </div>
        </div>

        <div className="w-full h-3 bg-slate-900 border border-slate-700/80 rounded-sm overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ${hpBarColorClass}`}
            style={{ width: `${Math.max(0, Math.min(100, hpInt))}%` }}
            data-testid="hud-health-bar"
          />
        </div>
      </div>

      {/* BOTTOM RIGHT: Weapon Arsenal Selector + Active Magazine & Reserve Ammunition */}
      <div className="fixed bottom-5 right-5 flex flex-col items-end gap-2">
        {/* 3-Weapon Arsenal Selector Bar */}
        <div
          className="flex items-center gap-1.5 pointer-events-auto"
          data-testid="hud-weapon-selector"
        >
          {WEAPON_ORDER.map((wId) => {
            const wState = arsenal[wId];
            const isSelected = weapon.id === wId;
            return (
              <button
                key={wId}
                type="button"
                tabIndex={-1}
                data-testid={`weapon-slot-${wId}`}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSwitchWeapon(wId);
                }}
                className={`px-3 py-1.5 rounded border text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500/20 border-amber-400 text-white'
                    : 'bg-[#0b0e14]/85 border-slate-700/70 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between gap-2.5">
                  <span
                    className={`text-[10px] font-bold font-mono px-1 rounded ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {wState.keySlot}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider font-['Chakra_Petch'] whitespace-nowrap">
                    {wState.name}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-300">
                    {wState.magazine}/{wState.reserve}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Weapon Ammunition Panel */}
        <div className="min-w-[275px] px-5 py-3 bg-[#0b0e14]/85 border border-slate-700/70 rounded flex flex-col items-end">
          {weapon.isReloading && (
            <div
              className="mb-1.5 w-full flex items-center justify-between px-2.5 py-1 bg-amber-500/20 border border-amber-500/60 rounded text-xs font-bold tracking-widest text-amber-300 uppercase"
              data-testid="hud-reloading"
            >
              <span>RELOADING</span>
              <span className="tabular-nums">{reloadProgress}%</span>
            </div>
          )}

          {!weapon.isReloading && isLowAmmo && (
            <div
              className="mb-1.5 w-full text-center px-2.5 py-1 bg-red-500/20 border border-red-500/60 rounded text-xs font-bold tracking-widest text-red-400 uppercase"
              data-testid="hud-low-ammo"
            >
              {isOutOfAmmo ? 'OUT OF AMMO — FIND GREEN CRATE' : 'LOW AMMO — PRESS R'}
            </div>
          )}

          <div className="flex items-center justify-between w-full gap-4">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-400" fill="currentColor">
                <path d="M7 10c0-3.5 2-6.5 5-8 3 1.5 5 4.5 5 8v11H7V10zm2 2v7h6v-7H9z" />
              </svg>
              <div className="flex flex-col">
                <span
                  className="text-[11px] font-bold tracking-widest text-white uppercase font-['Chakra_Petch']"
                  data-testid="hud-weapon-name"
                >
                  {weapon.name}
                </span>
                <span className="text-[10px] text-slate-400">{weapon.caliber}</span>
              </div>
            </div>

            <div
              className="flex items-baseline gap-1.5 font-['Chakra_Petch'] tabular-nums"
              data-testid="hud-ammo"
            >
              <span
                className={`text-3xl font-bold ${
                  weapon.magazine === 0
                    ? 'text-red-400'
                    : isLowAmmo
                      ? 'text-amber-300'
                      : 'text-white'
                }`}
                data-testid="hud-ammo-mag"
              >
                {weapon.magazine}
              </span>
              <span className="text-lg text-slate-500 font-bold">/</span>
              <span
                className="text-xl font-semibold text-slate-300"
                data-testid="hud-ammo-reserve"
              >
                {weapon.reserve}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle Pointer Lock Hint at bottom center if unlocked */}
      {!hud.isPointerLocked && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-3.5 py-1.5 bg-[#0b0e14]/80 border border-slate-700/60 rounded text-xs text-slate-300 whitespace-nowrap">
          Click arena to lock mouse · 1/2/3 or Q Switch Gun · R Reload · Walk over Green Crates for Ammo
        </div>
      )}
    </div>
  );
};
