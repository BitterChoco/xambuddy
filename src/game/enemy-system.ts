import { getRemoteAssetSource, hasRemoteAsset } from "@/services/remote-assets";

export type Vector = { x: number; y: number };

export type Enemy = {
  id: number;
  imageAsset: string;
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  color: string;
  isBoss: boolean;
  arenaBossId?: string;
  repositionTimer?: number;
  repositionTarget?: Vector | null;
  scoreReward?: number;
  hitFlashTimer?: number;
  knockbackX?: number;
  knockbackY?: number;
};

export type ArenaBossPattern = "artillery" | "charger";
export type BossPhase = "idle" | "warning" | "entrance" | "active";
export type BossAttackPhase = "cooldown" | "telegraph" | "dash";

export type ArenaBossConfig = {
  id: string;
  name: string;
  pattern: ArenaBossPattern;
  color: string;
  fallbackIcon: string;
  imageAsset: string | null;
  health: number;
  contactDamage: number;
  projectileDamage: number;
  areaDamage: number;
  dashDamage: number;
  scoreReward: number;
};

export type BossProjectile = {
  id: number;
  x: number;
  y: number;
  target: Vector;
  vx: number;
  vy: number;
  speed: number;
  radius: number;
  damage: number;
  life: number;
  color: string;
};

export type BossAreaEffect = {
  id: number;
  x: number;
  y: number;
  radius: number;
  life: number;
};

export type EnemyTarget = {
  id: "host" | "join";
  x: number;
  y: number;
  radius: number;
  buddyId: string;
};

export type BossAttackState = {
  phase: BossPhase;
  phaseTimer: number;
  entrancePoint: Vector | null;
  configId: string | null;
  name: string;
  health: number;
  healthMax: number;
  attackPhase: BossAttackPhase;
  attackTimer: number;
  telegraphTarget: Vector | null;
  dashDirection: Vector | null;
  dashHasHit: boolean;
  projectiles: BossProjectile[];
  areaEffects: BossAreaEffect[];
};

export type ConsumableDropConfig = {
  stayDurationSeconds: number;
  flickerDurationSeconds: number;
  flickerIntervalSeconds: number;
  pickupRadius: number;
  iconSize: number;
};

export const ARENA_WIDTH = 640;
export const ARENA_HEIGHT = 360;
export const MAX_ACTIVE_ENEMIES = 18;
export const WAVES_PER_ARENA = 10;
export const BOSS_WARNING_DURATION = 5;
export const BOSS_ENTRANCE_DURATION = 2.8;
export const BOSS_REPOSITION_INTERVAL = 10;
export const BOSS_REPOSITION_SPEED = 120;
export const BOSS_CHEST_LIFETIME = 600;
export const BOSS_ATTACK_TELEGRAPH_DURATION = 1.35;
export const BOSS_DASH_DURATION = 0.72;
export const BOSS_DASH_SPEED = 520;
export const BOSS_AREA_RADIUS = 74;

export const BOSS_CHEST_CONFIG: ConsumableDropConfig = {
  stayDurationSeconds: BOSS_CHEST_LIFETIME,
  flickerDurationSeconds: 0,
  flickerIntervalSeconds: 0.4,
  pickupRadius: 34,
  iconSize: 42,
};

const ENEMY_IMAGE_ASSETS = {
  small: [
    "game/enemy/enemy_1-1.png",
    "game/enemy/enemy_1-2.png",
    "game/enemy/enemy_1-3.png",
    "game/enemy/enemy_1-4.png",
  ],
  elite: ["game/enemy/enemy_2-1.png", "game/enemy/enemy_2-2.png"],
  boss: ["game/enemy/enemy_3-1.png", "game/enemy/enemy_3-2.png"],
};

export const BOSS_CONFIGS: ArenaBossConfig[] = [
  {
    id: "thorn-titan",
    name: "Thorn Titan",
    pattern: "artillery",
    color: "#fb7185",
    fallbackIcon: "♛",
    imageAsset: null,
    health: 5000,
    contactDamage: 18,
    projectileDamage: 38,
    areaDamage: 46,
    dashDamage: 0,
    scoreReward: 1500,
  },
  {
    id: "bloom-beast",
    name: "Bloom Beast",
    pattern: "charger",
    color: "#c084fc",
    fallbackIcon: "✿",
    imageAsset: null,
    health: 8000,
    contactDamage: 14,
    projectileDamage: 0,
    areaDamage: 0,
    dashDamage: 58,
    scoreReward: 1800,
  },
];

