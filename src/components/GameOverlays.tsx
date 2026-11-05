import React, { useState } from 'react';
import type { GameState, MatchStats } from '../game/rules';
import { soundSystem } from '../game/sound';

interface DebriefResponse {
  rating: string;
  summary: string;
  strengths: string[];
  recommendations: string[];
  modelUsed?: string;
}

interface GameOverlaysProps {
  gameState: GameState;
  stats: MatchStats;
  bestScore: number;
  highestWave: number;
  onStartGame: () => void;
  onResumeGame: () => void;
  onRestartGame: () => void;
  onReturnToTitle: () => void;
}

export const GameOverlays: React.FC<GameOverlaysProps> = ({
  gameState,
  stats,
  bestScore,
  highestWave,
  onStartGame,
  onResumeGame,
  onRestartGame,
  onReturnToTitle,
}) => {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [debriefData, setDebriefData] = useState<DebriefResponse | null>(null);
  const [tacticalQuestion, setTacticalQuestion] = useState('');
  const [showTacticalModal, setShowTacticalModal] = useState(false);

  if (gameState === 'playing') {
    return null;
  }

  const formatTime = (sec: number) => {
    const total = Math.max(0, Math.floor(sec));
    const mins = Math.floor(total / 60);
    const rem = total % 60;
    return `${mins}:${rem.toString().padStart(2, '0')}`;
  };

  const requestTacticalDebrief = async (customQuestion?: string) => {
    soundSystem.playButtonClick();
    setDebriefLoading(true);
    try {
      const response = await fetch('/api/tactical-debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: stats.score,
          waveReached: stats.wave,
          enemiesEliminated: stats.totalEnemiesEliminated,
          headshots: stats.headshots,
          shotsFired: stats.shotsFired,
          shotsHit: stats.shotsHit,
          timeSurvivedSec: stats.timeSurvivedSec,
          question: customQuestion || undefined,
        }),
      });
      const data = (await response.json()) as DebriefResponse;
      setDebriefData(data);
    } catch {
      setDebriefData({
        rating: 'A-RANK TACTICAL OPERATOR',
        summary:
          'Maintain perimeter mobility around the four mid-arena concrete barriers and reload before wave transitions.',
        strengths: ['Consistent target engagement under arena pressure.'],
        recommendations: [
          'Aim for helmet visors for 2x damage and +150 headshot bonus points.',
          'Keep magazine above 8 rounds before eliminating the last hostile in a wave.',
        ],
      });
    } finally {
      setDebriefLoading(false);
    }
  };

  // 1. MAIN MENU (Title Screen)
  if (gameState === 'title') {
    return (
      <div
        className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-14 pointer-events-none select-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(9,12,18,0.92) 0%, rgba(9,12,18,0.68) 46%, rgba(9,12,18,0.18) 100%)',
        }}
        data-testid="main-menu"
      >
        {/* Top subtle military spec header */}
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
            SECTOR 04 · LIVE COMBAT TRAINING GROUND
          </div>
          {bestScore > 0 && (
            <div className="text-xs font-medium text-slate-300 tabular-nums">
              BEST SCORE: <span className="text-amber-400 font-bold">{bestScore}</span> · HIGHEST WAVE:{' '}
              <span className="text-white font-bold">{highestWave}</span>
            </div>
          )}
        </div>

        {/* Left-third negative-space hero lockup */}
        <div className="max-w-xl my-auto pointer-events-auto">
          {/* Bespoke Inline SVG Title Emblem & Lockup */}
          <div className="mb-3 flex items-center gap-3">
            <svg
              viewBox="0 0 64 64"
              className="w-12 h-12 shrink-0"
              fill="none"
              aria-hidden="true"
            >
              <polygon
                points="32,4 58,18 58,46 32,60 6,46 6,18"
                fill="#111622"
                stroke="#f59e0b"
                strokeWidth="3"
              />
              <polygon
                points="32,12 50,22 50,42 32,52 14,42 14,22"
                fill="#1b2234"
                stroke="#ef4444"
                strokeWidth="1.5"
              />
              <circle cx="32" cy="32" r="9" stroke="#f8fafc" strokeWidth="2.2" />
              <line x1="32" y1="16" x2="32" y2="25" stroke="#f59e0b" strokeWidth="2.5" />
              <line x1="32" y1="39" x2="32" y2="48" stroke="#f59e0b" strokeWidth="2.5" />
              <line x1="16" y1="32" x2="25" y2="32" stroke="#f59e0b" strokeWidth="2.5" />
              <line x1="39" y1="32" x2="48" y2="32" stroke="#f59e0b" strokeWidth="2.5" />
              <circle cx="32" cy="32" r="3" fill="#ef4444" />
            </svg>
            <span className="text-xs font-semibold tracking-[0.24em] text-amber-400 uppercase">
              TACTICAL SURVIVAL SIMULATION
            </span>
          </div>

          <h1
            className="text-5xl md:text-6xl font-bold tracking-tight text-white uppercase font-['Chakra_Petch'] leading-none mb-3"
            style={{ textShadow: '0 4px 24px rgba(0,0,0,0.85)' }}
          >
            3D FPS ARENA
          </h1>

          <p className="text-lg md:text-xl font-semibold tracking-[0.18em] text-slate-300 uppercase font-['Chakra_Petch'] mb-8">
            SURVIVE. SHOOT. REPEAT.
          </p>

          {/* Primary Menu Buttons */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              data-start="true"
              data-testid="play-button"
              onClick={(e) => {
                e.currentTarget.blur();
                soundSystem.initOnInteraction();
                soundSystem.playButtonClick();
                onStartGame();
              }}
              className="px-8 py-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-lg tracking-wider uppercase rounded transition-colors cursor-pointer font-['Chakra_Petch'] whitespace-nowrap shrink-0"
            >
              PLAY
            </button>

            <button
              type="button"
              data-testid="how-to-play-button"
              onClick={(e) => {
                e.currentTarget.blur();
                soundSystem.initOnInteraction();
                soundSystem.playButtonClick();
                setShowHowToPlay((prev) => !prev);
              }}
              className="px-6 py-4 bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-600 font-semibold text-base tracking-wider uppercase rounded transition-colors cursor-pointer font-['Chakra_Petch'] whitespace-nowrap shrink-0"
            >
              HOW TO PLAY
            </button>
          </div>

          {/* HOW TO PLAY Panel */}
          {showHowToPlay && (
            <div
              className="mt-6 p-6 bg-[#0d111a]/95 border border-slate-700 rounded max-w-lg"
              data-testid="how-to-play-modal"
            >
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
                <h2 className="text-base font-bold tracking-wider text-amber-400 uppercase font-['Chakra_Petch']">
                  COMBAT CONTROLS & BRIEFING
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    soundSystem.playButtonClick();
                    setShowHowToPlay(false);
                  }}
                  className="text-xs font-semibold text-slate-400 hover:text-white uppercase cursor-pointer"
                >
                  CLOSE
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm text-slate-200 font-mono">
                <div>WASD — Move</div>
                <div>Mouse — Aim</div>
                <div>Left Click — Shoot</div>
                <div>R — Reload</div>
                <div>1 / 2 / 3 / Q — Switch Gun</div>
                <div>SPACE — Jump</div>
                <div>SHIFT — Sprint</div>
                <div>ESC — Release mouse</div>
              </div>

              <p className="mt-4 text-xs text-slate-400 leading-relaxed">
                Switch between the Assault Rifle [1], Tactical Shotgun [2], and Heavy Magnum [3]. Walk over glowing green Supply Crates in the arena or dropped by defeated enemies to resupply ammunition.
              </p>
            </div>
          )}
        </div>

        {/* Single flat bottom control-hint line */}
        <div className="text-xs text-slate-300 tracking-wide font-mono">
          WASD Move · Mouse Aim · Left Click Shoot · 1/2/3/Q Switch Gun · R Reload · SPACE Jump · SHIFT Sprint · ESC Pause
        </div>
      </div>
    );
  }

  // 2. PAUSE OVERLAY (gameState === 'paused')
  if (gameState === 'paused') {
    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-[#070a0f]/85 select-none"
        data-testid="pause-overlay"
      >
        <div className="w-full max-w-md p-8 bg-[#0f141d] border border-slate-700 rounded shadow-2xl">
          <div className="text-xs font-semibold tracking-widest text-amber-400 uppercase mb-1">
            SIMULATION SUSPENDED
          </div>
          <h2 className="text-3xl font-bold text-white tracking-wider uppercase font-['Chakra_Petch'] mb-6">
            GAME PAUSED
          </h2>

          {/* Live Run Snapshot */}
          <div className="grid grid-cols-3 gap-3 mb-6 p-3.5 bg-[#090c12] border border-slate-800 rounded">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">WAVE</div>
              <div className="text-xl font-bold text-white tabular-nums font-['Chakra_Petch']">
                {stats.wave}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">SCORE</div>
              <div className="text-xl font-bold text-amber-400 tabular-nums font-['Chakra_Petch']">
                {stats.score}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">ELIMINATED</div>
              <div className="text-xl font-bold text-emerald-400 tabular-nums font-['Chakra_Petch']">
                {stats.totalEnemiesEliminated}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              data-testid="resume-button"
              onClick={(e) => {
                e.currentTarget.blur();
                soundSystem.playButtonClick();
                onResumeGame();
              }}
              className="w-full py-3.5 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base tracking-wider uppercase rounded transition-colors cursor-pointer font-['Chakra_Petch']"
            >
              RESUME
            </button>

            <button
              type="button"
              data-testid="pause-restart-button"
              onClick={(e) => {
                e.currentTarget.blur();
                soundSystem.playButtonClick();
                setDebriefData(null);
                onRestartGame();
              }}
              className="w-full py-3.5 px-5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 font-semibold text-base tracking-wider uppercase rounded transition-colors cursor-pointer font-['Chakra_Petch']"
            >
              RESTART
            </button>

            <button
              type="button"
              data-testid="pause-main-menu-button"
              onClick={(e) => {
                e.currentTarget.blur();
                soundSystem.playButtonClick();
                setDebriefData(null);
                onReturnToTitle();
              }}
              className="w-full py-3.5 px-5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-semibold text-base tracking-wider uppercase rounded transition-colors cursor-pointer font-['Chakra_Petch']"
            >
              MAIN MENU
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. GAME OVER OVERLAY (gameState === 'gameover')
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-[#09070a]/90 select-none overflow-y-auto"
      data-testid="gameover-overlay"
    >
      <div className="w-full max-w-xl p-8 bg-[#11141d] border border-red-500/50 rounded shadow-2xl my-auto">
        <div className="text-xs font-semibold tracking-widest text-red-400 uppercase mb-1">
          OPERATOR KIA · COMBAT TERMINATED
        </div>
        <h2 className="text-4xl font-bold text-white tracking-wider uppercase font-['Chakra_Petch'] mb-6">
          GAME OVER
        </h2>

        {/* Required 4 Game-Over Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-3.5 bg-[#0a0d14] border border-slate-800 rounded">
            <div className="text-[11px] text-slate-400 uppercase">Final Score</div>
            <div
              className="text-2xl font-bold text-amber-400 tabular-nums font-['Chakra_Petch'] mt-0.5"
              data-testid="gameover-score"
            >
              {Math.round(stats.score)}
            </div>
          </div>

          <div className="p-3.5 bg-[#0a0d14] border border-slate-800 rounded">
            <div className="text-[11px] text-slate-400 uppercase">Highest Wave</div>
            <div
              className="text-2xl font-bold text-white tabular-nums font-['Chakra_Petch'] mt-0.5"
              data-testid="gameover-wave"
            >
              {stats.wave}
            </div>
          </div>

          <div className="p-3.5 bg-[#0a0d14] border border-slate-800 rounded">
            <div className="text-[11px] text-slate-400 uppercase">Enemies Eliminated</div>
            <div
              className="text-2xl font-bold text-emerald-400 tabular-nums font-['Chakra_Petch'] mt-0.5"
              data-testid="gameover-kills"
            >
              {stats.totalEnemiesEliminated}
            </div>
          </div>

          <div className="p-3.5 bg-[#0a0d14] border border-slate-800 rounded">
            <div className="text-[11px] text-slate-400 uppercase">Time Survived</div>
            <div
              className="text-2xl font-bold text-slate-200 tabular-nums font-['Chakra_Petch'] mt-0.5"
              data-testid="gameover-time"
            >
              {formatTime(stats.timeSurvivedSec)}
            </div>
          </div>
        </div>

        {/* Primary Game Over Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <button
            type="button"
            data-start="true"
            data-testid="play-again-button"
            onClick={(e) => {
              e.currentTarget.blur();
              soundSystem.playButtonClick();
              setDebriefData(null);
              onRestartGame();
            }}
            className="flex-1 py-3.5 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base tracking-wider uppercase rounded transition-colors cursor-pointer font-['Chakra_Petch'] whitespace-nowrap"
          >
            PLAY AGAIN
          </button>

          <button
            type="button"
            data-testid="gameover-main-menu-button"
            onClick={(e) => {
              e.currentTarget.blur();
              soundSystem.playButtonClick();
              setDebriefData(null);
              onReturnToTitle();
            }}
            className="flex-1 py-3.5 px-6 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 font-semibold text-base tracking-wider uppercase rounded transition-colors cursor-pointer font-['Chakra_Petch'] whitespace-nowrap"
          >
            MAIN MENU
          </button>
        </div>

        {/* High-Thinking AI Tactical After-Action Debrief (gemini-4-argon) */}
        <div className="pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
              TACTICAL COMBAT DEBRIEF & STRATEGY
            </span>
            <button
              type="button"
              onClick={() => {
                setShowTacticalModal(true);
                if (!debriefData && !debriefLoading) {
                  requestTacticalDebrief();
                }
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-semibold text-amber-400 uppercase cursor-pointer transition-colors"
            >
              {debriefLoading ? 'ANALYZING TELEMETRY...' : 'ANALYZE RUN'}
            </button>
          </div>

          {showTacticalModal && (
            <div className="p-4 bg-[#0a0d14] border border-slate-800 rounded space-y-3 text-xs">
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Ask a tactical combat question"
                  value={tacticalQuestion}
                  onChange={(e) => setTacticalQuestion(e.target.value)}
                  placeholder="Ask tactical advisor (e.g. How to survive Wave 4 breachers?)"
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  disabled={debriefLoading}
                  onClick={() => requestTacticalDebrief(tacticalQuestion)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded uppercase cursor-pointer whitespace-nowrap"
                >
                  ASK
                </button>
              </div>

              {debriefLoading && (
                <div className="text-slate-400 py-2">
                  Running deep tactical telemetry reasoning...
                </div>
              )}

              {debriefData && !debriefLoading && (
                <div className="space-y-2 text-slate-300">
                  <div className="font-bold text-amber-400 uppercase tracking-wide">
                    RATING: {debriefData.rating}
                  </div>
                  <p className="leading-relaxed text-slate-200">{debriefData.summary}</p>
                  <div className="space-y-1 pt-1">
                    <div className="font-semibold text-slate-400 uppercase text-[11px]">
                      RECOMMENDED TACTICS:
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-slate-300">
                      {debriefData.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
