import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FpsArenaCanvas,
  type FpsGameController,
} from './components/FpsArenaCanvas';
import { GameHud, type HudSnapshot } from './components/GameHud';
import { GameOverlays } from './components/GameOverlays';
import {
  createInitialArsenal,
  createInitialMatchStats,
  createInitialPlayerState,
  createInitialWeaponState,
  type GameState,
  type MatchStats,
  type WeaponId,
} from './game/rules';

function getInitialGameState(): GameState {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      return 'playing';
    }
  }
  return 'title';
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>(getInitialGameState);
  const [bestScore, setBestScore] = useState<number>(0);
  const [highestWave, setHighestWave] = useState<number>(1);

  const [hud, setHud] = useState<HudSnapshot>(() => ({
    player: createInitialPlayerState(),
    weapon: createInitialWeaponState('rifle'),
    arsenal: createInitialArsenal(),
    stats: createInitialMatchStats(),
    killFeed: [],
    crosshairSpread: 0,
    hitMarkerTimer: 0,
    hitMarkerHeadshot: false,
    damageFlashAlpha: 0,
    isPointerLocked: false,
    isMuted: false,
    waveAnnouncementText: 'WAVE 1 — SURVIVE & ELIMINATE',
  }));

  const controllerRef = useRef<FpsGameController | null>(null);

  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  const handleGameStateChange = useCallback(
    (nextState: GameState, finalStats?: MatchStats) => {
      setGameState(nextState);
      document.body.dataset.state = nextState;
      if (finalStats) {
        setBestScore((prev) => Math.max(prev, Math.round(finalStats.score)));
        setHighestWave((prev) => Math.max(prev, finalStats.wave));
        setHud((prev) => ({
          ...prev,
          stats: finalStats,
        }));
      }
    },
    [],
  );

  const handleStartGame = useCallback(() => {
    controllerRef.current?.startNewGame();
  }, []);

  const handlePauseGame = useCallback(() => {
    controllerRef.current?.pauseGame();
  }, []);

  const handleResumeGame = useCallback(() => {
    controllerRef.current?.resumeGame();
  }, []);

  const handleRestartGame = useCallback(() => {
    controllerRef.current?.startNewGame();
  }, []);

  const handleReturnToTitle = useCallback(() => {
    controllerRef.current?.returnToTitle();
  }, []);

  const handleToggleMute = useCallback(() => {
    controllerRef.current?.toggleMute();
  }, []);

  const handleSwitchWeapon = useCallback((weaponId: WeaponId) => {
    controllerRef.current?.switchWeapon(weaponId);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b0e14]">
      {/* Isolated 3D WebGL Arena Viewport */}
      <FpsArenaCanvas
        gameState={gameState}
        onGameStateChange={handleGameStateChange}
        onHudUpdate={setHud}
        controllerRef={controllerRef}
      />

      {/* Active Gameplay HUD */}
      {gameState === 'playing' && (
        <GameHud
          hud={hud}
          onToggleMute={handleToggleMute}
          onPauseGame={handlePauseGame}
          onRestartGame={handleRestartGame}
          onSwitchWeapon={handleSwitchWeapon}
        />
      )}

      {/* Title Screen, Pause Modal & Game Over Modal */}
      <GameOverlays
        gameState={gameState}
        stats={hud.stats}
        bestScore={bestScore}
        highestWave={highestWave}
        onStartGame={handleStartGame}
        onResumeGame={handleResumeGame}
        onRestartGame={handleRestartGame}
        onReturnToTitle={handleReturnToTitle}
      />
    </main>
  );
}
