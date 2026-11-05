import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DebriefRequest {
  score: number;
  waveReached: number;
  enemiesEliminated: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  timeSurvivedSec: number;
  question?: string;
}

function buildFallbackDebrief(body: DebriefRequest) {
  const accuracy =
    body.shotsFired > 0 ? Math.round((body.shotsHit / body.shotsFired) * 100) : 0;
  const headshotRate =
    body.enemiesEliminated > 0
      ? Math.round((body.headshots / body.enemiesEliminated) * 100)
      : 0;

  const rating =
    body.waveReached >= 5 || body.score >= 2500
      ? 'S-RANK SPEC-OPS COMMANDER'
      : body.waveReached >= 3 || body.score >= 1000
        ? 'A-RANK VETERAN OPERATOR'
        : body.enemiesEliminated >= 3
          ? 'B-RANK ARENA COMBATANT'
          : 'C-RANK RECRUIT';

  const strengths: string[] = [];
  if (accuracy >= 45) {
    strengths.push(`High marksmanship discipline (${accuracy}% hit accuracy).`);
  } else {
    strengths.push('Sustained suppressive fire output under close-quarters pressure.');
  }
  if (headshotRate >= 35) {
    strengths.push(`Lethal precision targeting (${headshotRate}% headshot elimination ratio).`);
  } else {
    strengths.push('Consistent center-mass target neutralization.');
  }
  if (body.timeSurvivedSec >= 45) {
    strengths.push(`Strong arena perimeter kiting over ${Math.round(body.timeSurvivedSec)}s survival window.`);
  }

  const recommendations: string[] = [
    'Use the four concrete L-barriers at (±8m, ±8m) to break line-of-sight against Flanker and Breacher units while reloading (1.8s window).',
    'Aim at helmet visor level (Y ≈ 1.55m) for 2x headshot damage (50 HP per round) and +150 bonus score per elimination.',
    'Initiate tactical reloads (R) when magazine drops below 8 rounds before triggering the final wave kill.',
  ];

  const tacticalAnswer = body.question
    ? `Tactical Query Response ("${body.question}"): Maintain a clockwise perimeter rotation around the outer concrete barriers at Sprint speed (8 u/s) when enemies close within 3.5m. Prioritize Recon Flankers first, then funnel Heavy Breachers along narrow barrier lanes for rapid two-tap headshots.`
    : `Completed Wave ${body.waveReached} combat telemetry analysis: ${body.enemiesEliminated} hostiles neutralized with ${accuracy}% shot accuracy and ${body.headshots} confirmed cranial hits.`;

  return {
    rating,
    summary: tacticalAnswer,
    strengths,
    recommendations,
    modelUsed: 'tactical-heuristic-engine',
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post('/api/tactical-debrief', async (req, res) => {
    const body = (req.body || {}) as DebriefRequest;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.json(buildFallbackDebrief(body));
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const accuracy =
        body.shotsFired > 0
          ? Math.round((body.shotsHit / body.shotsFired) * 100)
          : 0;

      const prompt = `Analyze this 3D FPS Arena survival combat run and provide an elite military tactical debrief.
Combat Telemetry:
- Final Score: ${body.score ?? 0}
- Highest Wave Reached: ${body.waveReached ?? 1}
- Total Enemies Eliminated: ${body.enemiesEliminated ?? 0}
- Headshot Eliminations: ${body.headshots ?? 0}
- Shots Fired: ${body.shotsFired ?? 0} (Accuracy: ${accuracy}%)
- Time Survived: ${Math.round(body.timeSurvivedSec ?? 0)} seconds
${body.question ? `- Operator Tactical Question: ${body.question}` : ''}

Arena Specs:
- 40x40 enclosed industrial concrete arena with concrete barriers, crates, and barrels.
- Assault Rifle: 30/120 ammo, 25 dmg body / 50 dmg headshot, 10 rds/sec, 1.8s reload.
- Hostiles: Assault Troopers, Flankers, and Heavy Breachers (100+ HP, 2.5+ u/s speed, 10 HP melee attack with 1s cooldown).`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-argon',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an elite military tactical combat AI advisor for 3D FPS Arena. Provide concise, actionable, high-precision combat telemetry analysis in JSON format.',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rating: {
                type: Type.STRING,
                description: 'Short military rank rating, e.g., S-RANK SPEC-OPS COMMANDER',
              },
              summary: {
                type: Type.STRING,
                description: '2-3 sentence deep tactical evaluation or direct answer to the operator question.',
              },
              strengths: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2-3 specific combat strengths observed from the metrics.',
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 concrete arena survival tactics tailored to the operator metrics.',
              },
            },
            required: ['rating', 'summary', 'strengths', 'recommendations'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        rating: parsed.rating || 'A-RANK TACTICAL OPERATOR',
        summary: parsed.summary || buildFallbackDebrief(body).summary,
        strengths:
          Array.isArray(parsed.strengths) && parsed.strengths.length > 0
            ? parsed.strengths
            : buildFallbackDebrief(body).strengths,
        recommendations:
          Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0
            ? parsed.recommendations
            : buildFallbackDebrief(body).recommendations,
        modelUsed: 'gemini-4-argon (ThinkingLevel.HIGH)',
      });
    } catch (_error) {
      res.json(buildFallbackDebrief(body));
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`3D FPS Arena server running on http://localhost:${PORT}`);
  });
}

startServer();