export function clampEnemyValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeEnemyVector(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

export function getWaveEnemyCount(wave: number) {
  return 4 + wave;
}

export function createBossEntrancePoint(): Vector {
  const side = Math.floor(Math.random() * 4);
  const inset = 42;
  if (side === 0 || side === 2) {
    return {
      x: side === 0 ? inset : ARENA_WIDTH - inset,
      y: 58 + Math.random() * (ARENA_HEIGHT - 116),
    };
  }
  return {
    x: 58 + Math.random() * (ARENA_WIDTH - 116),
    y: side === 1 ? inset : ARENA_HEIGHT - inset,
  };
}

export function createArtilleryBossPosition(currentPosition: Vector): Vector {
  let nextPosition = currentPosition;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    nextPosition = {
      x: 90 + Math.random() * (ARENA_WIDTH - 180),
      y: 130 + Math.random() * (ARENA_HEIGHT - 240),
    };
    if (
      Math.hypot(
        nextPosition.x - currentPosition.x,
        nextPosition.y - currentPosition.y,
      ) >= 100
    ) {
      break;
    }
  }
  return nextPosition;
}

export function getArenaBossForWave(wave: number): ArenaBossConfig {
  const encounterIndex = Math.max(0, Math.floor(wave / WAVES_PER_ARENA) - 1);
  return BOSS_CONFIGS[encounterIndex % BOSS_CONFIGS.length];
}

export function getArenaBossById(id: string | null | undefined) {
  return BOSS_CONFIGS.find((boss) => boss.id === id);
}

function getRandomEnemyImageAsset(kind: keyof typeof ENEMY_IMAGE_ASSETS) {
  const assets = ENEMY_IMAGE_ASSETS[kind];
  const availableAssets = assets.filter(hasRemoteAsset);
  const candidates = availableAssets.length ? availableAssets : assets;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function getEnemyImageSource(enemy: Enemy) {
  return getRemoteAssetSource(enemy.imageAsset);
}

export function getEnemyFacing(enemy: Enemy, target: { x: number } | null) {
  if (!target) return 1;
  return enemy.x < target.x ? 1 : -1;
}

export function getEnemyScoreReward(enemy: Enemy) {
  return enemy.scoreReward ?? (enemy.isBoss ? 50 : 10);
}

export function applyEnemyHit(enemy: Enemy, source: Vector, strength = 260) {
  const directionX = enemy.x - source.x;
  const directionY = enemy.y - source.y;
  const distance = Math.hypot(directionX, directionY) || 1;
  return {
    ...enemy,
    hitFlashTimer: 1,
    knockbackX: (enemy.knockbackX ?? 0) + (directionX / distance) * strength,
    knockbackY: (enemy.knockbackY ?? 0) + (directionY / distance) * strength,
  };
}

export function makeEnemy(wave: number, id: number): Enemy {
  const isBoss = wave > 1 && wave % 3 === 0 && Math.random() > 0.6;
  const bossBonus = isBoss ? 2.8 : 1;
  const radius = isBoss ? 28 : 15 + Math.random() * 7;
  const side = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;

  switch (side) {
    case 0:
      x = Math.random() * ARENA_WIDTH;
      y = -radius;
      break;
    case 1:
      x = ARENA_WIDTH + radius;
      y = Math.random() * ARENA_HEIGHT;
      break;
    case 2:
      x = Math.random() * ARENA_WIDTH;
      y = ARENA_HEIGHT + radius;
      break;
    default:
      x = -radius;
      y = Math.random() * ARENA_HEIGHT;
      break;
  }

  return {
    id,
    imageAsset: getRandomEnemyImageAsset(isBoss ? "elite" : "small"),
    x,
    y,
    radius,
    health: (isBoss ? 140 : 28) * bossBonus,
    maxHealth: (isBoss ? 140 : 28) * bossBonus,
    speed: (isBoss ? 26 : 44) * bossBonus,
    damage: isBoss ? 14 : 8,
    color: isBoss ? "#f97316" : "#34d399",
    isBoss,
  };
}

export function makeArenaBoss(
  config: ArenaBossConfig,
  wave: number,
  entrancePoint: Vector,
): Enemy {
  const encounterNumber = Math.max(1, Math.floor(wave / WAVES_PER_ARENA));
  const health = config.health + (encounterNumber - 1) * 250;
  return {
    id: Date.now() + Math.random(),
    imageAsset: getRandomEnemyImageAsset("boss"),
    x: entrancePoint.x,
    y: entrancePoint.y,
    radius: 42,
    health,
    maxHealth: health,
    speed: 0,
    damage: config.contactDamage,
    color: config.color,
    isBoss: true,
    arenaBossId: config.id,
    repositionTimer: BOSS_REPOSITION_INTERVAL,
    repositionTarget: null,
    scoreReward: config.scoreReward,
  };
}

export function distanceToSegment(point: Vector, start: Vector, end: Vector) {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const t =
    lengthSquared === 0
      ? 0
      : clampEnemyValue(
          ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
            lengthSquared,
          0,
          1,
        );
  return Math.hypot(
    point.x - (start.x + t * segmentX),
    point.y - (start.y + t * segmentY),
  );
}

export function advanceEnemyPositions({
  enemies,
  livingPlayers,
  delta,
  bossPhase,
  previousBossPhase,
  bossPhaseTimer,
  bossAttackPhase,
  bossDashDirection,
  bossDashHasHit,
  bossEntrancePoint,
  getDefenseMultiplier,
}: {
  enemies: Enemy[];
  livingPlayers: EnemyTarget[];
  delta: number;
  bossPhase: BossPhase;
  previousBossPhase: BossPhase;
  bossPhaseTimer: number;
  bossAttackPhase: BossAttackPhase;
  bossDashDirection: Vector | null;
  bossDashHasHit: boolean;
  bossEntrancePoint: Vector | null;
  getDefenseMultiplier: (buddyId: string) => number;
}) {
  let dashHasHit = bossDashHasHit;
  let bossDamageHost = 0;
  let bossDamageJoin = 0;

  const nextEnemies = enemies.map((enemy) => {
    const knockbackX = enemy.knockbackX ?? 0;
    const knockbackY = enemy.knockbackY ?? 0;
    const knockbackDecay = Math.exp(-8 * delta);
    const hitMotion = {
      knockbackX: knockbackX * knockbackDecay,
      knockbackY: knockbackY * knockbackDecay,
      hitFlashTimer: Math.max(0, (enemy.hitFlashTimer ?? 0) - delta),
    };
    const applyHitMotion = (nextEnemy: Enemy): Enemy => ({
      ...nextEnemy,
      x: nextEnemy.x + knockbackX * delta,
      y: nextEnemy.y + knockbackY * delta,
      ...hitMotion,
    });

    if (enemy.arenaBossId) {
      const arenaBossConfig = getArenaBossById(enemy.arenaBossId);
      if (previousBossPhase === "entrance" && bossEntrancePoint) {
        const progress = clampEnemyValue(
          1 - bossPhaseTimer / BOSS_ENTRANCE_DURATION,
          0,
          1,
        );
        const entranceY = arenaBossConfig?.pattern === "artillery" ? 132 : 58;
        const wiggle =
          Math.sin((BOSS_ENTRANCE_DURATION - bossPhaseTimer) * 22) *
          22 *
          (1 - progress);
        return applyHitMotion({
          ...enemy,
          x:
            bossEntrancePoint.x +
            (ARENA_WIDTH / 2 - bossEntrancePoint.x) * progress +
            wiggle,
          y: bossEntrancePoint.y + (entranceY - bossEntrancePoint.y) * progress,
        });
      }
      if (
        bossPhase === "active" &&
        bossAttackPhase === "dash" &&
        bossDashDirection
      ) {
        const nextX = clampEnemyValue(
          enemy.x + bossDashDirection.x * BOSS_DASH_SPEED * delta,
          enemy.radius,
          ARENA_WIDTH - enemy.radius,
        );
        const nextY = clampEnemyValue(
          enemy.y + bossDashDirection.y * BOSS_DASH_SPEED * delta,
          enemy.radius,
          ARENA_HEIGHT - enemy.radius,
        );
        const start = { x: enemy.x, y: enemy.y };
        const end = { x: nextX, y: nextY };
        if (!dashHasHit) {
          for (const candidate of livingPlayers) {
            if (
              distanceToSegment(candidate, start, end) <=
              enemy.radius + candidate.radius
            ) {
              const config = getArenaBossById(enemy.arenaBossId);
              const damage =
                (config?.dashDamage ?? 50) *
                getDefenseMultiplier(candidate.buddyId);
              if (candidate.id === "host") bossDamageHost += damage;
              else bossDamageJoin += damage;
              dashHasHit = true;
              break;
            }
          }
        }
        return applyHitMotion({ ...enemy, x: nextX, y: nextY });
      }
      if (bossPhase === "active" && arenaBossConfig?.pattern === "artillery") {
        let repositionTimer =
          (enemy.repositionTimer ?? BOSS_REPOSITION_INTERVAL) - delta;
        let repositionTarget = enemy.repositionTarget ?? null;
        if (
          repositionTimer <= 0 &&
          !repositionTarget &&
          bossAttackPhase === "cooldown"
        ) {
          repositionTarget = createArtilleryBossPosition(enemy);
          repositionTimer = BOSS_REPOSITION_INTERVAL;
        }

        let x = enemy.x;
        let y = enemy.y;
        if (repositionTarget) {
          const dx = repositionTarget.x - enemy.x;
          const dy = repositionTarget.y - enemy.y;
          const distance = Math.hypot(dx, dy);
          const step = BOSS_REPOSITION_SPEED * delta;
          if (distance <= step || distance === 0) {
            x = repositionTarget.x;
            y = repositionTarget.y;
            repositionTarget = null;
          } else {
            x += (dx / distance) * step;
            y += (dy / distance) * step;
          }
        }
        return applyHitMotion({
          ...enemy,
          x,
          y,
          repositionTimer,
          repositionTarget,
        });
      }
      return applyHitMotion(enemy);
    }

    const target = livingPlayers.reduce((closest, candidate) =>
      Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) <
      Math.hypot(closest.x - enemy.x, closest.y - enemy.y)
        ? candidate
        : closest,
    );
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const newX = enemy.x + (dx / distance) * enemy.speed * delta;
    const newY = enemy.y + (dy / distance) * enemy.speed * delta;
    return applyHitMotion({
      ...enemy,
      x: clampEnemyValue(newX, enemy.radius, ARENA_WIDTH - enemy.radius),
      y: clampEnemyValue(newY, enemy.radius, ARENA_HEIGHT - enemy.radius),
    });
  });

  return { enemies: nextEnemies, dashHasHit, bossDamageHost, bossDamageJoin };
}

export function advanceBossProjectiles({
  projectiles,
  livingPlayers,
  delta,
  getDefenseMultiplier,
}: {
  projectiles: BossProjectile[];
  livingPlayers: EnemyTarget[];
  delta: number;
  getDefenseMultiplier: (buddyId: string) => number;
}) {
  let damageHost = 0;
  let damageJoin = 0;
  const hitIds = new Set<number>();

  for (const projectile of projectiles) {
    const start = { x: projectile.x, y: projectile.y };
    const remainingDistance = Math.hypot(
      projectile.target.x - projectile.x,
      projectile.target.y - projectile.y,
    );
    const travelDistance = projectile.speed * delta;
    const reachesTarget = remainingDistance <= travelDistance;
    const end = {
      x: reachesTarget
        ? projectile.target.x
        : projectile.x + projectile.vx * travelDistance,
      y: reachesTarget
        ? projectile.target.y
        : projectile.y + projectile.vy * travelDistance,
    };
    for (const candidate of livingPlayers) {
      if (
        distanceToSegment(candidate, start, end) <=
        projectile.radius + candidate.radius
      ) {
        const damage =
          projectile.damage * getDefenseMultiplier(candidate.buddyId);
        if (candidate.id === "host") damageHost += damage;
        else damageJoin += damage;
        hitIds.add(projectile.id);
        break;
      }
    }
    if (hitIds.has(projectile.id)) continue;
    projectile.x = end.x;
    projectile.y = end.y;
    if (
      reachesTarget ||
      projectile.x < -projectile.radius ||
      projectile.x > ARENA_WIDTH + projectile.radius ||
      projectile.y < -projectile.radius ||
      projectile.y > ARENA_HEIGHT + projectile.radius
    ) {
      hitIds.add(projectile.id);
    }
  }

  return {
    projectiles: projectiles.filter((projectile) => !hitIds.has(projectile.id)),
    damageHost,
    damageJoin,
  };
}
