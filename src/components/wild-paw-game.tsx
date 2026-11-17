import { ProfileBorderOverlay } from "@/components/ui/profile-border-overlay";
import { SoundPressable as Pressable } from "@/components/ui/sound-pressable";
import { getBuddy, getBuddyBonus } from "@/constants/buddy-catalog";
import { awardCoins } from "@/constants/coin-wallet";
import {
  coinRewards,
  dropConfig,
  type DropKind,
} from "@/constants/game-configuration";
import { DEFAULT_ORB_SKIN_ID, getOrbSkin } from "@/constants/orb-catalog";
import { awardPlayerXp } from "@/constants/player-experience";
import { recordPlayerHighScore } from "@/constants/player-high-score";
import {
  DEFAULT_HERO_ID,
  DEFAULT_PROFILE_BORDER,
  DEFAULT_PROFILE_PICTURE,
  PROFILE_PICTURES,
  getProfileBorder,
  getProfileBorderStyle,
  getSkinImage,
  isProfilePictureId,
  type ProfilePictureId,
} from "@/constants/player-profile";
import {
  DEFAULT_BATTLE_CONTROLS,
  getBattleControlSettings,
  getSoundEffectsVolume,
  getVibrationEnabled,
  subscribeToSoundEffectsVolume,
  type BattleControlSettings,
} from "@/constants/player-settings";
import {
  createMultiplayerSocket,
  startLocalHostServer,
  stopLocalHostServer,
} from "@/services/local-multiplayer-network";
import type { MultiplayerSocket } from "@/services/local-multiplayer.types";
import { getRemoteAssetSource } from "@/services/remote-assets";
import { createAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  GestureDetector,
  usePanGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

const MULTIPLAYER_SOCKET_OPEN = 1;

type Vector = {
  x: number;
  y: number;
};

type Enemy = {
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
  level?: number;
  bulletImpactTimer?: number;
  arenaBossId?: string;
  isBossAdd?: boolean;
  scoreReward?: number;
  hitFlashTimer?: number;
  knockbackX?: number;
  knockbackY?: number;
  repositionTimer?: number;
  repositionTarget?: Vector | null;
};

type EnemyDeathEffect = {
  id: number;
  imageAsset: string;
  x: number;
  y: number;
  radius: number;
  life: number;
  isArenaBoss: boolean;
};

type ArenaBossPattern = "artillery" | "charger";
type BossPhase = "idle" | "warning" | "entrance" | "active";
type BossAttackPhase = "cooldown" | "telegraph" | "dash";
type ArenaSide = "top" | "right" | "bottom" | "left";
type BossAddSpawnSide = ArenaSide | null;
type ArenaBossConfig = {
  id: string;
  name: string;
  pattern: ArenaBossPattern;
  color: string;
  fallbackIcon: string;
  /** Storage-release asset path; set when the boss portrait is uploaded. */
  imageAsset: string | null;
  health: number;
  contactDamage: number;
  projectileDamage: number;
  areaDamage: number;
  dashDamage: number;
  scoreReward: number;
};

type BossProjectile = {
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

type BossAreaEffect = {
  id: number;
  x: number;
  y: number;
  radius: number;
  life: number;
};

type Bullet = {
  id: number;
  playerId: "host" | "join";
  x: number;
  y: number;
  radius: number;
  speed: number;
  damage: number;
  vx: number;
  vy: number;
  isHighDamage?: boolean;
};

type GrenadeProjectile = {
  id: number;
  playerId?: "host" | "join";
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuse: number;
  elapsed: number;
};

type GrenadeExplosion = {
  id: number;
  playerId?: "host" | "join";
  x: number;
  y: number;
  radius: number;
  life: number;
};

type ConsumableDrop = {
  id: number;
  kind: DropKind;
  x: number;
  y: number;
  life: number;
  pickupAvailableAt?: number;
};

type DamageNumber = {
  id: number;
  x: number;
  y: number;
  amount: number;
  life: number;
  target:
    | "player"
    | "enemy"
    | "heal"
    | "grenadePickup"
    | "medkitPickup"
    | "speedPickup"
    | "rapidFirePickup"
    | "highDamagePickup";
  playerId?: "host" | "join";
};

type PlayerState = {
  id: "host" | "join";
  name: string;
  hero: string;
  skinId: string;
  skinColor: string;
  profilePicture?: string;
  profileBorder?: string;
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
  speed: number;
  upgrades: PlayerUpgradeStats;
  speedBoostTimer: number;
  rapidFireTimer: number;
  highDamageTimer: number;
  facing: Vector;
  visualFacing: -1 | 1;
  orbEquipped: boolean;
  orbSkinId: string;
  buddyId: string;
  orbSide: number;
  orbFireCooldown: number;
  grenades: number;
  heals: number;
  dashCooldown: number;
  fireCooldown: number;
  pendingDamage: number;
  damageTimer: number;
  hitFlashTimer: number;
  knockbackX: number;
  knockbackY: number;
  isDead: boolean;
};

type PlayerUpgradeStats = {
  damagePercent: number;
  fireRatePercent: number;
  moveSpeedPercent: number;
  defensePercent: number;
  criticalChancePercent: number;
};

type PowerUpId = keyof PlayerUpgradeStats | "maxHealth";
type PowerUpChoice = {
  id: PowerUpId;
  name: string;
  description: string;
  amount: number;
};

type OrbBeam = {
  id: number;
  playerId: PlayerState["id"];
  orbSkinId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  life: number;
};

type PlayerInput = {
  movement: Vector;
  aim: Vector;
  firing: boolean;
  weapon: "gun" | "grenade";
  grenadeAiming: boolean;
  grenadeRange: number;
  grenadeCancelTargeted: boolean;
  reviveTargetId: "host" | "join" | null;
};

type GameState = {
  player: PlayerState;
  joinPlayer: PlayerState | null;
  reviveState: {
    reviverId: "host" | "join";
    targetId: "host" | "join";
    progress: number;
  } | null;
  grenadeAimPreview: {
    playerId: "host" | "join";
    direction: Vector;
    range: number;
    cancelTargeted: boolean;
  } | null;
  enemies: Enemy[];
  bullets: Bullet[];
  orbBeams: OrbBeam[];
  itemDrops: ConsumableDrop[];
  grenadeProjectiles: GrenadeProjectile[];
  grenadeExplosions: GrenadeExplosion[];
  enemyDeathEffects: EnemyDeathEffect[];
  damageNumbers: DamageNumber[];
  score: number;
  wave: number;
  arenaBackgroundWave: number;
  waveCountdown: number;
  warpTransitionTimer: number;
  powerUpChoices: PowerUpChoice[];
  warpPending: boolean;
  enemiesToSpawn: number;
  isRunning: boolean;
  isPaused: boolean;
  message: string;
  grenades: number;
  heals: number;
  dashCooldown: number;
  fireCooldown: number;
  pendingPlayerDamage: number;
  playerDamageTimer: number;
  spawnCooldown: number;
  bossSpawnedAtWave: number | null;
  bossHealth: number;
  bossHealthMax: number;
  bossName: string;
  bossConfigId: string | null;
  bossPhase: BossPhase;
  bossPhaseTimer: number;
  bossAttackPhase: BossAttackPhase;
  bossAttackTimer: number;
  bossTelegraphTarget: Vector | null;
  bossDashDirection: Vector | null;
  bossDashHasHit: boolean;
  bossProjectiles: BossProjectile[];
  bossAreaEffects: BossAreaEffect[];
  bossAddSpawnTimer: number;
  bossAddWarningTimer: number;
  bossAddSpawnSide: BossAddSpawnSide;
  bossEntrySide: ArenaSide;
  bossHitId: number;
};

const ARENA_WIDTH = 640;
const ARENA_HEIGHT = 360;
const PLAYER_RADIUS = 18;
const MAX_HEALTH = 100;
const PLAYER_SPEED = 140;
const SPEED_BOOST_DURATION = 120;
const SPEED_BOOST_MULTIPLIER = 1.55;
const RAPID_FIRE_DURATION = 120;
const NORMAL_FIRE_COOLDOWN = 0.22;
const RAPID_FIRE_COOLDOWN = 0.11;
const HIGH_DAMAGE_DURATION = 120;
const HIGH_DAMAGE_MULTIPLIER = 2;
const ENEMY_HEALTH_PER_LEVEL = 0.25;
const DASH_COOLDOWN = 2.2;
const BULLET_SPEED = 260;
const GRENADE_SPEED = 250;
const GRENADE_BLAST_RADIUS = 82;
const GRENADE_DAMAGE = 200;
const ENEMY_DEATH_FADE_DURATION = 0.4;
const GRENADE_MIN_RANGE = 70;
const GRENADE_MAX_RANGE = 280;
const GRENADE_RANGE_DRAG_DISTANCE = 64;
const DEFAULT_GRENADE_RANGE = 200;
const MAX_ACTIVE_ENEMIES = 18;
const REGULAR_WAVE_COUNTDOWN_DURATION = 3;
const BOSS_WAVE_COUNTDOWN_DURATION = 60;
const REVIVE_DURATION = 5;
const REVIVE_RANGE = 58;
const REVIVE_HEALTH = 50;
const GHOST_SIZE = 34;
const ORB_ATTACK_RANGE = 250;
const ORB_ATTACK_COOLDOWN = 0.62;
const ORB_ATTACK_DAMAGE = 10;
const ORB_BEAM_DURATION = 0.16;
const heartImage = getRemoteAssetSource("game/icons/health_1.png");
const bootsFastImage = getRemoteAssetSource("game/icons/boots_fast_1.png");
const rapidFireIcon = getRemoteAssetSource("game/icons/bullet_fast_1.png");
const highDamageIcon = getRemoteAssetSource(
  "game/icons/bullet_high_damage_1.png",
);
const medkitIcon = getRemoteAssetSource("game/icons/medkit_1.png");
const bulletProjectileImage = getRemoteAssetSource(
  "game/weapon/weapon_1-2.png",
);
const highDamageBulletImage = getRemoteAssetSource(
  "game/weapon/weapon_1-3.png",
);
const bulletImpactImage = getRemoteAssetSource("game/weapon/weapon_1-4.png");
const BULLET_IMPACT_DURATION = 0.2;
const bombImage = getRemoteAssetSource("game/icons/bomb_1.png");
const dashImage = getRemoteAssetSource("game/icons/dash_1.png");
const ghostImage = getRemoteAssetSource("game/icons/ghost_1.png");
const coinImage = getRemoteAssetSource("game/icons/coins_1.png");
const trophyImage = getRemoteAssetSource("game/icons/trophy_1.png");
const xpImage = getRemoteAssetSource("game/icons/xp_1.png");
const homeIcon = getRemoteAssetSource("game/icons/home_1.png");
const playIcon = getRemoteAssetSource("game/icons/play_1.png");
const pauseIcon = getRemoteAssetSource("game/icons/pause_1.png");
const chestImage = getRemoteAssetSource("game/icons/chest_1.png");
const fireballImage = getRemoteAssetSource("game/weapon/fireball_1.png");
const smokeImage = getRemoteAssetSource("game/weapon/smoke_1.png");
const orbLaserSound = getRemoteAssetSource("game/sound/laser_1.mp3");
const playerShotSound = getRemoteAssetSource("game/sound/shoot_1.mp3");
const grenadeExplosionSound = getRemoteAssetSource(
  "game/sound/explosion_1.mp3",
);
const enemyHurtSounds = [
  getRemoteAssetSource("game/sound/enemy_hurt_1.mp3"),
  getRemoteAssetSource("game/sound/enemy_hurt_2.mp3"),
  getRemoteAssetSource("game/sound/enemy_hurt_3.mp3"),
];
const enemyBossHurtSound = getRemoteAssetSource(
  "game/sound/enemy_hurt_boss_1.mp3",
);
const playerHurtSounds = [
  getRemoteAssetSource("game/sound/player_hurt_1.mp3"),
  getRemoteAssetSource("game/sound/player_hurt_2.mp3"),
  getRemoteAssetSource("game/sound/player_hurt_3.mp3"),
];
const PLAYER_HURT_SOUND_COOLDOWN_MS = 1000;
const BOSS_LAUGH_COOLDOWN_MS = 5000;
const bossLaughSound = getRemoteAssetSource(
  "game/sound/enemy_laugh_boss_1.mp3",
);

function getWaveEnemyCount(wave: number) {
  return 4 + wave;
}

function getEnemiesRemainingInWave(game: GameState) {
  const pendingBoss =
    game.wave > 1 && game.wave % 3 === 0 && game.bossSpawnedAtWave !== game.wave
      ? 1
      : 0;
  const pendingArenaBoss =
    game.wave % WAVES_PER_ARENA === 0 &&
    game.bossPhase === "warning" &&
    !game.enemies.some((enemy) => enemy.arenaBossId)
      ? 1
      : 0;
  return (
    game.enemies.length + game.enemiesToSpawn + pendingBoss + pendingArenaBoss
  );
}

function replaySoundEffect(
  player: ReturnType<typeof createAudioPlayer> | null,
) {
  if (!player) return;
  void player
    .seekTo(0)
    .then(() => player.play())
    .catch(() => undefined);
}

function replayExplosionWithVibration(
  player: ReturnType<typeof createAudioPlayer> | null,
  vibrationEnabled: boolean,
  vibrationTimerRef: { current: ReturnType<typeof setInterval> | null },
) {
  if (!player) return;
  if (vibrationTimerRef.current) {
    clearInterval(vibrationTimerRef.current);
    vibrationTimerRef.current = null;
  }

  void player
    .seekTo(0)
    .then(() => {
      player.play();
      if (!vibrationEnabled) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(
        () => undefined,
      );
      vibrationTimerRef.current = setInterval(() => {
        if (!player.playing) {
          if (vibrationTimerRef.current) {
            clearInterval(vibrationTimerRef.current);
            vibrationTimerRef.current = null;
          }
          return;
        }
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
          () => undefined,
        );
      }, 240);
    })
    .catch(() => {
      if (vibrationTimerRef.current) {
        clearInterval(vibrationTimerRef.current);
        vibrationTimerRef.current = null;
      }
    });
}

const arenaBackgrounds = [
  getRemoteAssetSource("game/arena/arena_1.png"),
  getRemoteAssetSource("game/arena/arena_2.png"),
  getRemoteAssetSource("game/arena/arena_3.png"),
  getRemoteAssetSource("game/arena/arena_4.jpg"),
];
const ENEMY_SPRITE_ASSETS = {
  weak: ["game/enemy/enemy_1-1.png", "game/enemy/enemy_1-2.png"],
  elite: ["game/enemy/enemy_2-1.png", "game/enemy/enemy_2-2.png"],
  boss: [
    "game/enemy/enemy_3-1.png",
    "game/enemy/enemy_3-2.png",
    "game/enemy/enemy_3-3.png",
  ],
} as const;
const WAVES_PER_ARENA = 10;
const BOSS_ADD_COUNT = 10;
const BOSS_ADD_SPAWN_INTERVAL = 10;
const BOSS_ADD_WARNING_DURATION = 2;
const BOSS_CHEST_PICKUP_DELAY_MS = 3000;
const BOSS_ADD_FIRST_WARNING_DELAY =
  BOSS_ADD_SPAWN_INTERVAL - BOSS_ADD_WARNING_DURATION;
function getWaveCountdownDuration(wave: number) {
  return wave % WAVES_PER_ARENA === 0
    ? BOSS_WAVE_COUNTDOWN_DURATION
    : REGULAR_WAVE_COUNTDOWN_DURATION;
}
const WARP_TRANSITION_DURATION = 5;
const BOSS_WARNING_DURATION = 5;
const BOSS_ENTRANCE_DURATION = 2.8;
const BOSS_ATTACK_TELEGRAPH_DURATION = 1.35;
const BOSS_DASH_DURATION = 0.72;
const BOSS_DASH_SPEED = 520;
const BOSS_AREA_RADIUS = 74;
const BOSS_REPOSITION_INTERVAL = 5;
const BOSS_REPOSITION_SPEED = 120;
const BOSS_CONFIGS: ArenaBossConfig[] = [
  {
    id: "thorn-titan",
    name: "Thorn Titan",
    pattern: "artillery",
    color: "#fb7185",
    fallbackIcon: "♛",
    // Example future path: "game/boss/thorn_titan.png"
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
    // Example future path: "game/boss/bloom_beast.png"
    imageAsset: null,
    health: 8000,
    contactDamage: 14,
    projectileDamage: 0,
    areaDamage: 0,
    dashDamage: 58,
    scoreReward: 1800,
  },
];

function getArenaBossForWave(wave: number): ArenaBossConfig {
  const encounterIndex = Math.max(0, Math.floor(wave / WAVES_PER_ARENA) - 1);
  return BOSS_CONFIGS[encounterIndex % BOSS_CONFIGS.length];
}

function createArtilleryBossPosition(currentPosition: Vector): Vector {
  let nextPosition = currentPosition;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    nextPosition = {
      x: 90 + Math.random() * (ARENA_WIDTH - 180),
      y: 120 + Math.random() * (ARENA_HEIGHT - 160),
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

function getRandomEnemySpriteAsset(kind: keyof typeof ENEMY_SPRITE_ASSETS) {
  const assets = ENEMY_SPRITE_ASSETS[kind];
  return assets[Math.floor(Math.random() * assets.length)];
}

function getEnemySpriteSource(enemy: Enemy) {
  return getRemoteAssetSource(enemy.imageAsset);
}

function getEnemyFacing(enemy: Enemy, target: { x: number } | null) {
  if (!target) return 1;
  return enemy.x < target.x ? 1 : -1;
}

function getPlayerVisualFacing(
  currentFacing: -1 | 1,
  horizontalMovement: number,
) {
  if (horizontalMovement > 0.12) return 1;
  if (horizontalMovement < -0.12) return -1;
  return currentFacing;
}

function getEnemyScoreReward(enemy: Enemy) {
  return enemy.scoreReward ?? (enemy.isBoss ? 50 : 10);
}

function applyEnemyHit(enemy: Enemy, source: Vector, strength = 260): Enemy {
  const directionX = enemy.x - source.x;
  const directionY = enemy.y - source.y;
  const distance = Math.hypot(directionX, directionY) || 1;
  return {
    ...enemy,
    hitFlashTimer: 0.32,
    knockbackX: (enemy.knockbackX ?? 0) + (directionX / distance) * strength,
    knockbackY: (enemy.knockbackY ?? 0) + (directionY / distance) * strength,
  };
}

function makeEnemyDeathEffect(enemy: Enemy): EnemyDeathEffect {
  return {
    id: enemy.id,
    imageAsset: enemy.imageAsset,
    x: enemy.x,
    y: enemy.y,
    radius: enemy.radius,
    life: ENEMY_DEATH_FADE_DURATION,
    isArenaBoss: !!enemy.arenaBossId,
  };
}

const POWER_UPS: Omit<PowerUpChoice, "amount">[] = [
  {
    id: "damagePercent",
    name: "Heavy Hitter",
    description: "Increase gun and orb damage.",
  },
  {
    id: "fireRatePercent",
    name: "Rapid Trigger",
    description: "Fire weapons more frequently.",
  },
  {
    id: "maxHealth",
    name: "Vitality",
    description: "Increase maximum health and restore the same amount.",
  },
  {
    id: "moveSpeedPercent",
    name: "Fleet Footed",
    description: "Move faster around the arena.",
  },
  {
    id: "defensePercent",
    name: "Thorn Guard",
    description: "Reduce damage received.",
  },
  {
    id: "criticalChancePercent",
    name: "Lucky Strike",
    description: "Increase critical hit chance.",
  },
];

const POWER_UP_AMOUNTS: Record<PowerUpId, number> = {
  damagePercent: 15,
  fireRatePercent: 12,
  maxHealth: 20,
  moveSpeedPercent: 10,
  defensePercent: 10,
  criticalChancePercent: 8,
};

function createPowerUpChoices(): PowerUpChoice[] {
  const shuffled = [...POWER_UPS];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled.slice(0, 2).map((powerUp) => ({
    ...powerUp,
    amount: POWER_UP_AMOUNTS[powerUp.id],
  }));
}

function getWarpFadeOpacity(remainingSeconds: number) {
  const progress = clamp(1 - remainingSeconds / WARP_TRANSITION_DURATION, 0, 1);
  return progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
}

function getArenaBackground(wave: number) {
  const arenaIndex =
    Math.floor(Math.max(0, wave - 1) / WAVES_PER_ARENA) %
    arenaBackgrounds.length;
  return arenaBackgrounds[arenaIndex];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getEffectivePlayerSpeed(player: PlayerState) {
  return (
    player.speed *
    (1 + getBuddyBonus(player.buddyId, "moveSpeed") / 100) *
    (1 + player.upgrades.moveSpeedPercent / 100) *
    (player.speedBoostTimer > 0 ? SPEED_BOOST_MULTIPLIER : 1)
  );
}

function getEffectiveFireCooldown(player: PlayerState) {
  const baseCooldown =
    player.rapidFireTimer > 0 ? RAPID_FIRE_COOLDOWN : NORMAL_FIRE_COOLDOWN;
  return (
    baseCooldown /
    (1 +
      getBuddyBonus(player.buddyId, "attackSpeed") / 100 +
      player.upgrades.fireRatePercent / 100)
  );
}

function getEffectiveBulletDamage(player: PlayerState) {
  const attackDamage =
    20 *
    (1 + getBuddyBonus(player.buddyId, "attack") / 100) *
    (1 + player.upgrades.damagePercent / 100) *
    (player.highDamageTimer > 0 ? HIGH_DAMAGE_MULTIPLIER : 1);
  const criticalChance =
    getBuddyBonus(player.buddyId, "criticalChance") +
    player.upgrades.criticalChancePercent;
  return Math.round(
    attackDamage * (Math.random() * 100 < criticalChance ? 1.5 : 1),
  );
}

function applyPowerUp(
  player: PlayerState,
  powerUp: PowerUpChoice,
): PlayerState {
  if (powerUp.id === "maxHealth") {
    return {
      ...player,
      maxHealth: player.maxHealth + powerUp.amount,
      health: Math.min(
        player.maxHealth + powerUp.amount,
        player.health + powerUp.amount,
      ),
    };
  }

  return {
    ...player,
    upgrades: {
      ...player.upgrades,
      [powerUp.id]: player.upgrades[powerUp.id] + powerUp.amount,
    },
  };
}

function getPowerUpBonusText(powerUp: PowerUpChoice) {
  switch (powerUp.id) {
    case "damagePercent":
    case "fireRatePercent":
    case "moveSpeedPercent":
    case "defensePercent":
    case "criticalChancePercent":
      return `+${powerUp.amount}%`;
    case "maxHealth":
      return `+${powerUp.amount} max health`;
  }
}

function getPowerUpStatBonus(
  player: PlayerState,
  powerUp: PowerUpChoice,
  statLabel: string,
) {
  const affectedStat: Record<PowerUpId, string> = {
    maxHealth: "MAX HEALTH",
    damagePercent: "DAMAGE",
    fireRatePercent: "FIRE RATE",
    moveSpeedPercent: "SPEED",
    defensePercent: "DEFENSE",
    criticalChancePercent: "CRIT",
  };
  if (affectedStat[powerUp.id] !== statLabel) return "—";
  if (powerUp.id === "maxHealth") {
    return `+${Math.round((powerUp.amount / player.maxHealth) * 100)}%`;
  }
  if (powerUp.id === "defensePercent") return `+${powerUp.amount}`;
  return `+${powerUp.amount}%`;
}

function getPreviewStats(player: PlayerState, powerUp: PowerUpChoice | null) {
  const previewPlayer = powerUp ? applyPowerUp(player, powerUp) : player;
  const defensePercent = Math.min(
    90,
    getBuddyBonus(previewPlayer.buddyId, "defense") +
      previewPlayer.upgrades.defensePercent,
  );
  const criticalChancePercent = Math.min(
    100,
    getBuddyBonus(previewPlayer.buddyId, "criticalChance") +
      previewPlayer.upgrades.criticalChancePercent,
  );
  return [
    {
      label: "MAX HEALTH",
      value: `${Math.round(previewPlayer.maxHealth)}`,
    },
    {
      label: "DAMAGE",
      value: `${Math.round(20 * (1 + getBuddyBonus(previewPlayer.buddyId, "attack") / 100) * (1 + previewPlayer.upgrades.damagePercent / 100))}`,
    },
    {
      label: "FIRE RATE",
      value: `${(1 / getEffectiveFireCooldown(previewPlayer)).toFixed(1)}/s`,
    },
    {
      label: "SPEED",
      value: `${Math.round(getEffectivePlayerSpeed(previewPlayer))}`,
    },
    { label: "DEFENSE", value: `${Math.round(defensePercent)}` },
    { label: "CRIT", value: `${Math.round(criticalChancePercent)}%` },
  ];
}

function getPlayerPopupStats(player: PlayerState) {
  const buddyMaxHealth = Math.round(
    MAX_HEALTH * (1 + getBuddyBonus(player.buddyId, "maxHealth") / 100),
  );
  const attackBonus = getBuddyBonus(player.buddyId, "attack");
  const fireRateBonus = getBuddyBonus(player.buddyId, "attackSpeed");
  const moveSpeedBonus = getBuddyBonus(player.buddyId, "moveSpeed");
  const defenseBonus = getBuddyBonus(player.buddyId, "defense");
  const criticalBonus = getBuddyBonus(player.buddyId, "criticalChance");
  const combineBonuses = (...bonuses: string[]) =>
    bonuses.filter(Boolean).join(" · ");

  return [
    {
      label: "MAX HEALTH",
      value: `${buddyMaxHealth}`,
      bonus:
        player.maxHealth > buddyMaxHealth
          ? `+${player.maxHealth - buddyMaxHealth}`
          : "",
    },
    {
      label: "DAMAGE",
      value: `${Math.round(20 * (1 + attackBonus / 100))}`,
      bonus: combineBonuses(
        player.upgrades.damagePercent > 0
          ? `+${player.upgrades.damagePercent}%`
          : "",
        player.highDamageTimer > 0
          ? `+${Math.round((HIGH_DAMAGE_MULTIPLIER - 1) * 100)}%`
          : "",
      ),
    },
    {
      label: "FIRE RATE",
      value: `${(1 / (NORMAL_FIRE_COOLDOWN / (1 + fireRateBonus / 100))).toFixed(1)}/s`,
      bonus: combineBonuses(
        player.upgrades.fireRatePercent > 0
          ? `+${player.upgrades.fireRatePercent}%`
          : "",
        player.rapidFireTimer > 0
          ? `+${Math.round((NORMAL_FIRE_COOLDOWN / RAPID_FIRE_COOLDOWN - 1) * 100)}%`
          : "",
      ),
    },
    {
      label: "SPEED",
      value: `${Math.round(player.speed * (1 + moveSpeedBonus / 100))}`,
      bonus: combineBonuses(
        player.upgrades.moveSpeedPercent > 0
          ? `+${player.upgrades.moveSpeedPercent}%`
          : "",
        player.speedBoostTimer > 0
          ? `+${Math.round((SPEED_BOOST_MULTIPLIER - 1) * 100)}%`
          : "",
      ),
    },
    {
      label: "DEFENSE",
      value: `${Math.round(defenseBonus)}`,
      bonus:
        player.upgrades.defensePercent > 0
          ? `+${player.upgrades.defensePercent}`
          : "",
    },
    {
      label: "CRIT",
      value: `${Math.round(criticalBonus)}%`,
      bonus:
        player.upgrades.criticalChancePercent > 0
          ? `+${player.upgrades.criticalChancePercent}%`
          : "",
    },
  ];
}

function normalize(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function makeEnemyDrops(
  enemy: Enemy,
  existingDrops: ConsumableDrop[] = [],
): ConsumableDrop[] {
  const placedDrops: ConsumableDrop[] = [...existingDrops];
  const spawnedKinds = (Object.keys(dropConfig) as DropKind[]).filter(
    (kind) =>
      kind !== "chest" &&
      dropConfig[kind].enabled &&
      Math.random() < dropConfig[kind].dropChance,
  );
  const newDrops: ConsumableDrop[] = [];

  for (const kind of spawnedKinds) {
    const config = dropConfig[kind];
    let x = enemy.x;
    let y = enemy.y;
    let attempts = 0;

    while (
      attempts < 24 &&
      placedDrops.some(
        (drop) =>
          Math.hypot(drop.x - x, drop.y - y) <=
          (dropConfig[drop.kind].iconSize + config.iconSize) / 2 + 4,
      )
    ) {
      attempts += 1;
      const angle = ((attempts - 1) * Math.PI) / 4;
      const radius = 18 + Math.floor((attempts - 1) / 8) * 8;
      x = clamp(enemy.x + Math.cos(angle) * radius, 0, ARENA_WIDTH);
      y = clamp(enemy.y + Math.sin(angle) * radius, 0, ARENA_HEIGHT);
    }

    const nextDrop: ConsumableDrop = {
      id: Date.now() + Math.random(),
      kind,
      x,
      y,
      life: config.stayDurationSeconds + config.flickerDurationSeconds,
    };
    placedDrops.push(nextDrop);
    newDrops.push(nextDrop);
  }

  if (enemy.arenaBossId) {
    const chestConfig = dropConfig.chest;
    let x = enemy.x;
    let y = enemy.y;
    let attempts = 0;

    while (
      attempts < 24 &&
      placedDrops.some(
        (drop) =>
          Math.hypot(drop.x - x, drop.y - y) <=
          (dropConfig[drop.kind].iconSize + chestConfig.iconSize) / 2 + 4,
      )
    ) {
      attempts += 1;
      const angle = ((attempts - 1) * Math.PI) / 4;
      const radius = 18 + Math.floor((attempts - 1) / 8) * 8;
      x = clamp(enemy.x + Math.cos(angle) * radius, 0, ARENA_WIDTH);
      y = clamp(enemy.y + Math.sin(angle) * radius, 0, ARENA_HEIGHT);
    }

    const chestDrop: ConsumableDrop = {
      id: Date.now() + Math.random(),
      kind: "chest",
      x,
      y,
      life:
        chestConfig.stayDurationSeconds + chestConfig.flickerDurationSeconds,
      pickupAvailableAt: Date.now() + BOSS_CHEST_PICKUP_DELAY_MS,
    };
    placedDrops.push(chestDrop);
    newDrops.push(chestDrop);
  }

  return newDrops;
}

function advanceItemDrops(
  drops: ConsumableDrop[],
  player: PlayerState,
  delta: number,
) {
  const remainingDrops: ConsumableDrop[] = [];
  const damageNumbers: DamageNumber[] = [];
  let nextPlayer = { ...player };
  let rewardPopupTriggered = false;

  for (const drop of drops) {
    const config = dropConfig[drop.kind];
    const life = drop.kind === "chest" ? drop.life : drop.life - delta;
    if (life <= 0) {
      continue;
    }

    const touchingPlayer =
      !player.isDead &&
      Math.hypot(drop.x - player.x, drop.y - player.y) <= config.pickupRadius;
    if (
      touchingPlayer &&
      drop.kind === "chest" &&
      Date.now() >= (drop.pickupAvailableAt ?? 0)
    ) {
      rewardPopupTriggered = true;
      continue;
    }

    if (touchingPlayer && drop.kind === "heart") {
      const heartConfig = dropConfig.heart;
      if (nextPlayer.health < player.maxHealth) {
        const buddyHealAmount = Math.round(
          heartConfig.healAmount *
            (1 + getBuddyBonus(player.buddyId, "healingReceived") / 100),
        );
        const healedAmount = Math.min(
          buddyHealAmount,
          player.maxHealth - nextPlayer.health,
        );
        nextPlayer.health += healedAmount;
        damageNumbers.push({
          id: Date.now() + Math.random(),
          x: player.x,
          y: player.y - player.radius - 16,
          amount: healedAmount,
          life: heartConfig.healPopupDurationSeconds,
          target: "heal",
        });
        continue;
      }
    }

    if (touchingPlayer && drop.kind === "grenade") {
      const grenadeConfig = dropConfig.grenade;
      if (nextPlayer.grenades < grenadeConfig.inventoryCap) {
        const gained = Math.min(
          grenadeConfig.amount,
          grenadeConfig.inventoryCap - nextPlayer.grenades,
        );
        nextPlayer.grenades = Math.min(
          grenadeConfig.inventoryCap,
          nextPlayer.grenades + gained,
        );
        damageNumbers.push({
          id: Date.now() + Math.random(),
          x: player.x,
          y: player.y - player.radius - 16,
          amount: gained,
          life: 1.2,
          target: "grenadePickup",
        });
        continue;
      }
    }

    if (touchingPlayer && drop.kind === "medkit") {
      const medkitConfig = dropConfig.medkit;
      if (nextPlayer.heals < medkitConfig.inventoryCap) {
        const gained = Math.min(
          medkitConfig.amount,
          medkitConfig.inventoryCap - nextPlayer.heals,
        );
        nextPlayer.heals = Math.min(
          medkitConfig.inventoryCap,
          nextPlayer.heals + gained,
        );
        damageNumbers.push({
          id: Date.now() + Math.random(),
          x: player.x,
          y: player.y - player.radius - 16,
          amount: gained,
          life: 1.2,
          target: "medkitPickup",
        });
        continue;
      }
    }

    if (touchingPlayer && drop.kind === "boots") {
      nextPlayer.speedBoostTimer = SPEED_BOOST_DURATION;
      damageNumbers.push({
        id: Date.now() + Math.random(),
        x: player.x,
        y: player.y - player.radius - 16,
        amount: 1,
        life: 1.2,
        target: "speedPickup",
      });
      continue;
    }

    if (touchingPlayer && drop.kind === "rapidFire") {
      nextPlayer.rapidFireTimer = RAPID_FIRE_DURATION;
      damageNumbers.push({
        id: Date.now() + Math.random(),
        x: player.x,
        y: player.y - player.radius - 16,
        amount: 1,
        life: 1.2,
        target: "rapidFirePickup",
      });
      continue;
    }

    if (touchingPlayer && drop.kind === "highDamage") {
      nextPlayer.highDamageTimer = HIGH_DAMAGE_DURATION;
      damageNumbers.push({
        id: Date.now() + Math.random(),
        x: player.x,
        y: player.y - player.radius - 16,
        amount: 1,
        life: 1.2,
        target: "highDamagePickup",
      });
      continue;
    }

    remainingDrops.push({ ...drop, life });
  }

  return {
    drops: remainingDrops,
    player: nextPlayer,
    damageNumbers,
    rewardPopupTriggered,
  };
}

type ActiveBuffKind = "speed" | "rapidFire" | "highDamage";
type ActiveBuff = { kind: ActiveBuffKind; remaining: number };

function getActiveBuffs(player: PlayerState): ActiveBuff[] {
  return [
    { kind: "speed" as const, remaining: player.speedBoostTimer },
    { kind: "rapidFire" as const, remaining: player.rapidFireTimer },
    { kind: "highDamage" as const, remaining: player.highDamageTimer },
  ]
    .filter((buff) => buff.remaining > 0)
    .sort((a, b) => a.remaining - b.remaining);
}

function ActiveBuffBadge({ buff }: { buff: ActiveBuff }) {
  const badgeStyle =
    buff.kind === "speed"
      ? styles.speedBoostBadge
      : buff.kind === "rapidFire"
        ? styles.rapidFireBuffBadge
        : styles.highDamageBuffBadge;
  const duration =
    buff.kind === "speed"
      ? SPEED_BOOST_DURATION
      : buff.kind === "rapidFire"
        ? RAPID_FIRE_DURATION
        : HIGH_DAMAGE_DURATION;
  const fillColor =
    buff.kind === "speed"
      ? "rgba(34, 211, 238, 0.72)"
      : buff.kind === "rapidFire"
        ? "rgba(251, 146, 60, 0.72)"
        : "rgba(192, 132, 252, 0.72)";
  const remainingPercent = clamp((buff.remaining / duration) * 100, 0, 100);

  return (
    <View style={badgeStyle}>
      <View
        pointerEvents="none"
        style={[
          styles.activeBuffCooldownFill,
          { height: `${remainingPercent}%`, backgroundColor: fillColor },
        ]}
      />
      <Image
        source={
          buff.kind === "speed"
            ? bootsFastImage
            : buff.kind === "rapidFire"
              ? rapidFireIcon
              : highDamageIcon
        }
        style={styles.activeBuffIcon}
        contentFit="contain"
      />
    </View>
  );
}

function PlayerBuffIndicators({ player }: { player: PlayerState }) {
  const activeBuffs = getActiveBuffs(player);

  if (activeBuffs.length === 0) {
    return null;
  }

  const badgeWidth = activeBuffs.length * 18 + (activeBuffs.length - 1) * 3;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.playerWorldBuffs,
        { left: player.radius - badgeWidth / 2 },
      ]}
    >
      {activeBuffs.map((buff) => (
        <ActiveBuffBadge key={buff.kind} buff={buff} />
      ))}
    </View>
  );
}

function advanceGrenadeProjectiles(
  projectiles: GrenadeProjectile[],
  enemies: Enemy[],
  delta: number,
) {
  const remainingProjectiles: GrenadeProjectile[] = [];
  const explosions: GrenadeExplosion[] = [];
  const enemyDeathEffects: EnemyDeathEffect[] = [];
  const itemDrops: ConsumableDrop[] = [];
  const damageNumbers: DamageNumber[] = [];
  const nextEnemies = enemies.map((enemy) => ({ ...enemy }));
  let score = 0;

  for (const projectile of projectiles) {
    const nextProjectile = {
      ...projectile,
      x: projectile.x + projectile.vx * GRENADE_SPEED * delta,
      y: projectile.y + projectile.vy * GRENADE_SPEED * delta,
      fuse: projectile.fuse - delta,
      elapsed: projectile.elapsed + delta,
    };

    if (nextProjectile.fuse > 0) {
      remainingProjectiles.push(nextProjectile);
      continue;
    }

    explosions.push({
      id: projectile.id,
      playerId: projectile.playerId,
      x: nextProjectile.x,
      y: nextProjectile.y,
      radius: GRENADE_BLAST_RADIUS,
      life: 0.3,
    });

    for (const enemy of nextEnemies) {
      if (enemy.health <= 0) {
        continue;
      }

      const distance = Math.hypot(
        enemy.x - nextProjectile.x,
        enemy.y - nextProjectile.y,
      );
      if (distance > GRENADE_BLAST_RADIUS) {
        continue;
      }

      const hitEnemy = applyEnemyHit(enemy, nextProjectile, 420);
      enemy.health -= GRENADE_DAMAGE;
      enemy.knockbackX = hitEnemy.knockbackX;
      enemy.knockbackY = hitEnemy.knockbackY;
      enemy.hitFlashTimer = hitEnemy.hitFlashTimer;
      damageNumbers.push({
        id: Date.now() + Math.random(),
        x: enemy.x,
        y: enemy.y - enemy.radius - 12,
        amount: GRENADE_DAMAGE,
        life: 0.75,
        target: "enemy",
      });
      if (enemy.health <= 0) {
        score += getEnemyScoreReward(enemy);
        enemyDeathEffects.push(makeEnemyDeathEffect(enemy));
        itemDrops.push(...makeEnemyDrops(enemy, itemDrops));
      }
    }
  }

  return {
    projectiles: remainingProjectiles,
    enemies: nextEnemies.filter((enemy) => enemy.health > 0),
    explosions,
    enemyDeathEffects,
    itemDrops,
    damageNumbers,
    score,
  };
}

function getEnemyLevel(wave: number) {
  // Enemies level up each time the arena changes after a boss wave.
  return Math.floor(Math.max(0, wave - 1) / WAVES_PER_ARENA) + 1;
}

function makeEnemy(wave: number, id: number): Enemy {
  const isBoss = wave > 1 && wave % 3 === 0 && Math.random() > 0.6;
  const bossBonus = isBoss ? 2.8 : 1;
  const level = getEnemyLevel(wave);
  const levelHealthMultiplier = 1 + (level - 1) * ENEMY_HEALTH_PER_LEVEL;
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
    imageAsset: getRandomEnemySpriteAsset(isBoss ? "elite" : "weak"),
    x,
    y,
    radius,
    health: (isBoss ? 140 : 28) * bossBonus * levelHealthMultiplier,
    maxHealth: (isBoss ? 140 : 28) * bossBonus * levelHealthMultiplier,
    speed: (isBoss ? 26 : 44) * bossBonus,
    damage: isBoss ? 14 : 8,
    color: isBoss ? "#f97316" : "#34d399",
    isBoss,
    level,
  };
}

function makeBossAddEnemy(side: BossAddSpawnSide, wave: number): Enemy {
  const enemy = makeEnemy(1, Date.now() + Math.random());
  const level = getEnemyLevel(wave);
  const levelHealthMultiplier = 1 + (level - 1) * ENEMY_HEALTH_PER_LEVEL;
  enemy.level = level;
  enemy.health *= levelHealthMultiplier;
  enemy.maxHealth *= levelHealthMultiplier;
  enemy.isBossAdd = true;
  const minX = enemy.radius;
  const maxX = ARENA_WIDTH - enemy.radius;
  const minY = enemy.radius;
  const maxY = ARENA_HEIGHT - enemy.radius;
  switch (side) {
    case "top":
      enemy.x = minX + Math.random() * (maxX - minX);
      enemy.y = minY;
      break;
    case "right":
      enemy.x = maxX;
      enemy.y = minY + Math.random() * (maxY - minY);
      break;
    case "bottom":
      enemy.x = minX + Math.random() * (maxX - minX);
      enemy.y = maxY;
      break;
    case "left":
      enemy.x = minX;
      enemy.y = minY + Math.random() * (maxY - minY);
      break;
    case null:
      break;
  }
  return enemy;
}

const BOSS_ENTRY_REST = { x: ARENA_WIDTH / 2, y: 92 };

function getBossEntryStart(side: ArenaSide, radius: number): Vector {
  switch (side) {
    case "top":
      return { x: ARENA_WIDTH / 2, y: -radius };
    case "bottom":
      return { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT + radius };
    case "left":
      return { x: -radius, y: ARENA_HEIGHT / 2 };
    case "right":
      return { x: ARENA_WIDTH + radius, y: ARENA_HEIGHT / 2 };
  }
}

function makeArenaBoss(
  config: ArenaBossConfig,
  wave: number,
  side: ArenaSide,
): Enemy {
  const start = getBossEntryStart(side, 42);
  const encounterNumber = Math.max(1, Math.floor(wave / WAVES_PER_ARENA));
  const health = config.health + (encounterNumber - 1) * 250;
  return {
    id: Date.now() + Math.random(),
    imageAsset: getRandomEnemySpriteAsset("boss"),
    x: start.x,
    y: start.y,
    radius: 42,
    health,
    maxHealth: health,
    speed: 0,
    damage: config.contactDamage,
    color: config.color,
    isBoss: true,
    arenaBossId: config.id,
    scoreReward: config.scoreReward,
    repositionTimer: BOSS_REPOSITION_INTERVAL,
    repositionTarget: null,
  };
}

function distanceToSegment(point: Vector, start: Vector, end: Vector) {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const t =
    lengthSquared === 0
      ? 0
      : clamp(
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

function createPlayer(
  id: PlayerState["id"],
  hero: string,
  x: number,
  y: number,
  name = id === "host" ? "Player 1" : "Player 2",
  skinColor = "#7dd3fc",
  skinId = "",
  orbEquipped = false,
  orbSkinId = DEFAULT_ORB_SKIN_ID,
  buddyId = "",
): PlayerState {
  const maxHealth = Math.round(
    MAX_HEALTH * (1 + getBuddyBonus(buddyId, "maxHealth") / 100),
  );
  return {
    id,
    name,
    hero,
    skinId,
    skinColor,
    x,
    y,
    radius: PLAYER_RADIUS,
    health: maxHealth,
    maxHealth,
    speed: PLAYER_SPEED,
    upgrades: {
      damagePercent: 0,
      fireRatePercent: 0,
      moveSpeedPercent: 0,
      defensePercent: 0,
      criticalChancePercent: 0,
    },
    speedBoostTimer: 0,
    rapidFireTimer: 0,
    highDamageTimer: 0,
    facing: { x: 1, y: 0 },
    visualFacing: -1,
    orbEquipped,
    orbSkinId,
    buddyId: getBuddy(buddyId)?.id ?? "",
    orbSide: 1,
    orbFireCooldown: 0,
    grenades: 3,
    heals: 2,
    dashCooldown: 0,
    fireCooldown: 0,
    pendingDamage: 0,
    damageTimer: 0.45,
    hitFlashTimer: 0,
    knockbackX: 0,
    knockbackY: 0,
    isDead: false,
  };
}

function getOrbSideTarget(player: PlayerState) {
  if (player.facing.x < -0.12) return 1;
  if (player.facing.x > 0.12) return -1;
  return Math.sign(player.orbSide) || 1;
}

function getOrbSideAfterDelta(player: PlayerState, delta: number) {
  const targetSide = getOrbSideTarget(player);
  const smoothing = 1 - Math.exp(-delta * 1.8);
  return player.orbSide + (targetSide - player.orbSide) * smoothing;
}

function getOrbPosition(player: PlayerState, animationTime = 0) {
  const horizontalFloat = Math.sin(animationTime * 0.65) * 7;
  const verticalFloat = Math.sin(animationTime * 1.15) * 4;

  return {
    x: player.x + player.orbSide * (27 + horizontalFloat),
    y: player.y - player.radius - 25 + verticalFloat,
  };
}

function getBuddyPosition(player: PlayerState, animationTime = 0) {
  const stepDuration = 1.8;
  const step = Math.floor(animationTime / stepDuration);
  const stepProgress = (animationTime / stepDuration) % 1;
  const easedProgress = stepProgress * stepProgress * (3 - 2 * stepProgress);
  const seedOffset = player.id === "join" ? 997 : 101;
  const waypoint = (index: number) => {
    const seed = Math.sin((index + seedOffset) * 127.1) * 43758.5453;
    const random = seed - Math.floor(seed);
    const angle = random * Math.PI * 2;
    const radius = 18 + random * 14;
    return {
      x: Math.cos(angle) * radius,
      y: 22 + Math.sin(angle) * radius * 0.25,
    };
  };
  const current = waypoint(step);
  const next = waypoint(step + 1);
  return {
    x: player.x + current.x + (next.x - current.x) * easedProgress,
    y: player.y + current.y + (next.y - current.y) * easedProgress,
  };
}

function fireOrbAtNearestEnemy(
  player: PlayerState,
  enemies: Enemy[],
  damageNumbers: DamageNumber[],
  itemDrops: ConsumableDrop[],
) {
  if (!player.orbEquipped || player.isDead || player.orbFireCooldown > 0) {
    return {
      player,
      enemies,
      score: 0,
      message: "",
      beam: null as OrbBeam | null,
      deathEffect: null as EnemyDeathEffect | null,
    };
  }

  const orbPosition = getOrbPosition(player);
  const target = enemies
    .filter(
      (enemy) =>
        enemy.health > 0 &&
        Math.hypot(enemy.x - orbPosition.x, enemy.y - orbPosition.y) <=
          ORB_ATTACK_RANGE,
    )
    .sort(
      (first, second) =>
        Math.hypot(first.x - orbPosition.x, first.y - orbPosition.y) -
        Math.hypot(second.x - orbPosition.x, second.y - orbPosition.y),
    )[0];

  if (!target) {
    return {
      player,
      enemies,
      score: 0,
      message: "",
      beam: null as OrbBeam | null,
      deathEffect: null as EnemyDeathEffect | null,
    };
  }

  const criticalHit =
    Math.random() * 100 <
    getBuddyBonus(player.buddyId, "criticalChance") +
      player.upgrades.criticalChancePercent;
  const damage = Math.round(
    ORB_ATTACK_DAMAGE *
      (1 + getBuddyBonus(player.buddyId, "attack") / 100) *
      (1 + player.upgrades.damagePercent / 100) *
      (criticalHit ? 1.5 : 1),
  );
  const hitTarget = applyEnemyHit(target, orbPosition, 0);
  hitTarget.health -= damage;
  damageNumbers.push({
    id: Date.now() + Math.random(),
    x: hitTarget.x,
    y: hitTarget.y - hitTarget.radius - 12,
    amount: damage,
    life: 0.75,
    target: "enemy",
  });

  const defeated = hitTarget.health <= 0;
  if (defeated) {
    itemDrops.push(...makeEnemyDrops(hitTarget, itemDrops));
  }

  return {
    player: { ...player, orbFireCooldown: ORB_ATTACK_COOLDOWN },
    enemies: defeated
      ? enemies.filter((enemy) => enemy.id !== hitTarget.id)
      : enemies.map((enemy) => (enemy.id === hitTarget.id ? hitTarget : enemy)),
    score: defeated ? getEnemyScoreReward(hitTarget) : 0,
    deathEffect: defeated ? makeEnemyDeathEffect(hitTarget) : null,
    message: defeated
      ? hitTarget.arenaBossId
        ? `${BOSS_CONFIGS.find((boss) => boss.id === hitTarget.arenaBossId)?.name ?? "Boss"} defeated!`
        : hitTarget.isBoss
          ? "Boss defeated!"
          : "Plant down!"
      : "",
    beam: {
      id: Date.now() + Math.random(),
      playerId: player.id,
      orbSkinId: player.orbSkinId,
      startX: orbPosition.x,
      startY: orbPosition.y,
      endX: hitTarget.x,
      endY: hitTarget.y,
      life: ORB_BEAM_DURATION,
    } satisfies OrbBeam,
  };
}

function createInitialGame(
  selectedHero: string,
  selectedSkinColor = "#7dd3fc",
  selectedSkinId = "",
  orbEquipped = false,
  orbSkinId = DEFAULT_ORB_SKIN_ID,
  buddyId = "",
): GameState {
  return {
    player: createPlayer(
      "host",
      selectedHero,
      ARENA_WIDTH / 2 - 20,
      ARENA_HEIGHT / 2,
      undefined,
      selectedSkinColor,
      selectedSkinId,
      orbEquipped,
      orbSkinId,
      buddyId,
    ),
    joinPlayer: null,
    reviveState: null,
    grenadeAimPreview: null,
    enemies: [],
    bullets: [],
    orbBeams: [],
    itemDrops: [],
    grenadeProjectiles: [],
    grenadeExplosions: [],
    enemyDeathEffects: [],
    damageNumbers: [],
    pendingPlayerDamage: 0,
    playerDamageTimer: 0.45,
    score: 0,
    wave: 1,
    arenaBackgroundWave: 1,
    waveCountdown: getWaveCountdownDuration(1),
    warpTransitionTimer: 0,
    powerUpChoices: [],
    warpPending: false,
    enemiesToSpawn: getWaveEnemyCount(1),
    isRunning: true,
    isPaused: false,
    message: "Wave 1",
    grenades: 3,
    heals: 2,
    dashCooldown: 0,
    fireCooldown: 0,
    spawnCooldown: 0,
    bossSpawnedAtWave: null,
    bossHealth: 0,
    bossHealthMax: 0,
    bossName: "Thorn Titan",
    bossConfigId: null,
    bossPhase: "idle",
    bossPhaseTimer: 0,
    bossAttackPhase: "cooldown",
    bossAttackTimer: 0,
    bossTelegraphTarget: null,
    bossDashDirection: null,
    bossDashHasHit: false,
    bossProjectiles: [],
    bossAreaEffects: [],
    bossAddSpawnTimer: 0,
    bossAddWarningTimer: 0,
    bossAddSpawnSide: null,
    bossEntrySide: "top",
    bossHitId: 0,
  };
}

function applyPlayerAction(
  state: GameState,
  playerId: PlayerState["id"],
  action: string,
  direction: Vector,
  grenadeRange = DEFAULT_GRENADE_RANGE,
): GameState {
  const player = playerId === "host" ? state.player : state.joinPlayer;
  const isHost = playerId === "host";
  const grenades = isHost ? state.grenades : (player?.grenades ?? 0);
  const heals = isHost ? state.heals : (player?.heals ?? 0);
  if (!player || player.isDead || state.reviveState?.reviverId === playerId) {
    return state;
  }

  if (action === "dash" && player.dashCooldown <= 0) {
    const dashDirection = normalize(direction);
    const dashCooldownDuration =
      DASH_COOLDOWN *
      (1 - getBuddyBonus(player.buddyId, "dashCooldownReduction") / 100);
    const updatedPlayer = {
      ...player,
      x: clamp(
        player.x + dashDirection.x * 70,
        player.radius,
        ARENA_WIDTH - player.radius,
      ),
      y: clamp(
        player.y + dashDirection.y * 70,
        player.radius,
        ARENA_HEIGHT - player.radius,
      ),
      facing: dashDirection,
      visualFacing: getPlayerVisualFacing(player.visualFacing, dashDirection.x),
      dashCooldown: dashCooldownDuration,
    };
    return {
      ...state,
      player: isHost ? updatedPlayer : state.player,
      joinPlayer: isHost ? state.joinPlayer : updatedPlayer,
      dashCooldown: isHost ? dashCooldownDuration : state.dashCooldown,
    };
  }

  if (action === "heal" && heals > 0 && player.health < player.maxHealth) {
    const healPower = Math.round(
      35 * (1 + getBuddyBonus(player.buddyId, "healingReceived") / 100),
    );
    const healedAmount = Math.min(healPower, player.maxHealth - player.health);
    const updatedPlayer = {
      ...player,
      heals: heals - 1,
      health: player.health + healedAmount,
    };
    return {
      ...state,
      player: isHost ? updatedPlayer : state.player,
      joinPlayer: isHost ? state.joinPlayer : updatedPlayer,
      heals: isHost ? heals - 1 : state.heals,
      damageNumbers: [
        ...state.damageNumbers,
        {
          id: Date.now() + Math.random(),
          x: player.x,
          y: player.y - player.radius - 16,
          amount: healedAmount,
          life: 1,
          target: "heal",
        },
      ],
      message: `+${healedAmount} health`,
    };
  }

  if (action === "grenade" && grenades > 0) {
    const grenadeDirection = normalize(direction);
    const updatedPlayer = { ...player, grenades: grenades - 1 };
    return {
      ...state,
      player: isHost ? updatedPlayer : state.player,
      joinPlayer: isHost ? state.joinPlayer : updatedPlayer,
      grenades: isHost ? grenades - 1 : state.grenades,
      grenadeProjectiles: [
        ...state.grenadeProjectiles,
        {
          id: Date.now() + Math.random(),
          playerId: player.id,
          x: player.x + grenadeDirection.x * (player.radius + 10),
          y: player.y + grenadeDirection.y * (player.radius + 10),
          vx: grenadeDirection.x,
          vy: grenadeDirection.y,
          elapsed: 0,
          fuse:
            Math.max(
              0.08,
              clamp(grenadeRange, GRENADE_MIN_RANGE, GRENADE_MAX_RANGE) -
                (player.radius + 10),
            ) / GRENADE_SPEED,
        },
      ],
      grenadeAimPreview: null,
      message: "Grenade thrown!",
    };
  }

  return state;
}

export function WildPawGame({
  selectedHero = DEFAULT_HERO_ID,
  selectedSkinColor = "#7dd3fc",
  selectedSkinId = "",
  multiplayerMode,
  multiplayerRole,
  hostAddress,
  hostIpAddress,
  hostIpAddresses,
  playerName,
  profilePicture,
  profileBorder,
  orbEquipped = false,
  orbSkinId = DEFAULT_ORB_SKIN_ID,
  buddyId = "",
}: {
  selectedHero?: string;
  selectedSkinColor?: string;
  selectedSkinId?: string;
  multiplayerMode?: string;
  multiplayerRole?: string;
  hostAddress?: string;
  hostIpAddress?: string;
  hostIpAddresses?: string;
  playerName?: string;
  profilePicture?: string;
  profileBorder?: string;
  orbEquipped?: boolean;
  orbSkinId?: string;
  buddyId?: string;
}) {
  const localProfilePicture = isProfilePictureId(profilePicture)
    ? profilePicture
    : DEFAULT_PROFILE_PICTURE;
  const localProfileBorder = getProfileBorder(profileBorder).id;
  const [game, setGame] = useState<GameState>(() => {
    const initial = createInitialGame(
      multiplayerRole === "join" ? DEFAULT_HERO_ID : selectedHero,
      multiplayerRole === "join" ? "#7dd3fc" : selectedSkinColor,
      multiplayerRole === "join" ? "" : selectedSkinId,
      multiplayerRole === "join" ? false : orbEquipped,
      multiplayerRole === "join" ? DEFAULT_ORB_SKIN_ID : orbSkinId,
      multiplayerRole === "join" ? "" : buddyId,
    );
    if (multiplayerRole !== "join") {
      initial.player.name = playerName ?? initial.player.name;
    }
    initial.player.name = playerName ?? initial.player.name;
    if (multiplayerMode === "local-host" || multiplayerMode === "local-join") {
      initial.isRunning = false;
      initial.message = "Waiting in lobby";
    }
    if (multiplayerRole === "join") {
      initial.joinPlayer = createPlayer(
        "join",
        selectedHero,
        ARENA_WIDTH / 2 + 20,
        ARENA_HEIGHT / 2,
        playerName ?? "Player 2",
        selectedSkinColor,
        selectedSkinId,
        orbEquipped,
        orbSkinId,
        buddyId,
      );
    }
    return initial;
  });
  const [dismissedBossChestId, setDismissedBossChestId] = useState<
    number | null
  >(null);
  const [joystick, setJoystick] = useState({ x: 0, y: 0, active: false });
  const [battleControlSettings, setBattleControlSettings] =
    useState<BattleControlSettings>(DEFAULT_BATTLE_CONTROLS);
  const [bossAddWarningOpacity] = useState(() => new Animated.Value(1));
  const [bossEntryMarkerOpacity] = useState(() => new Animated.Value(1));
  const [aimDirection, setAimDirection] = useState<Vector>({ x: 1, y: 0 });
  const [earnedCoins, setEarnedCoins] = useState(0);
  const [earnedXp, setEarnedXp] = useState(0);
  const [isFireHeld, setIsFireHeld] = useState(false);
  const [ghostAnimationTime, setGhostAnimationTime] = useState(0);
  const [selectedWeapon, setSelectedWeapon] = useState<"gun" | "grenade">(
    "gun",
  );
  const [powerUpSelection, setPowerUpSelection] = useState<{
    choiceKey: string;
    id: PowerUpId;
  } | null>(null);
  const [statsPopupPlayerId, setStatsPopupPlayerId] = useState<
    PlayerState["id"] | null
  >(null);
  const [grenadeAim, setGrenadeAim] = useState<{
    direction: Vector;
    range: number;
    cancelTargeted: boolean;
  } | null>(null);
  const [reviveTarget, setReviveTarget] = useState<PlayerState["id"] | null>(
    null,
  );
  const [multiplayerReadiness, setMultiplayerReadiness] = useState({
    host: true,
    join: false,
  });
  const [isMultiplayerLobby, setIsMultiplayerLobby] = useState(
    () => multiplayerMode === "local-host" || multiplayerMode === "local-join",
  );
  const [isMultiplayerConnected, setIsMultiplayerConnected] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<
    {
      id: string;
      name?: string;
      role?: string;
      hero?: string;
      profilePicture?: string;
      profileBorder?: string;
      orbSkinId?: string;
      buddyId?: string;
    }[]
  >([]);
  const multiplayerReadinessRef = useRef(multiplayerReadiness);
  const { width, height } = useWindowDimensions();
  const controlPositionStyle = (
    controlId: "joystick" | "fire" | "gun" | "grenade" | "heal" | "dash",
    controlWidth: number,
    controlHeight: number,
  ) => {
    const control = battleControlSettings.controls[controlId];
    const centerX = Math.max(
      (controlWidth * control.size) / 2,
      Math.min(width - (controlWidth * control.size) / 2, width * control.x),
    );
    const centerY = Math.max(
      (controlHeight * control.size) / 2,
      Math.min(height - (controlHeight * control.size) / 2, height * control.y),
    );
    return {
      left: centerX - controlWidth / 2,
      top: centerY - controlHeight / 2,
      width: controlWidth,
      height: controlHeight,
      opacity: control.opacity,
      transform: [{ scale: control.size }],
    };
  };
  const hostAddressesToShare = useMemo(() => {
    const addresses: { address: string; interfaceName: string }[] = [];

    try {
      const parsed = JSON.parse(hostIpAddresses ?? "[]") as unknown;
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (
            entry &&
            typeof entry === "object" &&
            "address" in entry &&
            typeof entry.address === "string" &&
            entry.address !== "0.0.0.0"
          ) {
            const interfaceName =
              "interfaceName" in entry &&
              typeof entry.interfaceName === "string"
                ? entry.interfaceName
                : "network";
            if (
              !addresses.some(
                (candidate) => candidate.address === entry.address,
              )
            ) {
              addresses.push({ address: entry.address, interfaceName });
            }
          }
        }
      }
    } catch {
      // Older navigation links may not include the serialized address list.
    }

    if (
      addresses.length === 0 &&
      hostIpAddress &&
      hostIpAddress !== "0.0.0.0"
    ) {
      addresses.push({ address: hostIpAddress, interfaceName: "network" });
    }

    return addresses;
  }, [hostIpAddress, hostIpAddresses]);
  const isLocalMultiplayer =
    multiplayerMode === "local-host" || multiplayerMode === "local-join";
  const localPlayerId: PlayerState["id"] =
    multiplayerRole === "join" ? "join" : "host";
  const reviveTargetIsAlive =
    reviveTarget === "host"
      ? !game.player.isDead
      : reviveTarget === "join"
        ? !!game.joinPlayer && !game.joinPlayer.isDead
        : false;
  const localPlayer =
    (localPlayerId === "join" ? game.joinPlayer : game.player) ?? game.player;
  const currentBulletImage =
    localPlayer.highDamageTimer > 0
      ? highDamageBulletImage
      : bulletProjectileImage;
  const bossChest = game.itemDrops.find((drop) => drop.kind === "chest");
  const showBossChestConversation =
    game.isRunning &&
    !game.isPaused &&
    game.powerUpChoices.length === 0 &&
    !!bossChest &&
    dismissedBossChestId !== bossChest.id;
  const powerUpChoiceKey = `${game.wave}:${game.powerUpChoices
    .map((choice) => choice.id)
    .join("|")}`;
  const selectedPowerUp =
    powerUpSelection?.choiceKey === powerUpChoiceKey
      ? (game.powerUpChoices.find(
          (choice) => choice.id === powerUpSelection.id,
        ) ?? null)
      : null;
  const vibrationEnabledRef = useRef(true);
  const vibrationPreferenceLoadedRef = useRef(false);
  const lastDamageEventIdRef = useRef<number | null>(null);
  const lastPlayerHurtSoundAtRef = useRef(0);
  const lastBossLaughAtRef = useRef(0);
  const knownBossPhaseRef = useRef<BossPhase>("idle");
  const knownBossHitIdRef = useRef(0);
  const bossLaughPlayerRef = useRef<ReturnType<
    typeof createAudioPlayer
  > | null>(null);
  const hasDownedPlayer = game.player.isDead || !!game.joinPlayer?.isDead;
  const hasEquippedOrb =
    (game.player.orbEquipped && !game.player.isDead) ||
    (!!game.joinPlayer?.orbEquipped && !game.joinPlayer.isDead);
  const hostAimDirection =
    localPlayerId === "host" ? aimDirection : game.player.facing;
  const joinAimDirection =
    localPlayerId === "join"
      ? aimDirection
      : (game.joinPlayer?.facing ?? { x: 1, y: 0 });
  const isReviveRequested = reviveTarget !== null;
  const isLocalPlayerReviving =
    isReviveRequested || game.reviveState?.reviverId === localPlayerId;
  const otherPlayer = localPlayerId === "host" ? game.joinPlayer : game.player;
  const nearbyDownedPlayer =
    otherPlayer?.isDead &&
    localPlayer &&
    Math.hypot(otherPlayer.x - localPlayer.x, otherPlayer.y - localPlayer.y) <=
      REVIVE_RANGE
      ? otherPlayer
      : null;
  const isBossCountdownWave = game.wave % WAVES_PER_ARENA === 0;
  const hasJoinedPlayer = lobbyPlayers.some(
    (player) => player.role === "guest",
  );
  const canHostSkipWave =
    multiplayerRole === "host" &&
    (!hasJoinedPlayer || multiplayerReadiness.join);

  useEffect(() => {
    let isMounted = true;
    void getBattleControlSettings().then((settings) => {
      if (isMounted) setBattleControlSettings(settings);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!game.bossAddSpawnSide) {
      bossAddWarningOpacity.setValue(1);
      return;
    }

    const flicker = Animated.loop(
      Animated.sequence([
        Animated.timing(bossAddWarningOpacity, {
          toValue: 0.18,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(bossAddWarningOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
    );
    flicker.start();
    return () => flicker.stop();
  }, [bossAddWarningOpacity, game.bossAddSpawnSide]);

  useEffect(() => {
    if (game.bossPhase !== "warning") {
      bossEntryMarkerOpacity.setValue(1);
      return;
    }

    const flicker = Animated.loop(
      Animated.sequence([
        Animated.timing(bossEntryMarkerOpacity, {
          toValue: 0.15,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(bossEntryMarkerOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]),
    );
    flicker.start();
    return () => flicker.stop();
  }, [bossEntryMarkerOpacity, game.bossPhase]);

  useEffect(() => {
    let isMounted = true;
    void getVibrationEnabled().then((enabled) => {
      if (isMounted) {
        vibrationEnabledRef.current = enabled;
        vibrationPreferenceLoadedRef.current = true;
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const playerShotPlayer = createAudioPlayer(playerShotSound);
    const orbLaserPlayer = createAudioPlayer(orbLaserSound);
    const grenadeExplosionPlayer = createAudioPlayer(grenadeExplosionSound);
    const enemyHurtPlayers = enemyHurtSounds.map((sound) =>
      createAudioPlayer(sound),
    );
    const enemyBossHurtPlayer = createAudioPlayer(enemyBossHurtSound);
    const bossLaughPlayer = createAudioPlayer(bossLaughSound);
    bossLaughPlayer.volume = soundEffectsVolumeRef.current;
    bossLaughPlayerRef.current = bossLaughPlayer;
    const playerHurtPlayers = playerHurtSounds.map((sound) =>
      createAudioPlayer(sound),
    );
    playerShotPlayer.volume = soundEffectsVolumeRef.current;
    orbLaserPlayer.volume = soundEffectsVolumeRef.current * 0.7;
    grenadeExplosionPlayer.volume = soundEffectsVolumeRef.current;
    for (const player of enemyHurtPlayers) {
      player.volume = soundEffectsVolumeRef.current;
    }
    enemyBossHurtPlayer.volume = soundEffectsVolumeRef.current;
    for (const player of playerHurtPlayers) {
      player.volume = soundEffectsVolumeRef.current;
    }
    playerShotPlayerRef.current = playerShotPlayer;
    orbLaserPlayerRef.current = orbLaserPlayer;
    grenadeExplosionPlayerRef.current = grenadeExplosionPlayer;
    enemyHurtPlayersRef.current = enemyHurtPlayers;
    enemyBossHurtPlayerRef.current = enemyBossHurtPlayer;
    playerHurtPlayersRef.current = playerHurtPlayers;

    return () => {
      playerShotPlayer.pause();
      playerShotPlayer.remove();
      orbLaserPlayer.pause();
      orbLaserPlayer.remove();
      grenadeExplosionPlayer.pause();
      grenadeExplosionPlayer.remove();
      for (const player of enemyHurtPlayers) {
        player.pause();
        player.remove();
      }
      enemyBossHurtPlayer.pause();
      enemyBossHurtPlayer.remove();
      bossLaughPlayer.pause();
      bossLaughPlayer.remove();
      bossLaughPlayerRef.current = null;
      for (const player of playerHurtPlayers) {
        player.pause();
        player.remove();
      }
      playerShotPlayerRef.current = null;
      orbLaserPlayerRef.current = null;
      grenadeExplosionPlayerRef.current = null;
      enemyHurtPlayersRef.current = [];
      enemyBossHurtPlayerRef.current = null;
      playerHurtPlayersRef.current = [];
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToSoundEffectsVolume((volume) => {
      soundEffectsVolumeRef.current = volume;
      if (playerShotPlayerRef.current)
        playerShotPlayerRef.current.volume = volume;
      if (orbLaserPlayerRef.current) {
        orbLaserPlayerRef.current.volume = volume * 0.7;
      }
      if (grenadeExplosionPlayerRef.current) {
        grenadeExplosionPlayerRef.current.volume = volume;
      }
      for (const player of enemyHurtPlayersRef.current) {
        player.volume = volume;
      }
      if (enemyBossHurtPlayerRef.current) {
        enemyBossHurtPlayerRef.current.volume = volume;
      }
      if (bossLaughPlayerRef.current) {
        bossLaughPlayerRef.current.volume = volume;
      }
      for (const player of playerHurtPlayersRef.current) {
        player.volume = volume;
      }
    });
    void getSoundEffectsVolume().then((volume) => {
      if (isMounted) {
        soundEffectsVolumeRef.current = volume;
        soundEffectsLoadedRef.current = true;
        if (playerShotPlayerRef.current) {
          playerShotPlayerRef.current.volume = volume;
        }
        if (orbLaserPlayerRef.current) {
          orbLaserPlayerRef.current.volume = volume * 0.7;
        }
        if (grenadeExplosionPlayerRef.current) {
          grenadeExplosionPlayerRef.current.volume = volume;
        }
        for (const player of enemyHurtPlayersRef.current) {
          player.volume = volume;
        }
        if (enemyBossHurtPlayerRef.current) {
          enemyBossHurtPlayerRef.current.volume = volume;
        }
        for (const player of playerHurtPlayersRef.current) {
          player.volume = volume;
        }
      }
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const bullets = game.bullets;
    const currentIds = new Set(bullets.map((bullet) => bullet.id));
    if (knownBulletIdsRef.current === null) {
      knownBulletIdsRef.current = currentIds;
      return;
    }

    const firedByLocalPlayer = bullets.some(
      (bullet) =>
        !knownBulletIdsRef.current?.has(bullet.id) &&
        bullet.playerId === localPlayerId,
    );
    knownBulletIdsRef.current = currentIds;
    if (
      firedByLocalPlayer &&
      soundEffectsLoadedRef.current &&
      soundEffectsVolumeRef.current > 0
    ) {
      replaySoundEffect(playerShotPlayerRef.current);
    }
  }, [game.bullets, localPlayerId]);

  useEffect(() => {
    const beams = game.orbBeams;
    const currentIds = new Set(beams.map((beam) => beam.id));
    if (knownOrbBeamIdsRef.current === null) {
      knownOrbBeamIdsRef.current = currentIds;
      return;
    }

    const firedByLocalOrb = beams.some(
      (beam) =>
        !knownOrbBeamIdsRef.current?.has(beam.id) &&
        beam.playerId === localPlayerId,
    );
    knownOrbBeamIdsRef.current = currentIds;
    if (
      firedByLocalOrb &&
      soundEffectsLoadedRef.current &&
      soundEffectsVolumeRef.current > 0
    ) {
      replaySoundEffect(orbLaserPlayerRef.current);
    }
  }, [game.orbBeams, localPlayerId]);

  useEffect(() => {
    const effects = game.enemyDeathEffects;
    const currentIds = new Set(effects.map((effect) => effect.id));
    if (knownEnemyDeathIdsRef.current === null) {
      knownEnemyDeathIdsRef.current = currentIds;
      return;
    }

    const newDeathEffects = effects.filter(
      (effect) => !knownEnemyDeathIdsRef.current?.has(effect.id),
    );
    knownEnemyDeathIdsRef.current = currentIds;
    if (!soundEffectsLoadedRef.current || soundEffectsVolumeRef.current <= 0) {
      return;
    }

    for (const effect of newDeathEffects) {
      if (effect.isArenaBoss) {
        replaySoundEffect(enemyBossHurtPlayerRef.current);
      } else if (enemyHurtPlayersRef.current.length > 0) {
        const soundIndex = Math.floor(
          Math.random() * enemyHurtPlayersRef.current.length,
        );
        replaySoundEffect(enemyHurtPlayersRef.current[soundIndex]);
      }
    }
  }, [game.enemyDeathEffects]);

  useEffect(() => {
    const explosions = game.grenadeExplosions;
    const currentIds = new Set(explosions.map((explosion) => explosion.id));
    if (knownGrenadeExplosionIdsRef.current === null) {
      knownGrenadeExplosionIdsRef.current = currentIds;
      return;
    }

    const explodedByLocalPlayer = explosions.some(
      (explosion) =>
        !knownGrenadeExplosionIdsRef.current?.has(explosion.id) &&
        explosion.playerId === localPlayerId,
    );
    knownGrenadeExplosionIdsRef.current = currentIds;
    if (explodedByLocalPlayer) {
      replayExplosionWithVibration(
        grenadeExplosionPlayerRef.current,
        vibrationPreferenceLoadedRef.current && vibrationEnabledRef.current,
        explosionVibrationTimerRef,
      );
    }
  }, [game.grenadeExplosions, localPlayerId]);

  useEffect(() => {
    const effects = game.bossAreaEffects;
    const currentIds = new Set(effects.map((effect) => effect.id));
    if (knownBossAreaEffectIdsRef.current === null) {
      knownBossAreaEffectIdsRef.current = currentIds;
      return;
    }

    const hasNewExplosion = effects.some(
      (effect) => !knownBossAreaEffectIdsRef.current?.has(effect.id),
    );
    knownBossAreaEffectIdsRef.current = currentIds;
    if (!hasNewExplosion) return;

    replayExplosionWithVibration(
      grenadeExplosionPlayerRef.current,
      vibrationPreferenceLoadedRef.current && vibrationEnabledRef.current,
      explosionVibrationTimerRef,
    );
  }, [game.bossAreaEffects]);

  useEffect(() => {
    const localDamageEvent = [...game.damageNumbers]
      .reverse()
      .find(
        (damageNumber) =>
          damageNumber.target === "player" &&
          damageNumber.playerId === localPlayerId,
      );

    if (
      !localDamageEvent ||
      localDamageEvent.id === lastDamageEventIdRef.current
    ) {
      return;
    }

    lastDamageEventIdRef.current = localDamageEvent.id;
    const now = Date.now();
    if (
      soundEffectsLoadedRef.current &&
      soundEffectsVolumeRef.current > 0 &&
      now - lastPlayerHurtSoundAtRef.current >= PLAYER_HURT_SOUND_COOLDOWN_MS &&
      playerHurtPlayersRef.current.length > 0
    ) {
      const soundIndex = Math.floor(
        Math.random() * playerHurtPlayersRef.current.length,
      );
      replaySoundEffect(playerHurtPlayersRef.current[soundIndex]);
      lastPlayerHurtSoundAtRef.current = now;
    }
    if (vibrationPreferenceLoadedRef.current && vibrationEnabledRef.current) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
        () => undefined,
      );
    }
  }, [game.damageNumbers, localPlayerId]);

  useEffect(() => {
    const enteredPhase =
      game.bossPhase === "entrance" && knownBossPhaseRef.current !== "entrance";
    const wasHit = game.bossHitId > knownBossHitIdRef.current;
    knownBossPhaseRef.current = game.bossPhase;
    knownBossHitIdRef.current = game.bossHitId;
    if (!enteredPhase && !wasHit) return;

    const now = Date.now();
    if (
      !soundEffectsLoadedRef.current ||
      soundEffectsVolumeRef.current <= 0 ||
      now - lastBossLaughAtRef.current < BOSS_LAUGH_COOLDOWN_MS
    ) {
      return;
    }
    lastBossLaughAtRef.current = now;
    replaySoundEffect(bossLaughPlayerRef.current);
  }, [game.bossPhase, game.bossHitId]);

  useEffect(() => {
    if (!hasDownedPlayer && !hasEquippedOrb && !localPlayer.buddyId) {
      return;
    }

    let animationFrame = 0;
    let lastUpdate = 0;
    const animateGhost = (timestamp: number) => {
      if (timestamp - lastUpdate >= 1000 / 30) {
        const animationTime = timestamp / 1000;
        setGhostAnimationTime(animationTime);
        lastUpdate = timestamp;
      }
      animationFrame = requestAnimationFrame(animateGhost);
    };

    animationFrame = requestAnimationFrame(animateGhost);
    return () => cancelAnimationFrame(animationFrame);
  }, [hasDownedPlayer, hasEquippedOrb, localPlayer.buddyId]);

  useEffect(() => {
    if (Platform.OS !== "android" || !game.isRunning) {
      return;
    }

    const backSubscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => backSubscription.remove();
  }, [game.isRunning]);

  const localRoleLabel =
    multiplayerRole === "host"
      ? "Host"
      : multiplayerRole === "join"
        ? "Player 2"
        : "Local multiplayer";
  const playerNumber = multiplayerRole === "join" ? 2 : 1;
  const playerBadge = `P${playerNumber}`;
  const localNetworkRole = multiplayerRole === "join" ? "guest" : "host";
  const makeHudPlayer = (
    id: string,
    badge: string,
    role: "host" | "guest",
    player: PlayerState,
  ) => {
    const lobbyProfile = lobbyPlayers.find((entry) => entry.role === role);
    const isLocalProfile = role === localNetworkRole;
    return {
      id,
      badge,
      role,
      player,
      profilePicture: isProfilePictureId(lobbyProfile?.profilePicture)
        ? lobbyProfile.profilePicture
        : isLocalProfile
          ? localProfilePicture
          : DEFAULT_PROFILE_PICTURE,
      profileBorder: lobbyProfile?.profileBorder
        ? getProfileBorder(lobbyProfile.profileBorder).id
        : isLocalProfile
          ? localProfileBorder
          : DEFAULT_PROFILE_BORDER,
    };
  };
  const hudPlayers: {
    id: string;
    badge: string;
    role: "host" | "guest";
    player: PlayerState;
    profilePicture: ProfilePictureId;
    profileBorder: string;
  }[] = isLocalMultiplayer
    ? [
        makeHudPlayer("host", "P1", "host", game.player),
        ...(game.joinPlayer
          ? [makeHudPlayer("join", "P2", "guest", game.joinPlayer)]
          : []),
      ]
    : [
        makeHudPlayer(
          localPlayerId,
          playerBadge,
          localPlayerId === "host" ? "host" : "guest",
          localPlayer,
        ),
      ];
  const reviveCountdown = game.reviveState
    ? Math.max(0, Math.ceil(REVIVE_DURATION - game.reviveState.progress))
    : isReviveRequested
      ? REVIVE_DURATION
      : 0;
  const arenaScale = useMemo(() => {
    return Math.max(0.1, Math.min(width / ARENA_WIDTH, height / ARENA_HEIGHT));
  }, [width, height]);
  const movementRef = useRef<Vector>({ x: 0, y: 0 });
  const lastJoystickVisualUpdateRef = useRef(0);
  const aimRef = useRef<Vector>({ x: 1, y: 0 });
  const selectedWeaponRef = useRef<"gun" | "grenade">("gun");
  const grenadeAimRef = useRef<{
    active: boolean;
    direction: Vector;
    range: number;
    cancelTargeted: boolean;
  }>({
    active: false,
    direction: { x: 1, y: 0 },
    range: DEFAULT_GRENADE_RANGE,
    cancelTargeted: false,
  });
  const grenadeAimOriginRef = useRef<Vector>({ x: 0, y: 0 });
  const remoteInputRef = useRef<PlayerInput>({
    movement: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    firing: false,
    weapon: "gun",
    grenadeAiming: false,
    grenadeRange: DEFAULT_GRENADE_RANGE,
    grenadeCancelTargeted: false,
    reviveTargetId: null,
  });
  const coinsAwardedRef = useRef(false);
  const xpAwardedRef = useRef(false);
  const highScoreRecordedRef = useRef(false);
  const multiplayerSocketRef = useRef<MultiplayerSocket | null>(null);
  const gameRef = useRef(game);
  const soundEffectsVolumeRef = useRef(0.75);
  const soundEffectsLoadedRef = useRef(false);
  const knownBulletIdsRef = useRef<Set<number> | null>(null);
  const knownOrbBeamIdsRef = useRef<Set<number> | null>(null);
  const knownEnemyDeathIdsRef = useRef<Set<number> | null>(null);
  const knownGrenadeExplosionIdsRef = useRef<Set<number> | null>(null);
  const knownBossAreaEffectIdsRef = useRef<Set<number> | null>(null);
  const explosionVibrationTimerRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const playerShotPlayerRef = useRef<ReturnType<
    typeof createAudioPlayer
  > | null>(null);
  const orbLaserPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(
    null,
  );
  const grenadeExplosionPlayerRef = useRef<ReturnType<
    typeof createAudioPlayer
  > | null>(null);
  const enemyHurtPlayersRef = useRef<ReturnType<typeof createAudioPlayer>[]>(
    [],
  );
  const enemyBossHurtPlayerRef = useRef<ReturnType<
    typeof createAudioPlayer
  > | null>(null);
  const playerHurtPlayersRef = useRef<ReturnType<typeof createAudioPlayer>[]>(
    [],
  );

  useEffect(() => () => {
    if (explosionVibrationTimerRef.current) {
      clearInterval(explosionVibrationTimerRef.current);
      explosionVibrationTimerRef.current = null;
    }
  });
  const grenadePreview = game.grenadeAimPreview;
  const grenadePreviewPlayer = grenadePreview
    ? grenadePreview.playerId === "join"
      ? game.joinPlayer
      : game.player
    : null;
  const grenadeLanding =
    grenadePreview && grenadePreviewPlayer
      ? {
          x: clamp(
            grenadePreviewPlayer.x +
              grenadePreview.direction.x * grenadePreview.range,
            0,
            ARENA_WIDTH,
          ),
          y: clamp(
            grenadePreviewPlayer.y +
              grenadePreview.direction.y * grenadePreview.range,
            0,
            ARENA_HEIGHT,
          ),
        }
      : null;

  useEffect(() => {
    if (!reviveTarget) return;
    if (reviveTargetIsAlive) {
      const completed = setTimeout(() => setReviveTarget(null), 0);
      return () => clearTimeout(completed);
    }
    const timeout = setTimeout(
      () => setReviveTarget(null),
      (REVIVE_DURATION + 2) * 1000,
    );
    return () => clearTimeout(timeout);
  }, [reviveTarget, reviveTargetIsAlive]);

  const sendPlayerAction = useCallback(
    (
      action: "dash" | "heal" | "grenade",
      direction: Vector = aimRef.current,
      grenadeRange = DEFAULT_GRENADE_RANGE,
    ) => {
      if (multiplayerRole === "join") {
        const socket = multiplayerSocketRef.current;
        if (socket?.readyState === MULTIPLAYER_SOCKET_OPEN) {
          socket.send(
            JSON.stringify({ type: "action", action, direction, grenadeRange }),
          );
        }
        return;
      }

      setGame((previous) =>
        applyPlayerAction(
          previous,
          localPlayerId,
          action,
          direction,
          grenadeRange,
        ),
      );
    },
    [localPlayerId, multiplayerRole],
  );

  const applyPowerUpAndStartWarp = useCallback((powerUpId: string) => {
    setGame((previous) => {
      const powerUp = previous.powerUpChoices.find(
        (choice) => choice.id === powerUpId,
      );
      if (!powerUp) {
        return previous;
      }

      return {
        ...previous,
        player: applyPowerUp(previous.player, powerUp),
        joinPlayer: previous.joinPlayer
          ? applyPowerUp(previous.joinPlayer, powerUp)
          : null,
        wave: previous.wave + 1,
        waveCountdown: getWaveCountdownDuration(previous.wave + 1),
        warpTransitionTimer: WARP_TRANSITION_DURATION,
        enemiesToSpawn: getWaveEnemyCount(previous.wave + 1),
        spawnCooldown: 0,
        bullets: [],
        bossPhase: "idle",
        bossPhaseTimer: 0,
        bossConfigId: null,
        bossAttackPhase: "cooldown",
        bossAttackTimer: 0,
        bossTelegraphTarget: null,
        bossDashDirection: null,
        bossDashHasHit: false,
        bossProjectiles: [],
        bossAreaEffects: [],
        bossAddSpawnTimer: 0,
        bossAddWarningTimer: 0,
        bossAddSpawnSide: null,
        powerUpChoices: [],
        warpPending: false,
        message: `${powerUp.name} selected! Warping to another location`,
      };
    });
  }, []);

  const confirmPowerUpSelection = useCallback(
    (powerUp: PowerUpChoice) => {
      if (multiplayerRole === "join") {
        const socket = multiplayerSocketRef.current;
        if (socket?.readyState === MULTIPLAYER_SOCKET_OPEN) {
          socket.send(
            JSON.stringify({
              type: "command",
              action: "choose-power-up",
              powerUpId: powerUp.id,
            }),
          );
        }
        return;
      }

      applyPowerUpAndStartWarp(powerUp.id);
    },
    [applyPowerUpAndStartWarp, multiplayerRole],
  );

  const skipWaveCountdown = useCallback(
    (broadcast = true) => {
      setGame((previous) =>
        previous.waveCountdown > 0 && previous.powerUpChoices.length === 0
          ? {
              ...previous,
              waveCountdown: 0,
              message: `Wave ${previous.wave} started!`,
            }
          : previous,
      );

      if (broadcast && isLocalMultiplayer && multiplayerRole === "host") {
        const socket = multiplayerSocketRef.current;
        if (socket?.readyState === MULTIPLAYER_SOCKET_OPEN) {
          socket.send(JSON.stringify({ type: "command", action: "skip-wave" }));
        }
      }
    },
    [isLocalMultiplayer, multiplayerRole],
  );

  const resetGameLocally = useCallback(() => {
    coinsAwardedRef.current = false;
    xpAwardedRef.current = false;
    highScoreRecordedRef.current = false;
    setEarnedCoins(0);
    setEarnedXp(0);
    setGame((previous) => {
      const restarted = createInitialGame(
        selectedHero,
        selectedSkinColor,
        selectedSkinId,
        orbEquipped,
        orbSkinId,
        buddyId,
      );
      restarted.player.name = playerName ?? restarted.player.name;
      if (isLocalMultiplayer && previous.joinPlayer) {
        restarted.joinPlayer = createPlayer(
          "join",
          previous.joinPlayer.hero,
          ARENA_WIDTH / 2 + 20,
          ARENA_HEIGHT / 2,
          previous.joinPlayer.name,
          previous.joinPlayer.skinColor,
          previous.joinPlayer.skinId,
          previous.joinPlayer.orbEquipped,
          previous.joinPlayer.orbSkinId,
          previous.joinPlayer.buddyId,
        );
      }
      return restarted;
    });
    setJoystick({ x: 0, y: 0, active: false });
    setIsFireHeld(false);
    setSelectedWeapon("gun");
    selectedWeaponRef.current = "gun";
    grenadeAimRef.current.active = false;
    setGrenadeAim(null);
    movementRef.current = { x: 0, y: 0 };
    aimRef.current = { x: 1, y: 0 };
    setAimDirection({ x: 1, y: 0 });
    setReviveTarget(null);
  }, [
    isLocalMultiplayer,
    playerName,
    selectedHero,
    selectedSkinColor,
    selectedSkinId,
    orbEquipped,
    orbSkinId,
    buddyId,
  ]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (multiplayerRole !== "host") {
      return;
    }
    void startLocalHostServer().catch(() => undefined);
    return () => stopLocalHostServer();
  }, [multiplayerRole]);

  useEffect(() => {
    if (!isLocalMultiplayer) {
      return;
    }

    const socket = createMultiplayerSocket(hostAddress || "127.0.0.1");
    multiplayerSocketRef.current = socket;

    socket.onopen = () => {
      setIsMultiplayerConnected(true);
      socket.send(
        JSON.stringify({
          type: "register",
          role: multiplayerRole === "host" ? "host" : "join",
          hero: selectedHero,
          skinId: selectedSkinId,
          skinColor: selectedSkinColor,
          profilePicture: localProfilePicture,
          profileBorder: localProfileBorder,
          orbEquipped,
          orbSkinId,
          buddyId,
          name:
            playerName ??
            (multiplayerRole === "host" ? "Player 1" : "Player 2"),
        }),
      );

      if (multiplayerRole === "join") {
        socket.send(
          JSON.stringify({
            type: "ready",
            ready: multiplayerReadinessRef.current.join,
          }),
        );
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as {
          type?: string;
          room?: {
            players?: {
              id: string;
              role?: string;
              ready?: boolean;
              hero?: string;
              skinId?: string;
              skinColor?: string;
              name?: string;
              profilePicture?: string;
              profileBorder?: string;
              orbEquipped?: boolean;
              orbSkinId?: string;
              buddyId?: string;
            }[];
            gameState?: GameState | null;
          };
          payload?: GameState;
          action?: string;
          powerUpId?: string;
          direction?: Vector;
          grenadeRange?: number;
          sourceRole?: string;
          input?: Partial<PlayerInput>;
        };

        if (message.type === "room-state" && message.room) {
          setLobbyPlayers(message.room.players ?? []);
          const roomGameState = message.room.gameState;
          if (multiplayerRole === "join" && roomGameState?.isRunning) {
            setIsMultiplayerLobby(false);
          }
          const readyMap = {
            host: false,
            join: false,
          };

          for (const player of message.room.players ?? []) {
            if (player.role === "host") {
              readyMap.host = !!player.ready;
            }
            if (player.role === "guest") {
              readyMap.join = !!player.ready;
            }
          }

          const nextReadiness = {
            host: readyMap.host,
            join: readyMap.join,
          };
          multiplayerReadinessRef.current = nextReadiness;
          setMultiplayerReadiness((previous) => ({
            ...previous,
            ...nextReadiness,
          }));

          const remotePlayer = message.room.players?.find(
            (player) => player.role === "guest",
          );
          const hostPlayer = message.room.players?.find(
            (player) => player.role === "host",
          );
          if (remotePlayer || hostPlayer) {
            setGame((previous) => {
              let nextState = previous;
              if (multiplayerRole === "host" && remotePlayer) {
                nextState = {
                  ...nextState,
                  joinPlayer: nextState.joinPlayer
                    ? {
                        ...nextState.joinPlayer,
                        hero: remotePlayer.hero ?? nextState.joinPlayer.hero,
                        skinId:
                          remotePlayer.skinId ?? nextState.joinPlayer.skinId,
                        skinColor:
                          remotePlayer.skinColor ??
                          nextState.joinPlayer.skinColor,
                        name: remotePlayer.name ?? nextState.joinPlayer.name,
                        orbEquipped:
                          remotePlayer.orbEquipped ??
                          nextState.joinPlayer.orbEquipped,
                        orbSkinId:
                          remotePlayer.orbSkinId ??
                          nextState.joinPlayer.orbSkinId,
                        buddyId:
                          remotePlayer.buddyId ?? nextState.joinPlayer.buddyId,
                      }
                    : createPlayer(
                        "join",
                        remotePlayer.hero ?? "dog",
                        ARENA_WIDTH / 2 + 20,
                        ARENA_HEIGHT / 2,
                        remotePlayer.name ?? "Player 2",
                        remotePlayer.skinColor ?? "#f9a8d4",
                        remotePlayer.skinId ?? "",
                        remotePlayer.orbEquipped ?? false,
                        remotePlayer.orbSkinId ?? DEFAULT_ORB_SKIN_ID,
                        remotePlayer.buddyId ?? "",
                      ),
                };
              }
              if (multiplayerRole === "host" && hostPlayer) {
                nextState = {
                  ...nextState,
                  player: {
                    ...nextState.player,
                    hero: hostPlayer.hero ?? nextState.player.hero,
                    skinId: hostPlayer.skinId ?? nextState.player.skinId,
                    skinColor:
                      hostPlayer.skinColor ?? nextState.player.skinColor,
                    name:
                      playerName ?? hostPlayer.name ?? nextState.player.name,
                    orbEquipped:
                      hostPlayer.orbEquipped ?? nextState.player.orbEquipped,
                    orbSkinId:
                      hostPlayer.orbSkinId ?? nextState.player.orbSkinId,
                    buddyId: hostPlayer.buddyId ?? nextState.player.buddyId,
                  },
                };
              }
              if (multiplayerRole === "join") {
                if (multiplayerRole === "join" && hostPlayer?.hero) {
                  nextState = {
                    ...nextState,
                    player: {
                      ...nextState.player,
                      hero: hostPlayer.hero,
                      skinId: hostPlayer.skinId ?? nextState.player.skinId,
                      skinColor:
                        hostPlayer.skinColor ?? nextState.player.skinColor,
                      name: hostPlayer.name ?? nextState.player.name,
                      orbSkinId:
                        hostPlayer.orbSkinId ?? nextState.player.orbSkinId,
                      buddyId: hostPlayer.buddyId ?? nextState.player.buddyId,
                    },
                  };
                }
                nextState = {
                  ...nextState,
                  joinPlayer:
                    nextState.joinPlayer ??
                    createPlayer(
                      "join",
                      selectedHero,
                      ARENA_WIDTH / 2 + 20,
                      ARENA_HEIGHT / 2,
                      playerName ?? "Player 2",
                      selectedSkinColor,
                      selectedSkinId,
                      orbEquipped,
                      orbSkinId,
                      buddyId,
                    ),
                };
              }

              return multiplayerRole === "join" && roomGameState
                ? { ...nextState, ...roomGameState }
                : nextState;
            });
          }

          return;
        }

        if (message.type === "remote-sync" && message.payload) {
          if (multiplayerRole === "join") {
            setGame(message.payload);
            if (message.payload.isRunning) {
              setIsMultiplayerLobby(false);
            }
          }
          return;
        }

        if (message.type === "remote-input" && multiplayerRole === "host") {
          remoteInputRef.current = {
            ...remoteInputRef.current,
            ...(message.input ?? {}),
          };
          return;
        }

        if (
          message.type === "player-action" &&
          message.sourceRole === "guest" &&
          multiplayerRole === "host" &&
          message.action
        ) {
          setGame((previous) =>
            applyPlayerAction(
              previous,
              "join",
              message.action ?? "",
              message.direction ?? remoteInputRef.current.aim,
              message.grenadeRange ?? DEFAULT_GRENADE_RANGE,
            ),
          );
          return;
        }

        if (
          message.type === "room-command" &&
          message.action === "choose-power-up" &&
          multiplayerRole === "host" &&
          message.powerUpId
        ) {
          applyPowerUpAndStartWarp(message.powerUpId);
          return;
        }

        if (message.type === "room-command" && message.action === "skip-wave") {
          skipWaveCountdown(false);
          return;
        }

        if (
          message.type === "room-command" &&
          message.action === "start-game"
        ) {
          setIsMultiplayerLobby(false);
          setGame((previous) => ({
            ...previous,
            isRunning: true,
            isPaused: false,
            message: "Wave 1",
          }));
          return;
        }

        if (message.type === "room-command" && message.action === "restart") {
          resetGameLocally();
          return;
        }

        if (
          message.type === "room-command" &&
          message.action === "pause-toggle"
        ) {
          setGame((previous) => ({
            ...previous,
            isPaused: !previous.isPaused,
            message: previous.isPaused ? "Back in the fight!" : "Paused",
          }));
          return;
        }

        if (message.type === "room-command" && message.action === "give-up") {
          setGame((previous) => ({
            ...previous,
            isRunning: false,
            isPaused: false,
            message: "You gave up!",
          }));
          return;
        }
      } catch {
        // ignore malformed multiplayer messages until the room state arrives
      }
    };

    return () => {
      setIsMultiplayerConnected(false);
      socket.close();
      if (multiplayerSocketRef.current === socket) {
        multiplayerSocketRef.current = null;
      }
    };
  }, [
    hostAddress,
    isLocalMultiplayer,
    multiplayerRole,
    playerName,
    localProfileBorder,
    localProfilePicture,
    selectedHero,
    selectedSkinColor,
    selectedSkinId,
    orbEquipped,
    orbSkinId,
    buddyId,
    skipWaveCountdown,
    resetGameLocally,
    applyPowerUpAndStartWarp,
  ]);

  useEffect(() => {
    if (!isLocalMultiplayer || multiplayerRole !== "host") {
      return;
    }

    const interval = setInterval(() => {
      const socket = multiplayerSocketRef.current;
      if (!socket || socket.readyState !== MULTIPLAYER_SOCKET_OPEN) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: "sync",
          payload: gameRef.current,
        }),
      );
    }, 50);

    return () => {
      clearInterval(interval);
    };
  }, [isLocalMultiplayer, multiplayerRole]);

  useEffect(() => {
    if (!isLocalMultiplayer || multiplayerRole !== "join") {
      return;
    }

    const interval = setInterval(() => {
      const socket = multiplayerSocketRef.current;
      if (!socket || socket.readyState !== MULTIPLAYER_SOCKET_OPEN) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: "input",
          input: {
            movement: movementRef.current,
            aim: aimRef.current,
            firing: isFireHeld && selectedWeaponRef.current === "gun",
            weapon: selectedWeaponRef.current,
            grenadeAiming: grenadeAimRef.current.active,
            grenadeRange: grenadeAimRef.current.range,
            grenadeCancelTargeted: grenadeAimRef.current.cancelTargeted,
            reviveTargetId: reviveTarget,
          } satisfies PlayerInput,
        }),
      );
    }, 33);

    return () => clearInterval(interval);
  }, [
    isFireHeld,
    isLocalMultiplayer,
    multiplayerRole,
    reviveTarget,
    selectedWeapon,
  ]);

  useEffect(() => {
    if (!isLocalMultiplayer || multiplayerRole !== "join") {
      return;
    }

    const socket = multiplayerSocketRef.current;
    if (socket && socket.readyState === MULTIPLAYER_SOCKET_OPEN) {
      socket.send(
        JSON.stringify({
          type: "ready",
          ready: multiplayerReadiness.join,
        }),
      );
    }
  }, [isLocalMultiplayer, multiplayerReadiness.join, multiplayerRole]);

  useEffect(() => {
    if (!isLocalMultiplayer || multiplayerRole !== "host") {
      return;
    }

    const socket = multiplayerSocketRef.current;
    if (socket && socket.readyState === MULTIPLAYER_SOCKET_OPEN) {
      socket.send(
        JSON.stringify({
          type: "ready",
          ready: multiplayerReadiness.host,
        }),
      );
    }
  }, [isLocalMultiplayer, multiplayerReadiness.host, multiplayerRole]);

  useEffect(() => {
    if (
      game.isRunning ||
      game.isPaused ||
      highScoreRecordedRef.current ||
      isMultiplayerLobby ||
      (isLocalMultiplayer && multiplayerRole === "join")
    ) {
      return;
    }

    highScoreRecordedRef.current = true;
    void recordPlayerHighScore(game.score, localPlayer.name).catch(
      () => undefined,
    );
  }, [
    game.isPaused,
    game.isRunning,
    game.score,
    isLocalMultiplayer,
    isMultiplayerLobby,
    localPlayer.name,
    multiplayerRole,
  ]);

  useEffect(() => {
    if (
      game.isRunning ||
      game.isPaused ||
      coinsAwardedRef.current ||
      (isLocalMultiplayer && multiplayerRole === "join")
    ) {
      return;
    }

    coinsAwardedRef.current = true;
    const pointsPerCoin = Math.max(1, coinRewards.pointsPerCoin);
    const reward = Math.floor(
      (game.score / pointsPerCoin) *
        (1 + getBuddyBonus(localPlayer.buddyId, "coinGain") / 100),
    );
    if (reward <= 0) {
      return;
    }

    void awardCoins(reward)
      .then(() => setEarnedCoins(reward))
      .catch(() => setEarnedCoins(0));
  }, [
    game.isPaused,
    game.isRunning,
    game.score,
    isLocalMultiplayer,
    multiplayerRole,
    localPlayer.buddyId,
  ]);

  useEffect(() => {
    if (
      isMultiplayerLobby ||
      game.isRunning ||
      game.isPaused ||
      xpAwardedRef.current
    ) {
      return;
    }

    xpAwardedRef.current = true;
    const reward = Math.max(
      0,
      Math.floor(
        game.score * (1 + getBuddyBonus(localPlayer.buddyId, "xpGain") / 100),
      ),
    );
    if (reward === 0) {
      return;
    }

    void awardPlayerXp(reward)
      .then(() => setEarnedXp(reward))
      .catch(() => setEarnedXp(0));
  }, [
    game.isPaused,
    game.isRunning,
    game.score,
    isMultiplayerLobby,
    localPlayer.buddyId,
  ]);

  const togglePause = useCallback(() => {
    const socket = multiplayerSocketRef.current;
    if (isLocalMultiplayer && multiplayerRole === "join") {
      if (socket?.readyState === MULTIPLAYER_SOCKET_OPEN) {
        socket.send(
          JSON.stringify({ type: "command", action: "pause-toggle" }),
        );
      }
      return;
    }

    setGame((previous) => ({
      ...previous,
      isPaused: !previous.isPaused,
      message: previous.isPaused ? "Back in the fight!" : "Paused",
    }));
    if (
      isLocalMultiplayer &&
      multiplayerRole === "host" &&
      socket?.readyState === MULTIPLAYER_SOCKET_OPEN
    ) {
      socket.send(JSON.stringify({ type: "command", action: "pause-toggle" }));
    }
  }, [isLocalMultiplayer, multiplayerRole]);

  const giveUp = useCallback(() => {
    const socket = multiplayerSocketRef.current;
    if (isLocalMultiplayer && multiplayerRole === "join") {
      if (socket?.readyState === MULTIPLAYER_SOCKET_OPEN) {
        socket.send(JSON.stringify({ type: "command", action: "give-up" }));
      }
      return;
    }

    setGame((previous) => ({
      ...previous,
      isRunning: false,
      isPaused: false,
      message: "You gave up!",
    }));
    if (
      isLocalMultiplayer &&
      multiplayerRole === "host" &&
      socket?.readyState === MULTIPLAYER_SOCKET_OPEN
    ) {
      socket.send(JSON.stringify({ type: "command", action: "give-up" }));
    }
  }, [isLocalMultiplayer, multiplayerRole]);

  const resetGame = useCallback(() => {
    const socket = multiplayerSocketRef.current;
    if (isLocalMultiplayer && multiplayerRole === "join") {
      if (socket?.readyState === MULTIPLAYER_SOCKET_OPEN) {
        socket.send(JSON.stringify({ type: "command", action: "restart" }));
      }
      return;
    }

    resetGameLocally();
    if (
      isLocalMultiplayer &&
      multiplayerRole === "host" &&
      socket?.readyState === MULTIPLAYER_SOCKET_OPEN
    ) {
      socket.send(JSON.stringify({ type: "command", action: "restart" }));
    }
  }, [isLocalMultiplayer, multiplayerRole, resetGameLocally]);

  const goToMenu = useCallback(() => {
    router.push("/");
  }, []);

  const startMultiplayerGame = () => {
    if (multiplayerRole !== "host") {
      return;
    }

    setIsMultiplayerLobby(false);
    setGame((previous) => ({
      ...previous,
      isRunning: true,
      isPaused: false,
      message: "Wave 1",
    }));

    const socket = multiplayerSocketRef.current;
    if (socket?.readyState === MULTIPLAYER_SOCKET_OPEN) {
      socket.send(JSON.stringify({ type: "command", action: "start-game" }));
    }
  };

  const selectWeapon = useCallback((weapon: "gun" | "grenade") => {
    selectedWeaponRef.current = weapon;
    setSelectedWeapon(weapon);
    setIsFireHeld(false);
    if (grenadeAimRef.current.active) {
      grenadeAimRef.current.active = false;
      setGrenadeAim(null);
    }
  }, []);

  const cancelGrenadeThrow = () => {
    if (!grenadeAimRef.current.active) return;
    grenadeAimRef.current.active = false;
    grenadeAimRef.current.cancelTargeted = true;
    setGrenadeAim(null);
    setIsFireHeld(false);
  };

  const triggerDash = useCallback(() => {
    if (localPlayer.isDead || localPlayer.dashCooldown > 0) {
      return;
    }
    const movement = movementRef.current;
    const direction =
      Math.hypot(movement.x, movement.y) > 0.05
        ? normalize(movement)
        : aimRef.current;
    sendPlayerAction("dash", direction);
  }, [localPlayer.dashCooldown, localPlayer.isDead, sendPlayerAction]);
  const triggerHeal = useCallback(() => {
    if (localPlayer.heals <= 0) {
      return;
    }
    sendPlayerAction("heal");
  }, [localPlayer.heals, sendPlayerAction]);

  const toggleRevive = () => {
    if (isLocalPlayerReviving) {
      setReviveTarget(null);
      movementRef.current = { x: 0, y: 0 };
      setJoystick({ x: 0, y: 0, active: false });
      setIsFireHeld(false);
      return;
    }

    if (nearbyDownedPlayer && !localPlayer?.isDead) {
      setReviveTarget(nearbyDownedPlayer.id);
      movementRef.current = { x: 0, y: 0 };
      setJoystick({ x: 0, y: 0, active: false });
      setIsFireHeld(false);
    }
  };

  useEffect(() => {
    let animationFrame = 0;
    let lastFrame = 0;
    const frameInterval = 1000 / 60;

    const tick = (timestamp: number) => {
      if (lastFrame > 0 && timestamp - lastFrame < frameInterval) {
        animationFrame = requestAnimationFrame(tick);
        return;
      }

      const delta = Math.min((timestamp - lastFrame) / 1000 || 0.016, 0.033);
      lastFrame = timestamp;

      if (isLocalMultiplayer && multiplayerRole === "join") {
        setGame((previous) => {
          const player = previous.joinPlayer;
          if (
            !previous.isRunning ||
            previous.isPaused ||
            previous.powerUpChoices.length > 0 ||
            !player ||
            player.isDead ||
            previous.reviveState?.reviverId === "join"
          ) {
            return previous;
          }

          const movement = normalize(movementRef.current);
          const facing = normalize(aimRef.current);
          const targetOrbSide =
            facing.x < -0.12 ? 1 : facing.x > 0.12 ? -1 : player.orbSide;
          const knockbackX = player.knockbackX ?? 0;
          const knockbackY = player.knockbackY ?? 0;
          if (
            movementRef.current.x === 0 &&
            movementRef.current.y === 0 &&
            Math.hypot(facing.x - player.facing.x, facing.y - player.facing.y) <
              0.01 &&
            Math.abs(targetOrbSide - player.orbSide) < 0.01 &&
            Math.hypot(knockbackX, knockbackY) < 1 &&
            (player.hitFlashTimer ?? 0) <= 0
          ) {
            return previous;
          }

          const effectiveSpeed = getEffectivePlayerSpeed(player);
          const knockbackDecay = Math.exp(-8 * delta);
          return {
            ...previous,
            joinPlayer: {
              ...player,
              speedBoostTimer: Math.max(0, player.speedBoostTimer - delta),
              rapidFireTimer: Math.max(0, player.rapidFireTimer - delta),
              highDamageTimer: Math.max(0, player.highDamageTimer - delta),
              orbFireCooldown: Math.max(0, player.orbFireCooldown - delta),
              hitFlashTimer: Math.max(0, (player.hitFlashTimer ?? 0) - delta),
              knockbackX: knockbackX * knockbackDecay,
              knockbackY: knockbackY * knockbackDecay,
              x: clamp(
                player.x +
                  movement.x * effectiveSpeed * delta +
                  knockbackX * delta,
                player.radius,
                ARENA_WIDTH - player.radius,
              ),
              y: clamp(
                player.y +
                  movement.y * effectiveSpeed * delta +
                  knockbackY * delta,
                player.radius,
                ARENA_HEIGHT - player.radius,
              ),
              facing,
              visualFacing: getPlayerVisualFacing(
                player.visualFacing,
                movement.x,
              ),
              orbSide: getOrbSideAfterDelta({ ...player, facing }, delta),
            },
          };
        });
        animationFrame = requestAnimationFrame(tick);
        return;
      }

      setGame((previous) => {
        if (
          !previous.isRunning ||
          previous.isPaused ||
          previous.powerUpChoices.length > 0
        ) {
          return previous;
        }

        let player = {
          ...previous.player,
          grenades: previous.grenades,
          heals: previous.heals,
          dashCooldown: previous.dashCooldown,
          fireCooldown: previous.fireCooldown,
          speedBoostTimer: Math.max(0, previous.player.speedBoostTimer - delta),
          rapidFireTimer: Math.max(0, previous.player.rapidFireTimer - delta),
          highDamageTimer: Math.max(0, previous.player.highDamageTimer - delta),
          orbFireCooldown: Math.max(0, previous.player.orbFireCooldown - delta),
          hitFlashTimer: Math.max(
            0,
            (previous.player.hitFlashTimer ?? 0) - delta,
          ),
          knockbackX: previous.player.knockbackX ?? 0,
          knockbackY: previous.player.knockbackY ?? 0,
        };
        let joinPlayer = previous.joinPlayer
          ? {
              ...previous.joinPlayer,
              speedBoostTimer: Math.max(
                0,
                previous.joinPlayer.speedBoostTimer - delta,
              ),
              rapidFireTimer: Math.max(
                0,
                previous.joinPlayer.rapidFireTimer - delta,
              ),
              highDamageTimer: Math.max(
                0,
                previous.joinPlayer.highDamageTimer - delta,
              ),
              orbFireCooldown: Math.max(
                0,
                previous.joinPlayer.orbFireCooldown - delta,
              ),
              hitFlashTimer: Math.max(
                0,
                (previous.joinPlayer.hitFlashTimer ?? 0) - delta,
              ),
              knockbackX: previous.joinPlayer.knockbackX ?? 0,
              knockbackY: previous.joinPlayer.knockbackY ?? 0,
            }
          : null;
        const hostIsReviving = previous.reviveState?.reviverId === "host";
        const joinIsReviving = previous.reviveState?.reviverId === "join";
        const knockbackDecay = Math.exp(-8 * delta);
        const moveVector = normalize(movementRef.current);

        if (!player.isDead && !hostIsReviving) {
          const effectiveSpeed = getEffectivePlayerSpeed(player);
          player.x = clamp(
            player.x +
              moveVector.x * effectiveSpeed * delta +
              (player.knockbackX ?? 0) * delta,
            player.radius,
            ARENA_WIDTH - player.radius,
          );
          player.y = clamp(
            player.y +
              moveVector.y * effectiveSpeed * delta +
              (player.knockbackY ?? 0) * delta,
            player.radius,
            ARENA_HEIGHT - player.radius,
          );
          player.facing = normalize(aimRef.current);
          player.visualFacing = getPlayerVisualFacing(
            player.visualFacing,
            moveVector.x,
          );
          player.orbSide = getOrbSideAfterDelta(player, delta);
        }
        player.knockbackX = (player.knockbackX ?? 0) * knockbackDecay;
        player.knockbackY = (player.knockbackY ?? 0) * knockbackDecay;
        if (joinPlayer && !joinPlayer.isDead && !joinIsReviving) {
          const guestMove = normalize(remoteInputRef.current.movement);
          const guestEffectiveSpeed = getEffectivePlayerSpeed(joinPlayer);
          joinPlayer.x = clamp(
            joinPlayer.x +
              guestMove.x * guestEffectiveSpeed * delta +
              (joinPlayer.knockbackX ?? 0) * delta,
            joinPlayer.radius,
            ARENA_WIDTH - joinPlayer.radius,
          );
          joinPlayer.y = clamp(
            joinPlayer.y +
              guestMove.y * guestEffectiveSpeed * delta +
              (joinPlayer.knockbackY ?? 0) * delta,
            joinPlayer.radius,
            ARENA_HEIGHT - joinPlayer.radius,
          );
          joinPlayer.facing = normalize(remoteInputRef.current.aim);
          joinPlayer.visualFacing = getPlayerVisualFacing(
            joinPlayer.visualFacing,
            guestMove.x,
          );
          joinPlayer.orbSide = getOrbSideAfterDelta(joinPlayer, delta);
        }
        if (joinPlayer) {
          joinPlayer.knockbackX = (joinPlayer.knockbackX ?? 0) * knockbackDecay;
          joinPlayer.knockbackY = (joinPlayer.knockbackY ?? 0) * knockbackDecay;
        }

        const grenadeAimPreview =
          selectedWeaponRef.current === "grenade" &&
          grenadeAimRef.current.active
            ? {
                playerId: "host" as const,
                direction: grenadeAimRef.current.direction,
                range: grenadeAimRef.current.range,
                cancelTargeted: grenadeAimRef.current.cancelTargeted,
              }
            : joinPlayer &&
                remoteInputRef.current.weapon === "grenade" &&
                remoteInputRef.current.grenadeAiming
              ? {
                  playerId: "join" as const,
                  direction: remoteInputRef.current.aim,
                  range: remoteInputRef.current.grenadeRange,
                  cancelTargeted: remoteInputRef.current.grenadeCancelTargeted,
                }
              : null;

        if (previous.waveCountdown > 0 || previous.warpTransitionTimer > 0) {
          const warpTransitionTimer = Math.max(
            0,
            previous.warpTransitionTimer - delta,
          );
          const arenaBackgroundWave =
            previous.warpTransitionTimer > WARP_TRANSITION_DURATION / 2 &&
            warpTransitionTimer <= WARP_TRANSITION_DURATION / 2
              ? previous.wave
              : previous.arenaBackgroundWave;
          const waveCountdown =
            previous.warpTransitionTimer > 0
              ? previous.waveCountdown
              : Math.max(0, previous.waveCountdown - delta);
          let bullets = previous.bullets
            .map((bullet) => ({
              ...bullet,
              x: bullet.x + bullet.vx * bullet.speed * delta,
              y: bullet.y + bullet.vy * bullet.speed * delta,
            }))
            .filter(
              (bullet) =>
                bullet.x > -20 &&
                bullet.x < ARENA_WIDTH + 20 &&
                bullet.y > -20 &&
                bullet.y < ARENA_HEIGHT + 20,
            );
          let fireCooldown = Math.max(0, previous.fireCooldown - delta);

          if (
            isFireHeld &&
            selectedWeaponRef.current === "gun" &&
            !player.isDead &&
            !hostIsReviving &&
            fireCooldown <= 0
          ) {
            const direction = normalize(aimRef.current);
            bullets = [
              ...bullets,
              {
                id: Date.now() + Math.random(),
                playerId: player.id,
                x: player.x + direction.x * (player.radius + 10),
                y: player.y + direction.y * (player.radius + 10),
                radius: 5,
                speed: BULLET_SPEED,
                damage: getEffectiveBulletDamage(player),
                isHighDamage: player.highDamageTimer > 0,
                vx: direction.x,
                vy: direction.y,
              },
            ];
            fireCooldown = getEffectiveFireCooldown(player);
          }
          if (
            joinPlayer &&
            !joinPlayer.isDead &&
            !joinIsReviving &&
            remoteInputRef.current.weapon === "gun" &&
            remoteInputRef.current.firing
          ) {
            joinPlayer.fireCooldown = Math.max(
              0,
              joinPlayer.fireCooldown - delta,
            );
            if (joinPlayer.fireCooldown <= 0) {
              const direction = normalize(remoteInputRef.current.aim);
              bullets = [
                ...bullets,
                {
                  id: Date.now() + Math.random(),
                  playerId: joinPlayer.id,
                  x: joinPlayer.x + direction.x * (joinPlayer.radius + 10),
                  y: joinPlayer.y + direction.y * (joinPlayer.radius + 10),
                  radius: 5,
                  speed: BULLET_SPEED,
                  damage: getEffectiveBulletDamage(joinPlayer),
                  isHighDamage: joinPlayer.highDamageTimer > 0,
                  vx: direction.x,
                  vy: direction.y,
                },
              ];
              joinPlayer.fireCooldown = getEffectiveFireCooldown(joinPlayer);
            }
          } else if (joinPlayer) {
            joinPlayer.fireCooldown = Math.max(
              0,
              joinPlayer.fireCooldown - delta,
            );
          }

          const grenadeUpdate = advanceGrenadeProjectiles(
            previous.grenadeProjectiles,
            [],
            delta,
          );
          const damageNumbers = previous.damageNumbers
            .map((damageNumber) => ({
              ...damageNumber,
              life: damageNumber.life - delta,
            }))
            .filter((damageNumber) => damageNumber.life > 0)
            .concat(grenadeUpdate.damageNumbers);
          const grenadeExplosions = [
            ...previous.grenadeExplosions
              .map((explosion) => ({
                ...explosion,
                life: explosion.life - delta,
              }))
              .filter((explosion) => explosion.life > 0),
            ...grenadeUpdate.explosions,
          ];
          const enemyDeathEffects = [
            ...previous.enemyDeathEffects
              .map((effect) => ({ ...effect, life: effect.life - delta }))
              .filter((effect) => effect.life > 0),
            ...grenadeUpdate.enemyDeathEffects,
          ];
          let itemDrops = previous.itemDrops;
          let powerUpChoices = previous.powerUpChoices;
          let warpPending = previous.warpPending;
          let message = previous.message;
          if (!player.isDead) {
            const pickup = advanceItemDrops(itemDrops, player, delta);
            player = pickup.player;
            itemDrops = pickup.drops;
            damageNumbers.push(...pickup.damageNumbers);
            if (pickup.rewardPopupTriggered) {
              powerUpChoices = createPowerUpChoices();
              warpPending = true;
              message = "Choose your chest reward";
            }
          }
          if (joinPlayer && !joinPlayer.isDead) {
            const pickup = advanceItemDrops(itemDrops, joinPlayer, delta);
            joinPlayer = pickup.player;
            itemDrops = pickup.drops;
            damageNumbers.push(...pickup.damageNumbers);
            if (pickup.rewardPopupTriggered) {
              powerUpChoices = createPowerUpChoices();
              warpPending = true;
              message = "Choose your chest reward";
            }
          }

          return {
            ...previous,
            orbBeams: previous.orbBeams
              .map((beam) => ({ ...beam, life: beam.life - delta }))
              .filter((beam) => beam.life > 0),
            grenadeAimPreview,
            player: {
              ...player,
              fireCooldown,
              dashCooldown: Math.max(0, player.dashCooldown - delta),
            },
            joinPlayer,
            grenades: player.grenades,
            heals: player.heals,
            bullets,
            itemDrops,
            grenadeProjectiles: grenadeUpdate.projectiles,
            grenadeExplosions,
            enemyDeathEffects,
            damageNumbers,
            powerUpChoices,
            warpPending,
            arenaBackgroundWave,
            waveCountdown,
            warpTransitionTimer,
            fireCooldown,
            dashCooldown: Math.max(0, player.dashCooldown - delta),
            pendingPlayerDamage: 0,
            playerDamageTimer: Math.max(0, previous.playerDamageTimer - delta),
            message:
              powerUpChoices.length > 0
                ? message
                : warpTransitionTimer > 0
                  ? `Warping to another location · ${Math.ceil(warpTransitionTimer)}`
                  : waveCountdown > 0
                    ? `Wave ${previous.wave} starts in ${Math.ceil(waveCountdown)}`
                    : `Wave ${previous.wave} started!`,
          };
        }

        const livingPlayers = [player, joinPlayer].filter(
          (candidate): candidate is PlayerState =>
            !!candidate && !candidate.isDead,
        );
        let message = previous.message;
        let bossPhase = previous.bossPhase;
        let bossPhaseTimer = previous.bossPhaseTimer;
        let bossConfigId = previous.bossConfigId;
        let bossAttackPhase = previous.bossAttackPhase;
        let bossAttackTimer = previous.bossAttackTimer;
        let bossTelegraphTarget = previous.bossTelegraphTarget;
        let bossDashDirection = previous.bossDashDirection;
        let bossDashHasHit = previous.bossDashHasHit;
        let bossHealth = previous.bossHealth;
        let bossHealthMax = previous.bossHealthMax;
        let bossName = previous.bossName;
        let bossAddSpawnTimer = previous.bossAddSpawnTimer;
        let bossAddWarningTimer = previous.bossAddWarningTimer;
        let bossAddSpawnSide = previous.bossAddSpawnSide;
        let bossEntrySide = previous.bossEntrySide;
        let bossAddEnemies: Enemy[] = [];
        let bossProjectiles: BossProjectile[] = previous.bossProjectiles
          .map((projectile) => ({
            ...projectile,
            life: projectile.life - delta,
          }))
          .filter((projectile) => projectile.life > 0);
        let bossAreaEffects = previous.bossAreaEffects
          .map((effect) => ({ ...effect, life: effect.life - delta }))
          .filter((effect) => effect.life > 0);
        let bossDamageHost = 0;
        let bossDamageJoin = 0;
        let bossDefeatedThisTick = false;

        if (bossPhase === "warning") {
          bossPhaseTimer = Math.max(0, bossPhaseTimer - delta);
          if (bossPhaseTimer === 0) {
            const config = getArenaBossForWave(previous.wave);
            bossConfigId = config.id;
            bossName = config.name;
            bossHealth =
              config.health +
              (Math.floor(previous.wave / WAVES_PER_ARENA) - 1) * 250;
            bossHealthMax = bossHealth;
            bossPhase = "entrance";
            bossPhaseTimer = BOSS_ENTRANCE_DURATION;
            bossAttackPhase = "cooldown";
            bossAttackTimer = 0;
            bossTelegraphTarget = null;
            bossDashDirection = null;
            bossDashHasHit = false;
          }
        } else if (bossPhase === "entrance") {
          bossPhaseTimer = Math.max(0, bossPhaseTimer - delta);
          if (bossPhaseTimer === 0) {
            bossPhase = "active";
            bossAttackPhase = "cooldown";
            bossAttackTimer = 2.5;
            bossAddSpawnTimer = BOSS_ADD_FIRST_WARNING_DELAY;
            bossAddWarningTimer = 0;
            bossAddSpawnSide = null;
            message = `${bossName} is ready to attack!`;
          }
        } else if (bossPhase === "active") {
          const config = BOSS_CONFIGS.find((boss) => boss.id === bossConfigId);
          const arenaBoss = previous.enemies.find(
            (enemy) => enemy.arenaBossId === bossConfigId,
          );
          if (config && arenaBoss && bossAttackPhase === "cooldown") {
            bossAttackTimer = Math.max(0, bossAttackTimer - delta);
            if (bossAttackTimer === 0) {
              const target = livingPlayers.reduce((closest, candidate) =>
                Math.hypot(
                  candidate.x - arenaBoss.x,
                  candidate.y - arenaBoss.y,
                ) < Math.hypot(closest.x - arenaBoss.x, closest.y - arenaBoss.y)
                  ? candidate
                  : closest,
              );
              bossTelegraphTarget = { x: target.x, y: target.y };
              if (config.pattern === "artillery") {
                const direction = normalize({
                  x: target.x - arenaBoss.x,
                  y: target.y - arenaBoss.y,
                });
                bossProjectiles.push({
                  id: Date.now() + Math.random(),
                  x: arenaBoss.x,
                  y: arenaBoss.y,
                  target: { x: target.x, y: target.y },
                  vx: direction.x,
                  vy: direction.y,
                  speed: 210,
                  radius: 15,
                  damage: config.projectileDamage,
                  life: 5,
                  color: config.color,
                });
              } else {
                bossDashDirection = normalize({
                  x: target.x - arenaBoss.x,
                  y: target.y - arenaBoss.y,
                });
              }
              bossAttackPhase = "telegraph";
              bossAttackTimer = BOSS_ATTACK_TELEGRAPH_DURATION;
            }
          } else if (config && bossAttackPhase === "telegraph") {
            bossAttackTimer = Math.max(0, bossAttackTimer - delta);
            if (bossAttackTimer === 0 && config.pattern === "artillery") {
              const target = bossTelegraphTarget;
              if (target) {
                bossAreaEffects.push({
                  id: Date.now() + Math.random(),
                  x: target.x,
                  y: target.y,
                  radius: BOSS_AREA_RADIUS,
                  life: 2,
                });
                for (const candidate of livingPlayers) {
                  if (
                    Math.hypot(
                      candidate.x - target.x,
                      candidate.y - target.y,
                    ) <=
                    BOSS_AREA_RADIUS + candidate.radius
                  ) {
                    const damage =
                      config.areaDamage *
                      (1 - getBuddyBonus(candidate.buddyId, "defense") / 100);
                    if (candidate.id === "host") bossDamageHost += damage;
                    else bossDamageJoin += damage;
                  }
                }
              }
              bossAttackPhase = "cooldown";
              bossAttackTimer = 1.65;
              bossTelegraphTarget = null;
            } else if (bossAttackTimer === 0 && config?.pattern === "charger") {
              bossAttackPhase = "dash";
              bossAttackTimer = BOSS_DASH_DURATION;
              bossDashHasHit = false;
            }
          } else if (config && bossAttackPhase === "dash") {
            bossAttackTimer = Math.max(0, bossAttackTimer - delta);
            if (bossAttackTimer === 0) {
              bossAttackPhase = "cooldown";
              bossAttackTimer = 3;
              bossDashDirection = null;
              bossTelegraphTarget = null;
              bossDashHasHit = false;
            }
          }
        }

        if (
          bossPhase === "active" &&
          previous.enemies.some((enemy) => enemy.arenaBossId === bossConfigId)
        ) {
          const warningSide = bossAddSpawnSide;
          if (warningSide !== null) {
            bossAddWarningTimer = Math.max(0, bossAddWarningTimer - delta);
            if (bossAddWarningTimer === 0) {
              bossAddEnemies = Array.from({ length: BOSS_ADD_COUNT }, () =>
                makeBossAddEnemy(warningSide, previous.wave),
              );
              bossAddSpawnSide = null;
              bossAddSpawnTimer = BOSS_ADD_FIRST_WARNING_DELAY;
              message = "Enemies are joining the boss fight!";
            }
          } else {
            bossAddSpawnTimer = Math.max(0, bossAddSpawnTimer - delta);
            if (bossAddSpawnTimer === 0) {
              const sides: ArenaSide[] = ["top", "right", "bottom", "left"];
              bossAddSpawnSide =
                sides[Math.floor(Math.random() * sides.length)];
              bossAddWarningTimer = BOSS_ADD_WARNING_DURATION;
            }
          }
        } else if (bossPhase !== "active") {
          bossAddSpawnTimer = 0;
          bossAddWarningTimer = 0;
          bossAddSpawnSide = null;
        } else {
          bossAddSpawnTimer = 0;
          bossAddWarningTimer = 0;
          bossAddSpawnSide = null;
        }

        let enemies = previous.enemies.map((enemy) => {
          const knockbackX = enemy.knockbackX ?? 0;
          const knockbackY = enemy.knockbackY ?? 0;
          const knockbackDecay = Math.exp(-8 * delta);
          const applyHitMotion = (
            nextEnemy: Enemy,
            constrainToArena = true,
          ): Enemy => {
            const x = nextEnemy.x + knockbackX * delta;
            const y = nextEnemy.y + knockbackY * delta;
            return {
              ...nextEnemy,
              x: constrainToArena
                ? clamp(x, enemy.radius, ARENA_WIDTH - enemy.radius)
                : x,
              y: constrainToArena
                ? clamp(y, enemy.radius, ARENA_HEIGHT - enemy.radius)
                : y,
              knockbackX: knockbackX * knockbackDecay,
              knockbackY: knockbackY * knockbackDecay,
              hitFlashTimer: Math.max(0, (enemy.hitFlashTimer ?? 0) - delta),
              bulletImpactTimer: Math.max(
                0,
                (enemy.bulletImpactTimer ?? 0) - delta,
              ),
            };
          };

          if (enemy.arenaBossId) {
            if (previous.bossPhase === "entrance") {
              const progress = clamp(
                1 - bossPhaseTimer / BOSS_ENTRANCE_DURATION,
                0,
                1,
              );
              const wiggle =
                Math.sin((BOSS_ENTRANCE_DURATION - bossPhaseTimer) * 22) *
                8 *
                (1 - progress);
              const entryStart = getBossEntryStart(
                previous.bossEntrySide,
                enemy.radius,
              );
              return applyHitMotion(
                {
                  ...enemy,
                  x:
                    entryStart.x +
                    (BOSS_ENTRY_REST.x - entryStart.x) * progress +
                    wiggle,
                  y:
                    entryStart.y +
                    (BOSS_ENTRY_REST.y - entryStart.y) * progress,
                },
                false,
              );
            }
            if (
              bossPhase === "active" &&
              bossAttackPhase === "dash" &&
              bossDashDirection
            ) {
              const nextX = clamp(
                enemy.x + bossDashDirection.x * BOSS_DASH_SPEED * delta,
                enemy.radius,
                ARENA_WIDTH - enemy.radius,
              );
              const nextY = clamp(
                enemy.y + bossDashDirection.y * BOSS_DASH_SPEED * delta,
                enemy.radius,
                ARENA_HEIGHT - enemy.radius,
              );
              const start = { x: enemy.x, y: enemy.y };
              const end = { x: nextX, y: nextY };
              if (!bossDashHasHit) {
                for (const candidate of livingPlayers) {
                  if (
                    distanceToSegment(candidate, start, end) <=
                    enemy.radius + candidate.radius
                  ) {
                    const config = BOSS_CONFIGS.find(
                      (boss) => boss.id === enemy.arenaBossId,
                    );
                    const damage =
                      (config?.dashDamage ?? 50) *
                      (1 - getBuddyBonus(candidate.buddyId, "defense") / 100);
                    if (candidate.id === "host") bossDamageHost += damage;
                    else bossDamageJoin += damage;
                    bossDashHasHit = true;
                    break;
                  }
                }
              }
              return applyHitMotion({ ...enemy, x: nextX, y: nextY });
            }
            const arenaBossConfig = BOSS_CONFIGS.find(
              (boss) => boss.id === enemy.arenaBossId,
            );
            if (
              bossPhase === "active" &&
              arenaBossConfig?.pattern === "artillery"
            ) {
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
                  repositionTimer = BOSS_REPOSITION_INTERVAL;
                } else {
                  const directionX = dx / distance;
                  const directionY = dy / distance;
                  const wiggle = Math.sin(timestamp * 0.018) * 11;
                  x += directionX * step - directionY * wiggle * delta;
                  y += directionY * step + directionX * wiggle * delta;
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
          const directionX = dx / distance;
          const directionY = dy / distance;
          const newX = enemy.x + directionX * enemy.speed * delta;
          const newY = enemy.y + directionY * enemy.speed * delta;
          return applyHitMotion({
            ...enemy,
            x: clamp(newX, enemy.radius, ARENA_WIDTH - enemy.radius),
            y: clamp(newY, enemy.radius, ARENA_HEIGHT - enemy.radius),
          });
        });

        enemies.push(...bossAddEnemies);

        if (previous.bossPhase === "warning" && bossPhase === "entrance") {
          const config = BOSS_CONFIGS.find((boss) => boss.id === bossConfigId);
          if (config) {
            enemies.push(
              makeArenaBoss(config, previous.wave, previous.bossEntrySide),
            );
          }
        }

        const projectileHitIds = new Set<number>();
        for (const projectile of bossProjectiles) {
          const remainingDistance = Math.hypot(
            projectile.target.x - projectile.x,
            projectile.target.y - projectile.y,
          );
          const travelDistance = projectile.speed * delta;
          const reachesTarget = remainingDistance <= travelDistance;
          const start = { x: projectile.x, y: projectile.y };
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
                projectile.damage *
                (1 - getBuddyBonus(candidate.buddyId, "defense") / 100);
              if (candidate.id === "host") bossDamageHost += damage;
              else bossDamageJoin += damage;
              projectileHitIds.add(projectile.id);
              break;
            }
          }
          if (projectileHitIds.has(projectile.id)) continue;
          projectile.x = end.x;
          projectile.y = end.y;
          if (
            reachesTarget ||
            projectile.x < -projectile.radius ||
            projectile.x > ARENA_WIDTH + projectile.radius ||
            projectile.y < -projectile.radius ||
            projectile.y > ARENA_HEIGHT + projectile.radius
          ) {
            projectileHitIds.add(projectile.id);
          }
        }
        bossProjectiles = bossProjectiles.filter(
          (projectile) => !projectileHitIds.has(projectile.id),
        );

        let bullets = previous.bullets
          .map((bullet) => ({
            ...bullet,
            x: bullet.x + bullet.vx * bullet.speed * delta,
            y: bullet.y + bullet.vy * bullet.speed * delta,
          }))
          .filter(
            (bullet) =>
              bullet.x > -20 &&
              bullet.x < ARENA_WIDTH + 20 &&
              bullet.y > -20 &&
              bullet.y < ARENA_HEIGHT + 20,
          );

        let fireCooldown = Math.max(0, player.fireCooldown - delta);
        if (
          isFireHeld &&
          selectedWeaponRef.current === "gun" &&
          previous.isRunning &&
          !previous.isPaused &&
          !player.isDead &&
          !hostIsReviving &&
          fireCooldown <= 0
        ) {
          const direction = normalize(aimRef.current);
          bullets = [
            ...bullets,
            {
              id: Date.now() + Math.random(),
              playerId: player.id,
              x: player.x + direction.x * (player.radius + 10),
              y: player.y + direction.y * (player.radius + 10),
              radius: 5,
              speed: BULLET_SPEED,
              damage: getEffectiveBulletDamage(player),
              isHighDamage: player.highDamageTimer > 0,
              vx: direction.x,
              vy: direction.y,
            },
          ];
          fireCooldown = getEffectiveFireCooldown(player);
        }
        if (
          joinPlayer &&
          !joinPlayer.isDead &&
          !joinIsReviving &&
          remoteInputRef.current.weapon === "gun" &&
          remoteInputRef.current.firing
        ) {
          joinPlayer.fireCooldown = Math.max(
            0,
            joinPlayer.fireCooldown - delta,
          );
          if (joinPlayer.fireCooldown <= 0) {
            const direction = normalize(remoteInputRef.current.aim);
            bullets = [
              ...bullets,
              {
                id: Date.now() + Math.random(),
                playerId: joinPlayer.id,
                x: joinPlayer.x + direction.x * (joinPlayer.radius + 10),
                y: joinPlayer.y + direction.y * (joinPlayer.radius + 10),
                radius: 5,
                speed: BULLET_SPEED,
                damage: getEffectiveBulletDamage(joinPlayer),
                isHighDamage: joinPlayer.highDamageTimer > 0,
                vx: direction.x,
                vy: direction.y,
              },
            ];
            joinPlayer.fireCooldown = getEffectiveFireCooldown(joinPlayer);
          }
        } else if (joinPlayer) {
          joinPlayer.fireCooldown = Math.max(
            0,
            joinPlayer.fireCooldown - delta,
          );
        }

        let score = previous.score;
        let spawnCooldown = previous.spawnCooldown - delta;
        let wave = previous.wave;
        let waveCountdown = previous.waveCountdown;
        let warpTransitionTimer = Math.max(
          0,
          previous.warpTransitionTimer - delta,
        );
        let powerUpChoices = previous.powerUpChoices;
        let warpPending = previous.warpPending;
        let enemiesToSpawn = previous.enemiesToSpawn;
        let bossSpawnedAtWave = previous.bossSpawnedAtWave;
        let damageNumbers = previous.damageNumbers
          .map((damageNumber) => ({
            ...damageNumber,
            life: damageNumber.life - delta,
          }))
          .filter((damageNumber) => damageNumber.life > 0);
        let orbBeams = previous.orbBeams
          .map((beam) => ({ ...beam, life: beam.life - delta }))
          .filter((beam) => beam.life > 0);
        let itemDrops = [...previous.itemDrops];
        let grenadeExplosions = previous.grenadeExplosions
          .map((explosion) => ({ ...explosion, life: explosion.life - delta }))
          .filter((explosion) => explosion.life > 0);
        let enemyDeathEffects = previous.enemyDeathEffects
          .map((effect) => ({ ...effect, life: effect.life - delta }))
          .filter((effect) => effect.life > 0);

        const bulletHitIds = new Set<number>();
        const survivingEnemies: Enemy[] = [];

        for (let enemy of enemies) {
          let enemyHit = false;
          let enemyAlive = true;

          for (const bullet of bullets) {
            if (bulletHitIds.has(bullet.id)) {
              continue;
            }

            const dx = bullet.x - enemy.x;
            const dy = bullet.y - enemy.y;
            const hitDistanceSquared = dx * dx + dy * dy;
            const radiusSum = bullet.radius + enemy.radius;

            if (hitDistanceSquared <= radiusSum * radiusSum) {
              enemy = applyEnemyHit(enemy, bullet, enemy.isBoss ? 40 : 260);
              enemy.health -= bullet.damage;
              enemy.bulletImpactTimer = BULLET_IMPACT_DURATION;
              bulletHitIds.add(bullet.id);
              enemyHit = true;
              damageNumbers.push({
                id: Date.now() + Math.random(),
                x: enemy.x,
                y: enemy.y - enemy.radius - 12,
                amount: bullet.damage,
                life: 0.75,
                target: "enemy",
              });

              if (enemy.health <= 0) {
                enemyAlive = false;
                score += getEnemyScoreReward(enemy);
                enemyDeathEffects.push(makeEnemyDeathEffect(enemy));
                if (enemy.arenaBossId) {
                  const config = BOSS_CONFIGS.find(
                    (boss) => boss.id === enemy.arenaBossId,
                  );
                  message = `${config?.name ?? "Boss"} defeated! +${getEnemyScoreReward(enemy)} points`;
                  bossDefeatedThisTick = true;
                } else {
                  message = enemy.isBoss ? "Boss defeated!" : "Plant down!";
                }
                itemDrops.push(...makeEnemyDrops(enemy, itemDrops));
              }
              break;
            }
          }

          if (enemyAlive && enemy.health > 0 && !enemyHit) {
            survivingEnemies.push(enemy);
          }

          if (enemyAlive && enemy.health > 0 && enemyHit) {
            survivingEnemies.push(enemy);
          }
        }

        bullets = bullets.filter((bullet) => !bulletHitIds.has(bullet.id));
        enemies = survivingEnemies;

        const grenadeUpdate = advanceGrenadeProjectiles(
          previous.grenadeProjectiles,
          enemies,
          delta,
        );
        enemies = grenadeUpdate.enemies;
        itemDrops.push(...grenadeUpdate.itemDrops);
        enemyDeathEffects.push(...grenadeUpdate.enemyDeathEffects);
        grenadeExplosions = [...grenadeExplosions, ...grenadeUpdate.explosions];
        damageNumbers.push(...grenadeUpdate.damageNumbers);
        score += grenadeUpdate.score;

        const hostOrbAttack = fireOrbAtNearestEnemy(
          player,
          enemies,
          damageNumbers,
          itemDrops,
        );
        player = hostOrbAttack.player;
        enemies = hostOrbAttack.enemies;
        score += hostOrbAttack.score;
        if (hostOrbAttack.message) message = hostOrbAttack.message;
        if (hostOrbAttack.beam) orbBeams.push(hostOrbAttack.beam);
        if (hostOrbAttack.deathEffect) {
          enemyDeathEffects.push(hostOrbAttack.deathEffect);
        }

        if (joinPlayer) {
          const guestOrbAttack = fireOrbAtNearestEnemy(
            joinPlayer,
            enemies,
            damageNumbers,
            itemDrops,
          );
          joinPlayer = guestOrbAttack.player;
          enemies = guestOrbAttack.enemies;
          score += guestOrbAttack.score;
          if (guestOrbAttack.message) message = guestOrbAttack.message;
          if (guestOrbAttack.beam) orbBeams.push(guestOrbAttack.beam);
          if (guestOrbAttack.deathEffect) {
            enemyDeathEffects.push(guestOrbAttack.deathEffect);
          }
        }

        const arenaBossDefeated =
          previous.enemies.some((enemy) => enemy.arenaBossId) &&
          !enemies.some((enemy) => enemy.arenaBossId);
        if (arenaBossDefeated) {
          bossDefeatedThisTick = true;
          const defeatedBossAdds = enemies.filter((enemy) => enemy.isBossAdd);
          enemyDeathEffects.push(...defeatedBossAdds.map(makeEnemyDeathEffect));
          enemies = enemies.filter((enemy) => !enemy.isBossAdd);
          bossAddSpawnTimer = 0;
          bossAddWarningTimer = 0;
          bossAddSpawnSide = null;
        }

        if (wave > 1 && wave % 3 === 0 && bossSpawnedAtWave !== wave) {
          const bossEnemy = makeEnemy(wave, Date.now() + Math.random());
          const bossBoost = bossEnemy.isBoss ? 1.5 : 1;
          bossEnemy.health *= bossBoost;
          bossEnemy.maxHealth *= bossBoost;
          bossEnemy.speed *= 1.2;
          enemies.push(bossEnemy);
          message = `Boss wave: ${bossEnemy.isBoss ? "Thorn Titan" : "Bloom Beast"}`;
          bossSpawnedAtWave = wave;
          bossHealth = bossEnemy.maxHealth;
          bossHealthMax = bossEnemy.maxHealth;
          bossName = bossEnemy.isBoss ? "Thorn Titan" : "Bloom Beast";
        }

        const currentBoss =
          enemies.find((enemy) => enemy.arenaBossId) ??
          enemies.find((enemy) => enemy.isBoss);
        if (currentBoss) {
          bossHealth = currentBoss.health;
          bossHealthMax = currentBoss.maxHealth;
          if (currentBoss.arenaBossId) {
            bossName =
              BOSS_CONFIGS.find((boss) => boss.id === currentBoss.arenaBossId)
                ?.name ?? bossName;
          }
        } else {
          bossHealth = 0;
          bossHealthMax = 0;
        }

        if (
          spawnCooldown <= 0 &&
          enemiesToSpawn > 0 &&
          enemies.length < MAX_ACTIVE_ENEMIES
        ) {
          const nextEnemy = makeEnemy(wave, Date.now() + Math.random());
          enemies.push(nextEnemy);
          enemiesToSpawn -= 1;
          spawnCooldown = Math.max(0.75, 1.4 - wave * 0.08);
        }

        let bossHit = false;
        const damageOnePlayer = (
          currentPlayer: PlayerState | null,
          hostPlayer: boolean,
          arenaBossDamage: number,
        ) => {
          if (!currentPlayer || currentPlayer.isDead) return currentPlayer;
          let damageTaken = arenaBossDamage;
          if (arenaBossDamage > 0) bossHit = true;
          for (const enemy of enemies) {
            const dx = currentPlayer.x - enemy.x;
            const dy = currentPlayer.y - enemy.y;
            const hitRange = currentPlayer.radius + enemy.radius + 4;
            if (dx * dx + dy * dy < hitRange * hitRange) {
              if (
                Math.random() * 100 >=
                getBuddyBonus(currentPlayer.buddyId, "dodgeChance")
              ) {
                if (enemy.arenaBossId) bossHit = true;
                damageTaken +=
                  enemy.damage *
                  (1 - getBuddyBonus(currentPlayer.buddyId, "defense") / 100) *
                  delta;
              }
            }
          }
          let health = clamp(
            currentPlayer.health - damageTaken,
            0,
            currentPlayer.maxHealth,
          );
          let pendingDamage = hostPlayer
            ? previous.pendingPlayerDamage + damageTaken
            : currentPlayer.pendingDamage + damageTaken;
          let damageTimer = Math.max(
            0,
            (hostPlayer
              ? previous.playerDamageTimer
              : currentPlayer.damageTimer) - delta,
          );
          let hitFlashTimer = currentPlayer.hitFlashTimer;
          let knockbackX = currentPlayer.knockbackX;
          let knockbackY = currentPlayer.knockbackY;
          if (damageTimer === 0 && pendingDamage >= 1) {
            damageNumbers.push({
              id: Date.now() + Math.random(),
              x: currentPlayer.x,
              y: currentPlayer.y - currentPlayer.radius - 16,
              amount: Math.max(1, Math.round(pendingDamage)),
              life: 0.8,
              target: "player",
              playerId: currentPlayer.id,
            });
            const nearestEnemy = enemies.reduce<Enemy | null>(
              (closest, enemy) =>
                !closest ||
                Math.hypot(
                  enemy.x - currentPlayer.x,
                  enemy.y - currentPlayer.y,
                ) <
                  Math.hypot(
                    closest.x - currentPlayer.x,
                    closest.y - currentPlayer.y,
                  )
                  ? enemy
                  : closest,
              null,
            );
            if (nearestEnemy) {
              const direction = normalize({
                x: currentPlayer.x - nearestEnemy.x,
                y: currentPlayer.y - nearestEnemy.y,
              });
              knockbackX += direction.x * 150;
              knockbackY += direction.y * 150;
            }
            hitFlashTimer = 0.32;
            pendingDamage = 0;
            damageTimer = 0.45;
          }
          const isDead = health <= 0;
          if (isDead) {
            health = 0;
            pendingDamage = 0;
            message = `${currentPlayer.name} is down!`;
          }
          return {
            ...currentPlayer,
            health,
            isDead,
            pendingDamage,
            damageTimer,
            hitFlashTimer,
            knockbackX,
            knockbackY,
          };
        };
        player = damageOnePlayer(player, true, bossDamageHost) ?? player;
        joinPlayer = damageOnePlayer(joinPlayer, false, bossDamageJoin);

        if (!player.isDead) {
          const pickup = advanceItemDrops(itemDrops, player, delta);
          player = pickup.player;
          itemDrops = pickup.drops;
          damageNumbers.push(...pickup.damageNumbers);
          if (pickup.rewardPopupTriggered) {
            powerUpChoices = createPowerUpChoices();
            warpPending = true;
            message = "Choose your chest reward";
          }
        }
        if (joinPlayer && !joinPlayer.isDead) {
          const pickup = advanceItemDrops(itemDrops, joinPlayer, delta);
          joinPlayer = pickup.player;
          itemDrops = pickup.drops;
          damageNumbers.push(...pickup.damageNumbers);
          if (pickup.rewardPopupTriggered) {
            powerUpChoices = createPowerUpChoices();
            warpPending = true;
            message = "Choose your chest reward";
          }
        }

        let reviveState = previous.reviveState;
        const requestedReviveTarget = (reviverId: PlayerState["id"]) =>
          reviverId === "host"
            ? reviveTarget
            : remoteInputRef.current.reviveTargetId;
        if (
          reviveState &&
          requestedReviveTarget(reviveState.reviverId) !== reviveState.targetId
        ) {
          reviveState = null;
        }
        if (!reviveState) {
          for (const reviverId of ["host", "join"] as const) {
            const targetId = requestedReviveTarget(reviverId);
            const reviver = reviverId === "host" ? player : joinPlayer;
            const target = targetId === "host" ? player : joinPlayer;
            if (
              targetId &&
              reviver &&
              target &&
              !reviver.isDead &&
              target.isDead &&
              Math.hypot(target.x - reviver.x, target.y - reviver.y) <=
                REVIVE_RANGE
            ) {
              reviveState = { reviverId, targetId, progress: 0 };
              break;
            }
          }
        }
        if (reviveState) {
          const reviver =
            reviveState.reviverId === "host" ? player : joinPlayer;
          const target = reviveState.targetId === "host" ? player : joinPlayer;
          if (
            !reviver ||
            !target ||
            reviver.isDead ||
            !target.isDead ||
            Math.hypot(target.x - reviver.x, target.y - reviver.y) >
              REVIVE_RANGE
          ) {
            reviveState = null;
          } else {
            const progress = reviveState.progress + delta;
            if (progress >= REVIVE_DURATION) {
              const revivedPlayer = {
                ...target,
                health: Math.min(
                  target.maxHealth,
                  Math.round(
                    REVIVE_HEALTH *
                      (1 +
                        getBuddyBonus(target.buddyId, "healingReceived") / 100),
                  ),
                ),
                isDead: false,
                pendingDamage: 0,
                damageTimer: 0.45,
              };
              if (reviveState.targetId === "host") {
                player = revivedPlayer;
              } else {
                joinPlayer = revivedPlayer;
              }
              reviveState = null;
              message = `${target.name} revived!`;
            } else {
              reviveState = { ...reviveState, progress };
            }
          }
        }
        const dashCooldown = Math.max(0, player.dashCooldown - delta);
        player = { ...player, dashCooldown, fireCooldown };
        if (joinPlayer) {
          joinPlayer = {
            ...joinPlayer,
            dashCooldown: Math.max(0, joinPlayer.dashCooldown - delta),
          };
        }
        const pendingPlayerDamage = player.pendingDamage;
        const playerDamageTimer = player.damageTimer;

        const advanceWaveAfterClear = () => {
          wave += 1;
          waveCountdown = getWaveCountdownDuration(wave);
          warpTransitionTimer = 0;
          powerUpChoices = [];
          warpPending = false;
          enemiesToSpawn = getWaveEnemyCount(wave);
          bullets = [];
          spawnCooldown = 0;
          bossHealth = 0;
          bossHealthMax = 0;
          bossPhase = "idle";
          bossPhaseTimer = 0;
          bossConfigId = null;
          bossAttackPhase = "cooldown";
          bossAttackTimer = 0;
          bossTelegraphTarget = null;
          bossDashDirection = null;
          bossDashHasHit = false;
          bossProjectiles = [];
          bossAreaEffects = [];
          bossAddSpawnTimer = 0;
          bossAddWarningTimer = 0;
          bossAddSpawnSide = null;
          message = `Wave ${wave - 1} cleared! Prepare for wave ${wave}`;
        };

        if (
          enemies.length === 0 &&
          enemiesToSpawn === 0 &&
          !previous.warpPending
        ) {
          const majorBossAlive = enemies.some((enemy) => enemy.arenaBossId);
          const majorBossWasDefeated =
            previous.bossPhase === "active" &&
            (!majorBossAlive || bossDefeatedThisTick);
          if (
            previous.wave % WAVES_PER_ARENA === 0 &&
            previous.bossPhase === "idle" &&
            bossSpawnedAtWave !== previous.wave
          ) {
            const config = getArenaBossForWave(previous.wave);
            bossPhase = "warning";
            bossEntrySide = (["top", "right", "bottom", "left"] as const)[
              Math.floor(Math.random() * 4)
            ];
            bossPhaseTimer = BOSS_WARNING_DURATION;
            bossConfigId = config.id;
            bossName = config.name;
            bossSpawnedAtWave = previous.wave;
            bossHealth = 0;
            bossHealthMax =
              config.health +
              (Math.floor(previous.wave / WAVES_PER_ARENA) - 1) * 250;
            bossAttackPhase = "cooldown";
            bossAttackTimer = 0;
            bossProjectiles = [];
            bossAreaEffects = [];
            bossAddSpawnTimer = 0;
            bossAddWarningTimer = 0;
            bossAddSpawnSide = null;
            message = `WARNING! ${config.name} is coming!`;
          } else if (
            majorBossWasDefeated &&
            previous.wave % WAVES_PER_ARENA === 0
          ) {
            waveCountdown = 0;
            warpPending = true;
            bossPhase = "idle";
            bossPhaseTimer = 0;
            bossConfigId = null;
            bossHealth = 0;
            bossHealthMax = 0;
            bossAttackPhase = "cooldown";
            bossAttackTimer = 0;
            bossTelegraphTarget = null;
            bossDashDirection = null;
            bossDashHasHit = false;
            bossProjectiles = [];
            bossAreaEffects = [];
            bossAddSpawnTimer = 0;
            bossAddWarningTimer = 0;
            bossAddSpawnSide = null;
            message = "Boss defeated! Collect the chest to warp";
          } else if (majorBossWasDefeated) {
            bossHealth = 0;
            bossHealthMax = 0;
            advanceWaveAfterClear();
          } else if (previous.bossPhase === "idle") {
            advanceWaveAfterClear();
          }
        }

        const nextState: GameState = {
          ...previous,
          grenadeAimPreview,
          player,
          joinPlayer,
          reviveState,
          enemies,
          bullets,
          orbBeams,
          itemDrops,
          grenades: player.grenades,
          heals: player.heals,
          grenadeProjectiles: grenadeUpdate.projectiles,
          grenadeExplosions,
          enemyDeathEffects,
          damageNumbers,
          pendingPlayerDamage,
          playerDamageTimer,
          score,
          wave,
          waveCountdown,
          warpTransitionTimer,
          powerUpChoices,
          warpPending,
          enemiesToSpawn,
          isRunning: !player.isDead || (!!joinPlayer && !joinPlayer.isDead),
          message:
            player.isDead && (!joinPlayer || joinPlayer.isDead)
              ? "The garden wins this round"
              : message,
          dashCooldown,
          fireCooldown,
          spawnCooldown,
          bossSpawnedAtWave,
          bossHealth,
          bossHealthMax,
          bossName,
          bossConfigId,
          bossPhase,
          bossPhaseTimer,
          bossAttackPhase,
          bossAttackTimer,
          bossTelegraphTarget,
          bossDashDirection,
          bossDashHasHit,
          bossProjectiles,
          bossAreaEffects,
          bossAddSpawnTimer,
          bossAddWarningTimer,
          bossAddSpawnSide,
          bossEntrySide,
          bossHitId: previous.bossHitId + (bossHit ? 1 : 0),
        };

        return nextState;
      });

      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [isFireHeld, isLocalMultiplayer, multiplayerRole, reviveTarget]);

  const updateJoystick = (x: number, y: number) => {
    const dx = x - 45;
    const dy = y - 45;
    const distance = Math.hypot(dx, dy);
    const maxRadius = 30;
    const limitedX = distance > maxRadius ? (dx / distance) * maxRadius : dx;
    const limitedY = distance > maxRadius ? (dy / distance) * maxRadius : dy;
    const nextVector = { x: limitedX / maxRadius, y: limitedY / maxRadius };

    movementRef.current = nextVector;
    const now = Date.now();
    if (now - lastJoystickVisualUpdateRef.current >= 1000 / 60) {
      lastJoystickVisualUpdateRef.current = now;
      setJoystick({ ...nextVector, active: true });
    }
  };

  const updateFireAim = useCallback((deltaX: number, deltaY: number) => {
    if (Math.hypot(deltaX, deltaY) > 2) {
      const direction = normalize({ x: deltaX, y: deltaY });
      aimRef.current = direction;
      setAimDirection(direction);
    }
  }, []);

  const isOverGrenadeCancel = useCallback(
    (x: number, y: number) => x >= width - 150 && y >= 48 && y <= 132,
    [width],
  );

  const updateFireAimGesture = useCallback(
    (event: {
      translationX: number;
      translationY: number;
      absoluteX: number;
      absoluteY: number;
    }) => {
      updateFireAim(event.translationX, event.translationY);
      if (
        selectedWeaponRef.current !== "grenade" ||
        !grenadeAimRef.current.active
      ) {
        return;
      }

      const dragDistance = Math.hypot(event.translationX, event.translationY);
      let aimedRange = grenadeAimRef.current.range;
      if (dragDistance > 2) {
        const dragDirection = normalize({
          x: event.translationX,
          y: event.translationY,
        });
        const origin = grenadeAimOriginRef.current;
        const horizontalDistance =
          dragDirection.x > 0
            ? (width - origin.x) / dragDirection.x
            : dragDirection.x < 0
              ? origin.x / -dragDirection.x
              : Number.POSITIVE_INFINITY;
        const verticalDistance =
          dragDirection.y > 0
            ? (height - origin.y) / dragDirection.y
            : dragDirection.y < 0
              ? origin.y / -dragDirection.y
              : Number.POSITIVE_INFINITY;
        const availableDragDistance = Math.max(
          1,
          Math.min(horizontalDistance, verticalDistance),
        );
        const rangeDragDistance = Math.min(
          availableDragDistance,
          GRENADE_RANGE_DRAG_DISTANCE,
        );
        const rangeProgress = clamp(dragDistance / rangeDragDistance, 0, 1);
        aimedRange =
          GRENADE_MIN_RANGE +
          (GRENADE_MAX_RANGE - GRENADE_MIN_RANGE) * rangeProgress;
      }
      const cancelTargeted = isOverGrenadeCancel(
        event.absoluteX,
        event.absoluteY,
      );
      grenadeAimRef.current = {
        ...grenadeAimRef.current,
        direction: aimRef.current,
        range: aimedRange,
        cancelTargeted,
      };
      setGrenadeAim({
        direction: aimRef.current,
        range: aimedRange,
        cancelTargeted,
      });
    },
    [height, isOverGrenadeCancel, updateFireAim, width],
  );

  const beginFireAim = useCallback(
    (event: { absoluteX: number; absoluteY: number }) => {
      if (selectedWeaponRef.current === "grenade") {
        setIsFireHeld(false);
        grenadeAimOriginRef.current = {
          x: event.absoluteX,
          y: event.absoluteY,
        };
        grenadeAimRef.current = {
          active: true,
          direction: aimRef.current,
          range: DEFAULT_GRENADE_RANGE,
          cancelTargeted: isOverGrenadeCancel(event.absoluteX, event.absoluteY),
        };
        setGrenadeAim({
          direction: aimRef.current,
          range: DEFAULT_GRENADE_RANGE,
          cancelTargeted: isOverGrenadeCancel(event.absoluteX, event.absoluteY),
        });
        return;
      }

      setIsFireHeld(true);
    },
    [isOverGrenadeCancel],
  );

  const finishFireAim = useCallback(
    (event: { absoluteX: number; absoluteY: number }) => {
      if (
        selectedWeaponRef.current === "grenade" &&
        grenadeAimRef.current.active
      ) {
        const finalAim = grenadeAimRef.current;
        grenadeAimRef.current = { ...finalAim, active: false };
        setGrenadeAim(null);
        if (
          !finalAim.cancelTargeted &&
          !isOverGrenadeCancel(event.absoluteX, event.absoluteY)
        ) {
          sendPlayerAction("grenade", finalAim.direction, finalAim.range);
          if (localPlayer.grenades <= 1) {
            selectWeapon("gun");
          }
        }
      }
      setIsFireHeld(false);
    },
    [isOverGrenadeCancel, localPlayer.grenades, selectWeapon, sendPlayerAction],
  );

  const endJoystickTouch = () => {
    movementRef.current = { x: 0, y: 0 };
    setJoystick({ x: 0, y: 0, active: false });
  };

  const joystickGesture = usePanGesture({
    runOnJS: true,
    onActivate: (event) => updateJoystick(event.x, event.y),
    onUpdate: (event) => updateJoystick(event.x, event.y),
    onFinalize: endJoystickTouch,
  });
  const waveReadyGesture = useTapGesture({
    runOnJS: true,
    simultaneousWith: joystickGesture,
    onActivate: () => {
      if (
        multiplayerRole !== "join" ||
        isLocalPlayerReviving ||
        localPlayer.isDead
      ) {
        return;
      }
      const nextValue = !multiplayerReadiness.join;
      multiplayerReadinessRef.current = {
        ...multiplayerReadinessRef.current,
        join: nextValue,
      };
      setMultiplayerReadiness((previous) => ({
        ...previous,
        join: nextValue,
      }));

      const socket = multiplayerSocketRef.current;
      if (socket && socket.readyState === MULTIPLAYER_SOCKET_OPEN) {
        socket.send(
          JSON.stringify({
            type: "ready",
            ready: nextValue,
          }),
        );
      }
    },
  });
  const waveSkipGesture = useTapGesture({
    runOnJS: true,
    simultaneousWith: joystickGesture,
    onActivate: () => {
      if (!isBossCountdownWave || isLocalPlayerReviving || localPlayer.isDead) {
        return;
      }
      if (!isLocalMultiplayer) {
        skipWaveCountdown();
        return;
      }
      if (multiplayerRole === "host" && canHostSkipWave) {
        skipWaveCountdown();
      }
    },
  });
  const pauseGesture = useTapGesture({
    runOnJS: true,
    simultaneousWith: joystickGesture,
    onActivate: togglePause,
  });
  const fireHoldGesture = usePanGesture({
    runOnJS: true,
    minDistance: 10,
    simultaneousWith: joystickGesture,
    onBegin: beginFireAim,
    onUpdate: updateFireAimGesture,
    onFinalize: finishFireAim,
  });
  const gunSelectGesture = useTapGesture({
    runOnJS: true,
    simultaneousWith: joystickGesture,
    onActivate: () => selectWeapon("gun"),
  });
  const grenadeSelectGesture = useTapGesture({
    runOnJS: true,
    simultaneousWith: joystickGesture,
    onActivate: () => selectWeapon("grenade"),
  });
  const healGesture = useTapGesture({
    runOnJS: true,
    simultaneousWith: joystickGesture,
    onActivate: triggerHeal,
  });
  const dashGesture = useTapGesture({
    runOnJS: true,
    simultaneousWith: joystickGesture,
    onActivate: triggerDash,
  });

  const arenaBossConfig = BOSS_CONFIGS.find(
    (boss) => boss.id === game.bossConfigId,
  );
  const arenaBoss = game.enemies.find(
    (enemy) => enemy.arenaBossId === game.bossConfigId,
  );
  const bossTelegraphDistance =
    arenaBoss && game.bossTelegraphTarget
      ? Math.hypot(
          game.bossTelegraphTarget.x - arenaBoss.x,
          game.bossTelegraphTarget.y - arenaBoss.y,
        )
      : 0;
  const bossTelegraphAngle =
    arenaBoss && game.bossTelegraphTarget
      ? Math.atan2(
          game.bossTelegraphTarget.y - arenaBoss.y,
          game.bossTelegraphTarget.x - arenaBoss.x,
        )
      : 0;

  if (isMultiplayerLobby && isLocalMultiplayer) {
    const isHost = multiplayerRole === "host";
    const displayedPlayers = lobbyPlayers.length
      ? lobbyPlayers
      : isHost
        ? [{ id: "local-host", name: playerName ?? "Host", role: "host" }]
        : [];

    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.container}>
          <Image
            source={arenaBackgrounds[0]}
            style={styles.arenaBackground}
            contentFit="cover"
            pointerEvents="none"
          />
          <View style={styles.lobbyScreen}>
            <Text style={styles.lobbyTitle}>Match Lobby</Text>
            {isHost ? (
              <View style={styles.lobbyHostAddress}>
                <Text style={styles.lobbySubtitle}>
                  Share this address with Player 2:
                </Text>
                {hostAddressesToShare.length > 0 ? (
                  hostAddressesToShare.map(({ address, interfaceName }) => (
                    <Text
                      key={address}
                      selectable
                      style={styles.lobbyAddressText}
                    >
                      {address}:8765 · {interfaceName}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.lobbyAddressText}>
                    No local IP found — check Wi-Fi or hotspot settings.
                  </Text>
                )}
                {hostAddressesToShare.length > 0 && (
                  <Text style={styles.lobbyAddressHint}>
                    Press and hold to copy; share the Wi-Fi or hotspot entry.
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.lobbySubtitle}>
                Connected to host. Waiting for the match to start.
              </Text>
            )}

            <View style={styles.lobbyPlayerList}>
              <Text style={styles.lobbySectionTitle}>
                PLAYERS · {displayedPlayers.length}/2
              </Text>
              {displayedPlayers.length === 0 ? (
                <Text style={styles.lobbyEmptyText}>
                  {isMultiplayerConnected
                    ? "Waiting for lobby details..."
                    : "Connecting to lobby..."}
                </Text>
              ) : (
                displayedPlayers.map((player) => {
                  const role = player.role === "host" ? "host" : "guest";
                  const isLocalProfile =
                    (multiplayerRole === "host" && role === "host") ||
                    (multiplayerRole === "join" && role === "guest");
                  const picture = isProfilePictureId(player.profilePicture)
                    ? player.profilePicture
                    : isLocalProfile
                      ? localProfilePicture
                      : DEFAULT_PROFILE_PICTURE;
                  const border = player.profileBorder
                    ? getProfileBorder(player.profileBorder).id
                    : isLocalProfile
                      ? localProfileBorder
                      : DEFAULT_PROFILE_BORDER;

                  return (
                    <View key={player.id} style={styles.lobbyPlayerRow}>
                      <View
                        style={[
                          styles.lobbyPlayerAvatar,
                          getProfileBorderStyle(border),
                        ]}
                      >
                        <Image
                          source={PROFILE_PICTURES[picture]}
                          style={styles.lobbyPlayerAvatarImage}
                          contentFit="cover"
                        />
                        <ProfileBorderOverlay borderId={border} />
                      </View>
                      <View style={styles.lobbyPlayerDetails}>
                        <Text style={styles.lobbyPlayerName}>
                          {player.name ?? "Player"}
                        </Text>
                        <Text style={styles.lobbyPlayerRole}>
                          {role === "host" ? "HOST" : "PLAYER"}
                        </Text>
                      </View>
                      <Text style={styles.lobbyPlayerStatus}>CONNECTED</Text>
                    </View>
                  );
                })
              )}
            </View>

            {isHost ? (
              <Pressable
                accessibilityRole="button"
                disabled={!isMultiplayerConnected}
                onPress={startMultiplayerGame}
                style={({ pressed }) => [
                  styles.lobbyStartButton,
                  !isMultiplayerConnected && styles.lobbyStartButtonDisabled,
                  pressed &&
                    isMultiplayerConnected &&
                    styles.lobbyStartButtonPressed,
                ]}
              >
                <Text style={styles.lobbyStartButtonText}>
                  {isMultiplayerConnected ? "START GAME" : "CONNECTING..."}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.lobbyWaitingText}>
                The host will start the game when everyone is ready.
              </Text>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <View style={styles.container}>
        <Image
          source={getArenaBackground(game.arenaBackgroundWave)}
          style={styles.arenaBackground}
          contentFit="cover"
          pointerEvents="none"
        />
        <View style={styles.arenaStage}>
          <View style={[styles.arena, { transform: [{ scale: arenaScale }] }]}>
            {game.bossPhase === "warning" && game.isRunning && (
              <View
                pointerEvents="none"
                accessibilityLiveRegion="assertive"
                accessibilityLabel={`${game.bossName} is coming in ${Math.ceil(game.bossPhaseTimer)} seconds`}
                style={styles.bossWarningOverlay}
              >
                <Animated.View
                  style={[
                    styles.bossEntryMarker,
                    game.bossEntrySide === "top"
                      ? styles.bossEntryMarkerTop
                      : game.bossEntrySide === "right"
                        ? styles.bossEntryMarkerRight
                        : game.bossEntrySide === "bottom"
                          ? styles.bossEntryMarkerBottom
                          : styles.bossEntryMarkerLeft,
                    { opacity: bossEntryMarkerOpacity },
                  ]}
                >
                  <Text style={styles.bossEntryMarkerText}>!</Text>
                </Animated.View>
                <Text style={styles.bossWarningEyebrow}>
                  WAVE {game.wave} CLEARED
                </Text>
                <Text style={styles.bossWarningTitle}>BOSS INCOMING!</Text>
                <Text style={styles.bossWarningName}>{game.bossName}</Text>
                <Text style={styles.bossWarningCountdown}>
                  {Math.ceil(game.bossPhaseTimer)}
                </Text>
                <Text style={styles.bossWarningHint}>GET READY TO FIGHT</Text>
              </View>
            )}

            {game.bossPhase === "active" &&
              game.bossAddSpawnSide &&
              game.bossAddWarningTimer > 0 && (
                <Animated.View
                  pointerEvents="none"
                  accessibilityLiveRegion="assertive"
                  accessibilityLabel={`10 enemies incoming from the ${game.bossAddSpawnSide}`}
                  style={[
                    styles.bossAddsWarning,
                    game.bossAddSpawnSide === "top"
                      ? styles.bossAddsWarningTop
                      : game.bossAddSpawnSide === "right"
                        ? styles.bossAddsWarningRight
                        : game.bossAddSpawnSide === "bottom"
                          ? styles.bossAddsWarningBottom
                          : styles.bossAddsWarningLeft,
                    { opacity: bossAddWarningOpacity },
                  ]}
                >
                  <Text style={styles.bossAddsWarningMark}>!</Text>
                  <Text style={styles.bossAddsWarningLabel}>
                    MORE ENEMIES INCOMING
                  </Text>
                </Animated.View>
              )}

            {game.bossPhase === "active" &&
              game.bossAttackPhase === "telegraph" &&
              game.bossTelegraphTarget && (
                <View pointerEvents="none" style={styles.bossTelegraphLayer}>
                  {arenaBossConfig?.pattern === "artillery" ? (
                    <View
                      style={[
                        styles.bossAreaTelegraph,
                        {
                          left: game.bossTelegraphTarget.x - BOSS_AREA_RADIUS,
                          top: game.bossTelegraphTarget.y - BOSS_AREA_RADIUS,
                        },
                      ]}
                    />
                  ) : arenaBoss ? (
                    <>
                      <View
                        style={[
                          styles.bossDashTelegraph,
                          {
                            left:
                              (arenaBoss.x + game.bossTelegraphTarget.x) / 2 -
                              bossTelegraphDistance / 2,
                            top:
                              (arenaBoss.y + game.bossTelegraphTarget.y) / 2 -
                              22,
                            width: bossTelegraphDistance,
                            transform: [{ rotate: `${bossTelegraphAngle}rad` }],
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.bossAreaTelegraph,
                          {
                            left:
                              game.bossTelegraphTarget.x - BOSS_AREA_RADIUS / 2,
                            top:
                              game.bossTelegraphTarget.y - BOSS_AREA_RADIUS / 2,
                            width: BOSS_AREA_RADIUS,
                            height: BOSS_AREA_RADIUS,
                            borderRadius: BOSS_AREA_RADIUS / 2,
                          },
                        ]}
                      />
                    </>
                  ) : null}
                  <Text
                    style={[
                      styles.bossTelegraphLabel,
                      {
                        left: clamp(
                          game.bossTelegraphTarget.x - 56,
                          4,
                          ARENA_WIDTH - 116,
                        ),
                        top: clamp(
                          game.bossTelegraphTarget.y - BOSS_AREA_RADIUS - 22,
                          4,
                          ARENA_HEIGHT - 24,
                        ),
                      },
                    ]}
                  >
                    MOVE!
                  </Text>
                </View>
              )}

            {game.bossAreaEffects.map((effect) => (
              <View
                key={effect.id}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              >
                <Image
                  source={smokeImage}
                  style={[
                    styles.bossAreaImpactImage,
                    {
                      left: effect.x - effect.radius,
                      top: effect.y - effect.radius,
                      width: effect.radius * 2,
                      height: effect.radius * 2,
                      opacity: Math.min(1, effect.life / 2),
                    },
                  ]}
                  contentFit="contain"
                />
              </View>
            ))}

            {game.bossProjectiles.map((projectile) => {
              const projectileAngle =
                Math.atan2(projectile.vy, projectile.vx) + Math.PI / 2;

              return (
                <Image
                  key={projectile.id}
                  pointerEvents="none"
                  source={fireballImage}
                  style={[
                    styles.bossProjectileImage,
                    {
                      left: projectile.x - projectile.radius,
                      top: projectile.y - projectile.radius,
                      width: projectile.radius * 2,
                      height: projectile.radius * 2,
                      opacity: clamp(
                        Math.hypot(
                          projectile.target.x - projectile.x,
                          projectile.target.y - projectile.y,
                        ) / 56,
                        0,
                        1,
                      ),
                      transform: [
                        { rotate: `${projectileAngle}rad` },
                        { scaleY: -1 },
                      ],
                    },
                  ]}
                  contentFit="contain"
                />
              );
            })}

            {game.waveCountdown > 0 &&
              game.warpTransitionTimer <= 0 &&
              game.isRunning && (
                <View
                  pointerEvents="box-none"
                  style={styles.waveCountdownGroup}
                >
                  <Text
                    pointerEvents="none"
                    style={styles.waveCountdownOverlay}
                  >
                    WAVE {game.wave} · STARTS IN {Math.ceil(game.waveCountdown)}
                  </Text>

                  <Text
                    pointerEvents="none"
                    style={styles.wavePreparationLabel}
                  >
                    PREPARATION
                  </Text>

                  {isBossCountdownWave &&
                    isLocalMultiplayer &&
                    multiplayerRole === "join" && (
                      <GestureDetector gesture={waveReadyGesture}>
                        <View
                          accessible
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled:
                              isLocalPlayerReviving || localPlayer.isDead,
                          }}
                          accessibilityLabel={
                            multiplayerReadiness.join
                              ? "Cancel ready status"
                              : "Mark ready for next wave"
                          }
                          pointerEvents="auto"
                          style={[
                            styles.waveCountdownReadyButton,
                            (isLocalPlayerReviving || localPlayer.isDead) &&
                              styles.waveCountdownReadyButtonDisabled,
                          ]}
                        >
                          <Text
                            pointerEvents="none"
                            style={styles.waveCountdownReadyText}
                          >
                            {multiplayerReadiness.join ? "READY!" : "READY"}
                          </Text>
                        </View>
                      </GestureDetector>
                    )}
                  {isBossCountdownWave &&
                    (!isLocalMultiplayer || multiplayerRole === "host") && (
                      <GestureDetector gesture={waveSkipGesture}>
                        <View
                          accessible
                          accessibilityRole="button"
                          accessibilityState={{
                            disabled:
                              isLocalPlayerReviving ||
                              localPlayer.isDead ||
                              (isLocalMultiplayer && !canHostSkipWave),
                          }}
                          accessibilityLabel={
                            isLocalMultiplayer && !canHostSkipWave
                              ? "Waiting for player to get ready"
                              : "Skip boss countdown and start wave"
                          }
                          style={[
                            styles.waveCountdownSkipButton,
                            (isLocalPlayerReviving ||
                              localPlayer.isDead ||
                              (isLocalMultiplayer && !canHostSkipWave)) &&
                              styles.waveCountdownSkipButtonDisabled,
                          ]}
                        >
                          <Text style={styles.waveCountdownSkipText}>
                            {isLocalMultiplayer && !canHostSkipWave
                              ? "WAITING FOR READY"
                              : "START BOSS"}
                          </Text>
                        </View>
                      </GestureDetector>
                    )}
                </View>
              )}

            {grenadePreview && grenadePreviewPlayer && grenadeLanding && (
              <View pointerEvents="none">
                {Array.from({ length: 10 }, (_, index) => {
                  const step = (index + 0.5) / 10;
                  const x =
                    grenadePreviewPlayer.x +
                    grenadePreview.direction.x * grenadePreview.range * step;
                  const y =
                    grenadePreviewPlayer.y +
                    grenadePreview.direction.y * grenadePreview.range * step;
                  return (
                    <View
                      key={`grenade-aim-${index}`}
                      style={[
                        styles.grenadeAimDash,
                        {
                          left: x - 5,
                          top: y - 2,
                          transform: [
                            {
                              rotate: `${Math.atan2(grenadePreview.direction.y, grenadePreview.direction.x)}rad`,
                            },
                          ],
                          backgroundColor: grenadePreview.cancelTargeted
                            ? "#ef4444"
                            : "#1e3a8a",
                        },
                      ]}
                    />
                  );
                })}
                <View
                  style={[
                    styles.grenadeAimBlastArea,
                    {
                      left: grenadeLanding.x - GRENADE_BLAST_RADIUS,
                      top: grenadeLanding.y - GRENADE_BLAST_RADIUS,
                      backgroundColor: grenadePreview.cancelTargeted
                        ? "rgba(239, 68, 68, 0.12)"
                        : "rgba(30, 58, 138, 0.2)",
                    },
                  ]}
                />
                {Array.from({ length: 18 }, (_, index) => {
                  const angle = (index / 18) * Math.PI * 2;
                  const x =
                    grenadeLanding.x + Math.cos(angle) * GRENADE_BLAST_RADIUS;
                  const y =
                    grenadeLanding.y + Math.sin(angle) * GRENADE_BLAST_RADIUS;
                  return (
                    <View
                      key={`grenade-area-${index}`}
                      style={[
                        styles.grenadeAimAreaDash,
                        {
                          left: x - 5,
                          top: y - 1.5,
                          transform: [{ rotate: `${angle + Math.PI / 2}rad` }],
                          backgroundColor: grenadePreview.cancelTargeted
                            ? "#ef4444"
                            : "#1e3a8a",
                        },
                      ]}
                    />
                  );
                })}
              </View>
            )}

            {game.bullets.map((bullet) => (
              <Image
                key={bullet.id}
                pointerEvents="none"
                source={
                  bullet.isHighDamage
                    ? highDamageBulletImage
                    : bulletProjectileImage
                }
                contentFit="contain"
                style={[
                  styles.bullet,
                  {
                    left: bullet.x - 12,
                    top: bullet.y - 9,
                    transform: [
                      { rotate: `${Math.atan2(bullet.vy, bullet.vx)}rad` },
                    ],
                  },
                ]}
              />
            ))}

            {game.grenadeExplosions.map((explosion) => (
              <View
                key={explosion.id}
                pointerEvents="none"
                style={[
                  styles.grenadeExplosion,
                  {
                    left: explosion.x - explosion.radius,
                    top: explosion.y - explosion.radius,
                    width: explosion.radius * 2,
                    height: explosion.radius * 2,
                    opacity: explosion.life / 0.3,
                  },
                ]}
              />
            ))}

            {game.grenadeProjectiles.map((projectile) => (
              <Image
                key={projectile.id}
                pointerEvents="none"
                source={bombImage}
                contentFit="contain"
                style={[
                  styles.grenadeProjectile,
                  {
                    left: projectile.x - 12,
                    top: projectile.y - 12,
                    transform: [{ rotate: `${projectile.elapsed * 2}rad` }],
                  },
                ]}
              />
            ))}

            {game.enemies.map((enemy) => {
              const bossConfig = enemy.arenaBossId
                ? BOSS_CONFIGS.find((boss) => boss.id === enemy.arenaBossId)
                : undefined;
              const isArenaBoss = !!bossConfig;
              const entranceElapsed =
                BOSS_ENTRANCE_DURATION - game.bossPhaseTimer;
              const entranceRotation =
                game.bossPhase === "entrance" && isArenaBoss
                  ? Math.sin(entranceElapsed * 22) * 0.1
                  : 0;
              const targets = [game.player, game.joinPlayer].filter(
                (candidate): candidate is PlayerState => !!candidate,
              );
              const target = targets.reduce<PlayerState | null>(
                (closest, candidate) => {
                  if (!closest) return candidate;
                  return Math.hypot(
                    candidate.x - enemy.x,
                    candidate.y - enemy.y,
                  ) < Math.hypot(closest.x - enemy.x, closest.y - enemy.y)
                    ? candidate
                    : closest;
                },
                null,
              );
              const enemyFacing = getEnemyFacing(enemy, target);
              const isElite = enemy.isBoss && !isArenaBoss;
              const healthBarWidth = isArenaBoss ? 116 : 44;
              const healthBarHeight = isArenaBoss ? 12 : 10;
              const healthBarLeft = clamp(
                enemy.x - healthBarWidth / 2,
                2,
                ARENA_WIDTH - healthBarWidth - 2,
              );
              const healthBarTop = clamp(
                enemy.y - enemy.radius - healthBarHeight - 8,
                2,
                ARENA_HEIGHT - healthBarHeight - 2,
              );
              const isHitFlashOn =
                (enemy.hitFlashTimer ?? 0) > 0 &&
                Math.floor((enemy.hitFlashTimer ?? 0) * 24) % 2 === 0;

              return (
                <View key={enemy.id}>
                  {!isArenaBoss && enemy.level !== undefined && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.enemyLevelBadge,
                        {
                          left: Math.max(0, healthBarLeft - 11),
                          top: healthBarTop + (healthBarHeight - 15) / 2,
                        },
                      ]}
                    >
                      <Text style={styles.enemyLevelText}>{enemy.level}</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.enemyHealthBarOuter,
                      isArenaBoss && styles.arenaBossHealthBar,
                      isElite && styles.eliteEnemyHealthBar,
                      {
                        left: healthBarLeft,
                        top: healthBarTop,
                        width: healthBarWidth,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.enemyHealthBarInner,
                        isArenaBoss && styles.arenaBossHealthFill,
                        isElite && styles.eliteEnemyHealthFill,
                        {
                          width: `${Math.max(
                            0,
                            (enemy.health / enemy.maxHealth) * 100,
                          )}%`,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.enemyHealthText,
                        isArenaBoss && styles.arenaBossHealthText,
                      ]}
                    >
                      {isArenaBoss
                        ? `${bossConfig.name} · ${Math.ceil(enemy.health).toLocaleString()}`
                        : Math.ceil(enemy.health)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.enemy,
                      isArenaBoss && styles.arenaBossEnemy,
                      {
                        left: enemy.x - enemy.radius,
                        top: enemy.y - enemy.radius,
                        width: enemy.radius * 2,
                        height: enemy.radius * 2,
                        opacity: enemy.isBoss ? 1 : 0.88,
                        transform: [{ rotate: `${entranceRotation}rad` }],
                      },
                    ]}
                  >
                    <Image
                      pointerEvents="none"
                      source={getEnemySpriteSource(enemy)}
                      style={[
                        styles.enemySprite,
                        isHitFlashOn && styles.enemyHitFlash,
                        {
                          transform: [{ scaleX: enemyFacing }],
                        },
                      ]}
                      contentFit="contain"
                      accessibilityLabel={
                        isArenaBoss
                          ? "Big boss enemy"
                          : enemy.isBoss
                            ? "Elite enemy"
                            : "Enemy"
                      }
                    />
                    {(enemy.bulletImpactTimer ?? 0) > 0 && (
                      <Image
                        pointerEvents="none"
                        source={bulletImpactImage}
                        contentFit="contain"
                        style={[
                          styles.enemyImpact,
                          {
                            opacity: clamp(
                              (enemy.bulletImpactTimer ?? 0) /
                                BULLET_IMPACT_DURATION,
                              0,
                              1,
                            ),
                          },
                        ]}
                      />
                    )}
                  </View>
                </View>
              );
            })}

            {game.enemyDeathEffects.map((effect) => (
              <Image
                key={effect.id}
                pointerEvents="none"
                source={getRemoteAssetSource(effect.imageAsset)}
                contentFit="contain"
                style={[
                  styles.enemyDeathSprite,
                  {
                    left: effect.x - effect.radius,
                    top: effect.y - effect.radius,
                    width: effect.radius * 2,
                    height: effect.radius * 2,
                    opacity: effect.life / ENEMY_DEATH_FADE_DURATION,
                  },
                ]}
              />
            ))}

            {game.itemDrops.map((drop) => {
              const dropItemConfig = dropConfig[drop.kind];
              const dropAge = Math.max(
                0,
                dropItemConfig.stayDurationSeconds +
                  dropItemConfig.flickerDurationSeconds -
                  drop.life,
              );
              const bounceOffset =
                Math.sin(dropAge * 12) * Math.exp(-dropAge * 5) * 10;
              const isFlickering =
                drop.life <= dropItemConfig.flickerDurationSeconds;
              const flickerInterval = Math.max(
                dropItemConfig.flickerIntervalSeconds,
                0.01,
              );
              const isVisible =
                !isFlickering ||
                Math.floor(
                  (dropItemConfig.flickerDurationSeconds - drop.life) /
                    flickerInterval,
                ) %
                  2 ===
                  0;

              if (!isVisible) {
                return null;
              }

              const isBuffDrop =
                drop.kind === "boots" ||
                drop.kind === "rapidFire" ||
                drop.kind === "highDamage";
              const dropBorderStyle =
                drop.kind === "heart"
                  ? null
                  : isBuffDrop
                    ? styles.buffDropBorder
                    : styles.consumableDropBorder;

              return (
                <View
                  key={drop.id}
                  pointerEvents="none"
                  accessibilityLabel={`${drop.kind} pickup`}
                  style={[
                    styles.consumableDrop,
                    dropBorderStyle,
                    {
                      left: drop.x - dropItemConfig.iconSize / 2,
                      top: drop.y - dropItemConfig.iconSize / 2,
                      width: dropItemConfig.iconSize,
                      height: dropItemConfig.iconSize,
                      transform: [{ translateY: -bounceOffset }],
                    },
                  ]}
                >
                  {drop.kind === "grenade" ? (
                    <Image
                      source={bombImage}
                      contentFit="contain"
                      style={styles.consumableDropImage}
                    />
                  ) : drop.kind === "chest" ? (
                    <Image
                      source={chestImage}
                      contentFit="contain"
                      style={styles.consumableDropImage}
                    />
                  ) : drop.kind === "rapidFire" ? (
                    <Image
                      source={rapidFireIcon}
                      contentFit="contain"
                      style={styles.consumableDropImage}
                    />
                  ) : drop.kind === "highDamage" ? (
                    <Image
                      source={highDamageIcon}
                      contentFit="contain"
                      style={styles.consumableDropImage}
                    />
                  ) : drop.kind === "medkit" ? (
                    <Image
                      source={medkitIcon}
                      contentFit="contain"
                      style={styles.consumableDropImage}
                    />
                  ) : drop.kind === "boots" ? (
                    <Image
                      source={bootsFastImage}
                      contentFit="contain"
                      style={styles.consumableDropImage}
                    />
                  ) : (
                    <Image
                      source={heartImage}
                      contentFit="contain"
                      style={styles.consumableDropImage}
                    />
                  )}
                </View>
              );
            })}

            {game.orbBeams.map((beam) => {
              const distance = Math.hypot(
                beam.endX - beam.startX,
                beam.endY - beam.startY,
              );
              const angle = Math.atan2(
                beam.endY - beam.startY,
                beam.endX - beam.startX,
              );
              return (
                <Image
                  key={beam.id}
                  pointerEvents="none"
                  source={getOrbSkin(beam.orbSkinId).laserImage}
                  contentFit="fill"
                  style={[
                    styles.orbLaser,
                    {
                      left: (beam.startX + beam.endX) / 2 - distance / 2,
                      top: (beam.startY + beam.endY) / 2 - 7,
                      width: distance,
                      opacity: beam.life / ORB_BEAM_DURATION,
                      transform: [{ rotate: `${angle}rad` }],
                    },
                  ]}
                />
              );
            })}

            {game.player.orbEquipped && !game.player.isDead && (
              <Image
                pointerEvents="none"
                source={getOrbSkin(game.player.orbSkinId).orbImage}
                contentFit="contain"
                style={[
                  styles.orbCompanion,
                  {
                    left:
                      getOrbPosition(game.player, ghostAnimationTime).x - 10,
                    top: getOrbPosition(game.player, ghostAnimationTime).y - 10,
                  },
                ]}
              />
            )}

            {game.player.buddyId && !game.player.isDead && (
              <Image
                pointerEvents="none"
                source={getBuddy(game.player.buddyId)?.source}
                contentFit="contain"
                style={[
                  styles.buddyCompanion,
                  {
                    left:
                      getBuddyPosition(game.player, ghostAnimationTime).x - 12,
                    top:
                      getBuddyPosition(game.player, ghostAnimationTime).y - 12,
                    transform: [
                      {
                        translateY: Math.sin(ghostAnimationTime * 8) * 1.5,
                      },
                    ],
                  },
                ]}
              />
            )}

            <View
              style={[
                styles.player,
                {
                  left: game.player.x - game.player.radius * 1.3,
                  top: game.player.y - game.player.radius * 1.3,
                  width: game.player.radius * 2.6,
                  height: game.player.radius * 2.6,
                  shadowColor: game.player.skinColor,
                  opacity: game.player.isDead ? 0.45 : 1,
                },
              ]}
            >
              {isLocalMultiplayer && (
                <PlayerBuffIndicators player={game.player} />
              )}
              <Image
                source={getSkinImage(game.player.hero, game.player.skinId)}
                style={[
                  styles.playerImage,
                  game.player.hitFlashTimer > 0 &&
                    Math.floor(game.player.hitFlashTimer * 24) % 2 === 0 &&
                    styles.playerHitFlash,
                  {
                    transform: [
                      { scaleX: game.player.visualFacing > 0 ? -1 : 1 },
                    ],
                  },
                ]}
                contentFit="contain"
              />
              <View
                pointerEvents="none"
                style={[
                  styles.playerAimArrow,
                  {
                    left:
                      game.player.radius * 1.3 +
                      hostAimDirection.x * game.player.radius * 1.35 -
                      5,
                    top:
                      game.player.radius * 1.3 +
                      hostAimDirection.y * game.player.radius * 1.35 -
                      6,
                    transform: [
                      {
                        rotate: `${Math.atan2(hostAimDirection.y, hostAimDirection.x)}rad`,
                      },
                    ],
                  },
                ]}
              />
            </View>

            {game.player.isDead && (
              <Image
                pointerEvents="none"
                source={ghostImage}
                contentFit="contain"
                style={[
                  styles.playerGhost,
                  {
                    left: game.player.x - GHOST_SIZE / 2,
                    top: game.player.y - game.player.radius - GHOST_SIZE + 2,
                    transform: [
                      {
                        translateX: Math.sin(ghostAnimationTime * 2.4) * 12,
                      },
                      {
                        translateY: Math.sin(ghostAnimationTime * 4.2) * 3,
                      },
                      {
                        scaleX:
                          Math.cos(ghostAnimationTime * 2.4) >= 0 ? -1 : 1,
                      },
                    ],
                  },
                ]}
              />
            )}
            {game.player.isDead && (
              <Text
                style={[
                  styles.playerDownLabel,
                  { left: game.player.x - 24, top: game.player.y + 20 },
                ]}
              >
                DOWN
              </Text>
            )}

            {game.joinPlayer && (
              <>
                {game.joinPlayer.orbEquipped && !game.joinPlayer.isDead && (
                  <Image
                    pointerEvents="none"
                    source={getOrbSkin(game.joinPlayer.orbSkinId).orbImage}
                    contentFit="contain"
                    style={[
                      styles.orbCompanion,
                      {
                        left:
                          getOrbPosition(game.joinPlayer, ghostAnimationTime)
                            .x - 10,
                        top:
                          getOrbPosition(game.joinPlayer, ghostAnimationTime)
                            .y - 10,
                      },
                    ]}
                  />
                )}
                {game.joinPlayer.buddyId && !game.joinPlayer.isDead && (
                  <Image
                    pointerEvents="none"
                    source={getBuddy(game.joinPlayer.buddyId)?.source}
                    contentFit="contain"
                    style={[
                      styles.buddyCompanion,
                      {
                        left:
                          getBuddyPosition(game.joinPlayer, ghostAnimationTime)
                            .x - 12,
                        top:
                          getBuddyPosition(game.joinPlayer, ghostAnimationTime)
                            .y - 12,
                        transform: [
                          {
                            translateY:
                              Math.sin(ghostAnimationTime * 8 + 1) * 1.5,
                          },
                        ],
                      },
                    ]}
                  />
                )}
                <View
                  style={[
                    styles.player,
                    {
                      left: game.joinPlayer.x - game.joinPlayer.radius * 1.3,
                      top: game.joinPlayer.y - game.joinPlayer.radius * 1.3,
                      width: game.joinPlayer.radius * 2.6,
                      height: game.joinPlayer.radius * 2.6,
                      shadowColor: game.joinPlayer.skinColor,
                      opacity: game.joinPlayer.isDead ? 0.45 : 1,
                    },
                  ]}
                >
                  {isLocalMultiplayer && (
                    <PlayerBuffIndicators player={game.joinPlayer} />
                  )}
                  <Image
                    source={getSkinImage(
                      game.joinPlayer.hero,
                      game.joinPlayer.skinId,
                    )}
                    style={[
                      styles.playerImage,
                      game.joinPlayer.hitFlashTimer > 0 &&
                        Math.floor(game.joinPlayer.hitFlashTimer * 24) % 2 ===
                          0 &&
                        styles.playerHitFlash,
                      {
                        transform: [
                          {
                            scaleX: game.joinPlayer.visualFacing > 0 ? -1 : 1,
                          },
                        ],
                      },
                    ]}
                    contentFit="contain"
                  />
                  <View
                    pointerEvents="none"
                    style={[
                      styles.playerAimArrow,
                      {
                        left:
                          game.joinPlayer.radius * 1.3 +
                          joinAimDirection.x * game.joinPlayer.radius * 1.35 -
                          5,
                        top:
                          game.joinPlayer.radius * 1.3 +
                          joinAimDirection.y * game.joinPlayer.radius * 1.35 -
                          6,
                        transform: [
                          {
                            rotate: `${Math.atan2(joinAimDirection.y, joinAimDirection.x)}rad`,
                          },
                        ],
                      },
                    ]}
                  />
                </View>
              </>
            )}
            {game.joinPlayer?.isDead && (
              <Image
                pointerEvents="none"
                source={ghostImage}
                contentFit="contain"
                style={[
                  styles.playerGhost,
                  {
                    left: game.joinPlayer.x - GHOST_SIZE / 2,
                    top:
                      game.joinPlayer.y -
                      game.joinPlayer.radius -
                      GHOST_SIZE +
                      2,
                    transform: [
                      {
                        translateX:
                          Math.sin(ghostAnimationTime * 2.4 + Math.PI) * 12,
                      },
                      {
                        translateY:
                          Math.sin(ghostAnimationTime * 4.2 + Math.PI) * 3,
                      },
                      {
                        scaleX:
                          Math.cos(ghostAnimationTime * 2.4 + Math.PI) >= 0
                            ? -1
                            : 1,
                      },
                    ],
                  },
                ]}
              />
            )}
            {game.joinPlayer?.isDead && (
              <Text
                style={[
                  styles.playerDownLabel,
                  {
                    left: game.joinPlayer.x - 24,
                    top: game.joinPlayer.y + 20,
                  },
                ]}
              >
                DOWN
              </Text>
            )}
            {game.reviveState && (
              <Text
                style={[
                  styles.reviveTimerLabel,
                  {
                    left:
                      (game.reviveState.targetId === "host"
                        ? game.player.x
                        : (game.joinPlayer?.x ?? 0)) - 30,
                    top:
                      (game.reviveState.targetId === "host"
                        ? game.player.y
                        : (game.joinPlayer?.y ?? 0)) + 36,
                  },
                ]}
              >
                {reviveCountdown}s
              </Text>
            )}

            {game.damageNumbers.map((damageNumber) => {
              const isHeal = damageNumber.target === "heal";
              const isGrenadePickup = damageNumber.target === "grenadePickup";
              const isMedkitPickup = damageNumber.target === "medkitPickup";
              const isSpeedPickup = damageNumber.target === "speedPickup";
              const isRapidFirePickup =
                damageNumber.target === "rapidFirePickup";
              const isHighDamagePickup =
                damageNumber.target === "highDamagePickup";
              const isConsumablePickup =
                isGrenadePickup ||
                isMedkitPickup ||
                isSpeedPickup ||
                isRapidFirePickup ||
                isHighDamagePickup;
              const lifetime = isHeal
                ? 1
                : isConsumablePickup
                  ? 1.2
                  : damageNumber.target === "player"
                    ? 0.8
                    : 0.75;
              const progress = 1 - damageNumber.life / lifetime;
              return (
                <Text
                  key={damageNumber.id}
                  pointerEvents="none"
                  style={[
                    styles.damageNumber,
                    isHeal
                      ? styles.healNumber
                      : isConsumablePickup
                        ? styles.consumablePickupNumber
                        : damageNumber.target === "player"
                          ? styles.playerDamageNumber
                          : styles.enemyDamageNumber,
                    {
                      left: damageNumber.x - (isConsumablePickup ? 76 : 36),
                      top: damageNumber.y - progress * 28,
                      opacity: Math.min(1, damageNumber.life * 2),
                    },
                  ]}
                >
                  {isHeal
                    ? `+${Math.round(damageNumber.amount)}`
                    : isGrenadePickup
                      ? `+${damageNumber.amount} grenade`
                      : isMedkitPickup
                        ? `+${damageNumber.amount} medkit`
                        : isSpeedPickup
                          ? "+speed"
                          : isRapidFirePickup
                            ? "+rapid fire"
                            : isHighDamagePickup
                              ? "+damage"
                              : `-${damageNumber.amount}`}
                </Text>
              );
            })}
          </View>
        </View>

        {showBossChestConversation && bossChest && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Look at that! The boss dropped a chest. Let's pick it up to see what's inside. Dismiss conversation."
            onPress={() => setDismissedBossChestId(bossChest.id)}
            style={styles.bossChestConversation}
          >
            <Image
              source={
                PROFILE_PICTURES[localPlayer.hero] ??
                getSkinImage(localPlayer.hero, localPlayer.skinId)
              }
              contentFit="cover"
              style={styles.bossChestConversationPortrait}
              accessibilityLabel={`${localPlayer.name}'s hero`}
            />
            <Text style={styles.bossChestConversationText}>
              Look at that! The boss dropped a chest. Let&apos;s pick it up to
              see what&apos;s inside.
            </Text>
          </Pressable>
        )}

        {grenadeAim?.cancelTargeted && (
          <View pointerEvents="none" style={styles.grenadeCancelHint}>
            <Text style={styles.grenadeCancelText}>RELEASE TO CANCEL</Text>
          </View>
        )}
        {grenadeAim && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel grenade throw"
            onPress={cancelGrenadeThrow}
            style={[
              styles.grenadeCancelButton,
              grenadeAim.cancelTargeted && styles.grenadeCancelButtonActive,
            ]}
          >
            <Text style={styles.grenadeCancelText}>
              {grenadeAim.cancelTargeted ? "RELEASE TO CANCEL" : "CANCEL"}
            </Text>
          </Pressable>
        )}

        {(game.isRunning === false || game.isPaused) && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>
              {game.isPaused ? "Paused" : "Garden Overrun"}
            </Text>
            {!game.isPaused && (
              <View
                accessible
                accessibilityLabel={`Final score: ${game.score}`}
                style={styles.gameOverStat}
              >
                <Image
                  source={trophyImage}
                  contentFit="contain"
                  style={styles.gameOverStatIcon}
                  accessibilityLabel="Final score"
                />
                <Text style={styles.overlayText}>{game.score}</Text>
              </View>
            )}

            {!game.isPaused && earnedCoins > 0 && (
              <View
                accessible
                accessibilityLabel={`${earnedCoins} coins earned`}
                style={styles.gameOverStat}
              >
                <Image
                  source={coinImage}
                  contentFit="contain"
                  style={styles.gameOverStatIcon}
                  accessibilityLabel="Coins earned"
                />
                <Text style={styles.overlayText}>{earnedCoins}</Text>
              </View>
            )}

            {!game.isPaused && earnedXp > 0 && (
              <View
                accessible
                accessibilityLabel={`${earnedXp} XP earned`}
                style={styles.gameOverStat}
              >
                <Image
                  source={xpImage}
                  contentFit="contain"
                  style={styles.gameOverStatIcon}
                  accessibilityLabel="XP earned"
                />
                <Text style={styles.overlayText}>{earnedXp}</Text>
              </View>
            )}

            {game.isPaused ? (
              <View style={styles.overlayActions}>
                <Pressable
                  style={styles.restartButton}
                  onPress={togglePause}
                  accessibilityRole="button"
                  accessibilityLabel="Resume"
                >
                  <Image
                    source={playIcon}
                    style={styles.topActionIcon}
                    contentFit="contain"
                  />
                </Pressable>
                <Pressable
                  style={styles.menuButton}
                  onPress={goToMenu}
                  accessibilityRole="button"
                  accessibilityLabel="Menu"
                >
                  <Image
                    source={homeIcon}
                    style={styles.topActionIcon}
                    contentFit="contain"
                  />
                </Pressable>
                <Pressable
                  style={styles.giveUpButton}
                  onPress={giveUp}
                  accessibilityRole="button"
                  accessibilityLabel="Give up and end the game"
                >
                  <Text style={styles.giveUpButtonText}>Give Up</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.overlayActions}>
                <Pressable style={styles.restartButton} onPress={resetGame}>
                  <Text style={styles.restartText}>Retry</Text>
                </Pressable>
                <Pressable
                  style={styles.menuButton}
                  onPress={goToMenu}
                  accessibilityRole="button"
                  accessibilityLabel="Menu"
                >
                  <Image
                    source={homeIcon}
                    style={styles.topActionIcon}
                    contentFit="contain"
                  />
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View pointerEvents="box-none" style={styles.hud}>
          <View pointerEvents="box-none" style={styles.playerHudGroup}>
            {hudPlayers.map(
              ({ id, badge, role, player, profilePicture, profileBorder }) => (
                <View
                  key={id}
                  pointerEvents="box-none"
                  style={styles.playerHudPlayer}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View ${player.name}'s stats`}
                    accessibilityState={{
                      expanded: statsPopupPlayerId === player.id,
                    }}
                    onPress={() =>
                      setStatsPopupPlayerId((current) =>
                        current === player.id ? null : player.id,
                      )
                    }
                    hitSlop={4}
                    style={styles.playerHudTouchable}
                  >
                    <View
                      pointerEvents="none"
                      style={[
                        styles.playerHudCard,
                        styles.playerHudCardCompact,
                      ]}
                    >
                      <View
                        style={[
                          styles.playerAvatarWrap,
                          styles.playerAvatarWrapCompact,
                          getProfileBorderStyle(profileBorder),
                        ]}
                      >
                        <View style={styles.playerAvatarBadge}>
                          <Text style={styles.playerAvatarBadgeText}>
                            {badge}
                          </Text>
                        </View>
                        <Image
                          source={PROFILE_PICTURES[profilePicture]}
                          style={[
                            styles.playerAvatarImage,
                            styles.playerAvatarImageCompact,
                          ]}
                          contentFit="cover"
                        />
                        <ProfileBorderOverlay borderId={profileBorder} />
                      </View>

                      <View
                        style={[
                          styles.playerHealthColumn,
                          styles.playerHealthColumnCompact,
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={styles.playerHudPlayerName}
                        >
                          {player.name}
                        </Text>
                        <View style={styles.playerHealthBarRow}>
                          <View style={styles.playerHealthTrack}>
                            <View
                              style={[
                                styles.playerHealthFill,
                                {
                                  width: `${Math.max(
                                    0,
                                    (player.health / player.maxHealth) * 100,
                                  )}%`,
                                  backgroundColor: "#ef4444",
                                },
                              ]}
                            />
                            <Text
                              pointerEvents="none"
                              style={styles.playerHealthValue}
                            >
                              {Math.max(0, Math.round(player.health))}/
                              {Math.round(player.maxHealth)}
                            </Text>
                          </View>
                        </View>
                        {getActiveBuffs(player).length > 0 && (
                          <View style={styles.activeBuffs} pointerEvents="none">
                            {getActiveBuffs(player).map((buff) => (
                              <ActiveBuffBadge key={buff.kind} buff={buff} />
                            ))}
                          </View>
                        )}
                      </View>

                      {isLocalMultiplayer && (
                        <View
                          pointerEvents="none"
                          style={[
                            styles.playerReadyIndicator,
                            role === "host"
                              ? styles.playerReadyIndicatorHost
                              : multiplayerReadiness.join
                                ? styles.playerReadyIndicatorReady
                                : styles.playerReadyIndicatorWaiting,
                          ]}
                        >
                          <Text
                            style={[
                              styles.playerReadyIndicatorText,
                              role === "host" && styles.playerHostCrown,
                            ]}
                          >
                            {role === "host"
                              ? "👑"
                              : multiplayerReadiness.join
                                ? "READY"
                                : "NOT READY"}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                  {statsPopupPlayerId === player.id && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Close ${player.name}'s stat details`}
                      onPress={() => setStatsPopupPlayerId(null)}
                      style={styles.playerStatsPopup}
                    >
                      <Text style={styles.playerStatsPopupTitle}>
                        {player.name.toUpperCase()} · STATS
                      </Text>
                      {getPlayerPopupStats(player).map((stat) => (
                        <View
                          key={stat.label}
                          style={styles.playerStatsPopupRow}
                        >
                          <Text style={styles.playerStatsPopupLabel}>
                            {stat.label}
                          </Text>
                          <View style={styles.playerStatsPopupValues}>
                            <Text style={styles.playerStatsPopupValue}>
                              {stat.value}
                            </Text>
                            {!!stat.bonus && (
                              <Text style={styles.playerStatsPopupBonus}>
                                {stat.bonus}
                              </Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </Pressable>
                  )}
                </View>
              ),
            )}
          </View>

          <View style={styles.hudRightStack}>
            <View style={styles.scoreWaveStack}>
              <Text style={styles.hudText}>Score: {game.score}</Text>
              <Text style={styles.hudText}>Wave {game.wave}</Text>
              <Text style={styles.hudText}>
                Enemies remaining: {getEnemiesRemainingInWave(game)}
              </Text>
            </View>
            {isLocalMultiplayer && (
              <View style={styles.localMultiplayerBadge}>
                <Text style={styles.localMultiplayerBadgeText}>
                  {localRoleLabel}
                </Text>
              </View>
            )}
          </View>
        </View>

        {isLocalMultiplayer &&
          multiplayerRole === "host" &&
          !isMultiplayerLobby && (
            <View pointerEvents="none" style={styles.hostInfoFooter}>
              <Text style={styles.hostInfoFooterText}>
                HOST ·{" "}
                {hostAddressesToShare[0]?.address ??
                  hostIpAddress ??
                  "IP unavailable"}
                {hostAddressesToShare[0]?.address || hostIpAddress
                  ? ":8765"
                  : ""}
              </Text>
            </View>
          )}

        <View
          style={styles.topRow}
          pointerEvents={isLocalPlayerReviving ? "none" : "box-none"}
        >
          <View style={styles.topRowContent}>
            <View style={styles.topRowActions}>
              <GestureDetector gesture={pauseGesture}>
                <View
                  style={styles.pauseButtonTop}
                  accessibilityRole="button"
                  accessibilityLabel={game.isPaused ? "Play" : "Pause"}
                >
                  <Image
                    source={game.isPaused ? playIcon : pauseIcon}
                    style={styles.topActionIcon}
                    contentFit="contain"
                  />
                </View>
              </GestureDetector>
            </View>
          </View>
        </View>

        {game.isRunning &&
          !game.isPaused &&
          !localPlayer.isDead &&
          !isLocalPlayerReviving && (
            <View pointerEvents="box-none" style={styles.controls}>
              <View
                style={[
                  styles.joystickControl,
                  controlPositionStyle("joystick", 90, 90),
                ]}
              >
                <GestureDetector gesture={joystickGesture}>
                  <View style={styles.joystickPad}>
                    <View
                      style={[
                        styles.joystickStick,
                        {
                          transform: [
                            { translateX: joystick.x * 20 },
                            { translateY: joystick.y * 20 },
                          ],
                        },
                      ]}
                    />
                  </View>
                </GestureDetector>
              </View>

              <View pointerEvents="box-none" style={styles.actionStack}>
                <View pointerEvents="box-none" style={styles.actionTopRow}>
                  <GestureDetector gesture={fireHoldGesture}>
                    <View
                      style={[
                        styles.fireButtonFrame,
                        controlPositionStyle("fire", 84, 84),
                      ]}
                    >
                      <View style={styles.fireButton}>
                        {selectedWeapon === "gun" ? (
                          <Image
                            pointerEvents="none"
                            source={currentBulletImage}
                            contentFit="contain"
                            style={styles.fireButtonBackgroundIcon}
                          />
                        ) : (
                          <Image
                            pointerEvents="none"
                            source={bombImage}
                            contentFit="contain"
                            style={styles.fireButtonBackgroundIcon}
                          />
                        )}
                        <Text
                          pointerEvents="none"
                          style={[
                            styles.buttonText,
                            styles.fireButtonLabel,
                            selectedWeapon === "grenade" &&
                              styles.grenadeFireButtonText,
                          ]}
                        >
                          {selectedWeapon === "gun" ? "FIRE" : "HOLD\nTHROW"}
                        </Text>
                      </View>
                    </View>
                  </GestureDetector>
                </View>
                <View pointerEvents="box-none" style={[styles.secondaryRow]}>
                  <GestureDetector gesture={gunSelectGesture}>
                    <View
                      style={[
                        styles.actionButtonFrame,
                        controlPositionStyle("gun", 54, 54),
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Select gun"
                        accessibilityState={{
                          selected: selectedWeapon === "gun",
                        }}
                        onPress={() => selectWeapon("gun")}
                        style={[
                          styles.secondaryButton,
                          styles.weaponButton,
                          styles.actionCircleButton,
                          selectedWeapon === "gun" &&
                            styles.weaponButtonSelected,
                        ]}
                      >
                        <Image
                          source={currentBulletImage}
                          contentFit="contain"
                          style={styles.gunButtonIcon}
                        />
                      </Pressable>
                    </View>
                  </GestureDetector>
                  <GestureDetector gesture={grenadeSelectGesture}>
                    <View
                      style={[
                        styles.actionButtonFrame,
                        controlPositionStyle("grenade", 54, 54),
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Select grenade, ${localPlayer.grenades} remaining`}
                        accessibilityState={{
                          selected: selectedWeapon === "grenade",
                          disabled: localPlayer.grenades <= 0,
                        }}
                        disabled={localPlayer.grenades <= 0}
                        onPress={() => selectWeapon("grenade")}
                        style={[
                          styles.secondaryButton,
                          styles.weaponButton,
                          styles.actionCircleButton,
                          selectedWeapon === "grenade" &&
                            styles.weaponButtonSelected,
                          localPlayer.grenades <= 0 &&
                            styles.weaponButtonDisabled,
                        ]}
                      >
                        <Image
                          source={bombImage}
                          contentFit="contain"
                          style={styles.grenadeButtonIcon}
                        />
                        <View
                          pointerEvents="none"
                          style={styles.itemCountBadge}
                        >
                          <Text style={styles.itemCountBadgeText}>
                            x{localPlayer.grenades}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  </GestureDetector>
                  <GestureDetector gesture={healGesture}>
                    <View
                      style={[
                        styles.actionButtonFrame,
                        controlPositionStyle("heal", 54, 54),
                      ]}
                    >
                      <View
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={`Use medkit, ${localPlayer.heals} remaining`}
                        accessibilityState={{
                          disabled: localPlayer.heals <= 0,
                        }}
                        style={[
                          styles.secondaryButton,
                          styles.actionCircleButton,
                          localPlayer.heals <= 0 && styles.weaponButtonDisabled,
                        ]}
                      >
                        <Image
                          source={medkitIcon}
                          contentFit="contain"
                          style={styles.healButtonIcon}
                        />
                        <View
                          pointerEvents="none"
                          style={styles.itemCountBadge}
                        >
                          <Text style={styles.itemCountBadgeText}>
                            x{localPlayer.heals}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </GestureDetector>
                  <GestureDetector gesture={dashGesture}>
                    <View
                      style={[
                        styles.actionButtonFrame,
                        controlPositionStyle("dash", 54, 54),
                      ]}
                    >
                      <View
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={
                          localPlayer.dashCooldown > 0
                            ? `Dash cooling down: ${localPlayer.dashCooldown.toFixed(1)} seconds remaining`
                            : "Dash ready"
                        }
                        accessibilityState={{
                          disabled: localPlayer.dashCooldown > 0,
                        }}
                        style={[
                          styles.secondaryButton,
                          styles.actionCircleButton,
                          styles.dashButton,
                          localPlayer.dashCooldown > 0 &&
                            styles.dashButtonDisabled,
                        ]}
                      >
                        <View
                          pointerEvents="none"
                          style={styles.dashCooldownFillTrack}
                        >
                          <View
                            style={[
                              styles.dashCooldownFill,
                              {
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    (localPlayer.dashCooldown / DASH_COOLDOWN) *
                                      100,
                                  ),
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                        {localPlayer.dashCooldown > 0 ? (
                          <Text
                            pointerEvents="none"
                            style={styles.dashCooldownText}
                          >
                            {`${localPlayer.dashCooldown.toFixed(1)}s`}
                          </Text>
                        ) : (
                          <Image
                            pointerEvents="none"
                            source={dashImage}
                            contentFit="contain"
                            style={styles.dashReadyIcon}
                          />
                        )}
                      </View>
                    </View>
                  </GestureDetector>
                </View>
              </View>
            </View>
          )}

        {game.isRunning &&
          !game.isPaused &&
          (localPlayer.isDead ||
            isLocalPlayerReviving ||
            nearbyDownedPlayer) && (
            <View style={styles.reviveActionPanel}>
              {localPlayer.isDead ? (
                <Text style={styles.reviveHelpText}>
                  DOWNED — WAIT FOR YOUR TEAMMATE
                </Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={toggleRevive}
                  style={[
                    styles.reviveButton,
                    isLocalPlayerReviving && styles.stopReviveButton,
                  ]}
                >
                  <Text style={styles.reviveButtonText}>
                    {isLocalPlayerReviving
                      ? `STOP REVIVE · ${reviveCountdown}s`
                      : `REVIVE ${nearbyDownedPlayer?.name ?? "PLAYER"} · 5s`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        {game.powerUpChoices.length > 0 && game.isRunning && (
          <View style={styles.powerUpOverlay}>
            <View style={styles.powerUpBackdrop}>
              <View
                style={[
                  styles.powerUpPanel,
                  height < 440 && styles.powerUpPanelCompact,
                ]}
              >
                <Text style={styles.powerUpEyebrow}>
                  CHEST REWARD · TEAM POWER-UP
                </Text>
                <Text style={styles.powerUpTitle}>Choose your upgrade</Text>

                <View style={styles.powerUpCards}>
                  {game.powerUpChoices.map((choice, index) => {
                    const isSelected = selectedPowerUp?.id === choice.id;
                    const currentStats = getPreviewStats(localPlayer, null);
                    const projectedStats = getPreviewStats(localPlayer, choice);
                    return (
                      <Pressable
                        key={choice.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${choice.name}, ${choice.description}, ${getPowerUpBonusText(choice)}`}
                        onPress={() =>
                          setPowerUpSelection({
                            choiceKey: powerUpChoiceKey,
                            id: choice.id,
                          })
                        }
                        style={[
                          styles.powerUpCard,
                          height < 440 && styles.powerUpCardCompact,
                          isSelected && styles.powerUpCardSelected,
                        ]}
                      >
                        <Text style={styles.powerUpCardIndex}>
                          POWER-UP {index + 1}
                        </Text>
                        <Text numberOfLines={1} style={styles.powerUpCardTitle}>
                          {choice.name}
                        </Text>
                        <Text style={styles.powerUpCardBonus}>
                          {getPowerUpBonusText(choice)}
                        </Text>
                        {isSelected && (
                          <Text style={styles.powerUpPreviewLabel}>
                            SELECTED
                          </Text>
                        )}

                        <View style={styles.powerUpCardStats}>
                          <View style={styles.powerUpCardStatsHeader}>
                            <Text
                              style={[
                                styles.powerUpCardStatHeading,
                                styles.powerUpCardStatName,
                              ]}
                            >
                              STAT
                            </Text>
                            <Text style={styles.powerUpCardStatHeading}>
                              CURRENT → NEW
                            </Text>
                            <Text
                              style={[
                                styles.powerUpCardStatHeading,
                                styles.powerUpCardStatBonus,
                              ]}
                            >
                              BONUS
                            </Text>
                          </View>
                          {[
                            {
                              title: "BASE STATS",
                              labels: ["MAX HEALTH", "DAMAGE", "DEFENSE"],
                            },
                            {
                              title: "ADVANCED STATS",
                              labels: ["FIRE RATE", "SPEED", "CRIT"],
                            },
                          ].map((section) => (
                            <View key={section.title}>
                              <Text style={styles.powerUpCardSectionTitle}>
                                {section.title}
                              </Text>
                              {section.labels.map((label, rowIndex) => {
                                const current = currentStats.find(
                                  (stat) => stat.label === label,
                                );
                                const projected = projectedStats.find(
                                  (stat) => stat.label === label,
                                );
                                if (!current || !projected) return null;
                                const bonus = getPowerUpStatBonus(
                                  localPlayer,
                                  choice,
                                  label,
                                );
                                return (
                                  <View
                                    key={label}
                                    style={[
                                      styles.powerUpCardStatRow,
                                      rowIndex % 2 === 0 &&
                                        styles.powerUpStatRowAlternate,
                                    ]}
                                  >
                                    <Text
                                      numberOfLines={1}
                                      style={[
                                        styles.powerUpCardStatName,
                                        styles.powerUpStatLabel,
                                      ]}
                                    >
                                      {label}
                                    </Text>
                                    <Text
                                      numberOfLines={1}
                                      style={styles.powerUpCardStatCurrent}
                                    >
                                      {current.value} → {projected.value}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.powerUpStatBonus,
                                        styles.powerUpCardStatBonus,
                                        bonus === "—" &&
                                          styles.powerUpStatBonusEmpty,
                                      ]}
                                    >
                                      {bonus}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          ))}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.powerUpTeamNote}>
                  The selected upgrade applies to both players in co-op.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !selectedPowerUp }}
                  disabled={!selectedPowerUp}
                  onPress={() =>
                    selectedPowerUp && confirmPowerUpSelection(selectedPowerUp)
                  }
                  style={[
                    styles.powerUpConfirmButton,
                    !selectedPowerUp && styles.powerUpConfirmButtonDisabled,
                  ]}
                >
                  <Text style={styles.powerUpConfirmText}>
                    {multiplayerRole === "join"
                      ? "CHOOSE FOR TEAM"
                      : "CHOOSE POWER-UP"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
        {game.warpTransitionTimer > 0 && game.isRunning && !game.isPaused && (
          <View
            pointerEvents="none"
            style={[
              styles.warpTransitionOverlay,
              { opacity: getWarpFadeOpacity(game.warpTransitionTimer) },
            ]}
          />
        )}
        {game.warpTransitionTimer > 0 && game.isRunning && !game.isPaused && (
          <View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Warping to another location, ${Math.ceil(game.warpTransitionTimer)} seconds`}
            style={styles.warpTransitionMessage}
          >
            <Text style={styles.warpTransitionTitle}>
              WARPING TO ANOTHER LOCATION
            </Text>
            <Text style={styles.warpTransitionCountdown}>
              {Math.ceil(game.warpTransitionTimer)}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#07110d",
  },
  container: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  lobbyScreen: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: "rgba(4, 15, 11, 0.72)",
    zIndex: 2,
  },
  lobbyTitle: {
    color: "#f0fdf4",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  lobbySubtitle: {
    color: "#bbf7d0",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },
  lobbyHostAddress: {
    alignItems: "center",
    marginTop: 4,
  },
  lobbyAddressText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: 4,
    textAlign: "center",
  },
  lobbyAddressHint: {
    color: "#bbf7d0",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  lobbyPlayerList: {
    width: "100%",
    maxWidth: 480,
    marginTop: 20,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(167, 243, 208, 0.28)",
    backgroundColor: "rgba(6, 28, 20, 0.9)",
    gap: 10,
  },
  lobbySectionTitle: {
    color: "#a7f3d0",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  lobbyEmptyText: {
    color: "#cbd5e1",
    fontSize: 14,
    paddingVertical: 10,
  },
  lobbyPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(15, 48, 34, 0.9)",
  },
  lobbyPlayerAvatar: {
    width: 36,
    height: 36,
    padding: 2,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 18, 14, 0.9)",
    overflow: "hidden",
  },
  lobbyPlayerAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  lobbyPlayerDetails: {
    flex: 1,
  },
  lobbyPlayerName: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "800",
  },
  lobbyPlayerRole: {
    color: "#86efac",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 2,
  },
  lobbyPlayerStatus: {
    color: "#86efac",
    fontSize: 10,
    fontWeight: "800",
  },
  lobbyStartButton: {
    minWidth: 220,
    marginTop: 18,
    paddingHorizontal: 28,
    paddingVertical: 13,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#d9f99d",
    backgroundColor: "#65a30d",
  },
  lobbyStartButtonDisabled: {
    opacity: 0.55,
  },
  lobbyStartButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: "#4d7c0f",
  },
  lobbyStartButtonText: {
    color: "#f7fee7",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  lobbyWaitingText: {
    color: "#d1d5db",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 18,
    textAlign: "center",
  },
  arenaBackground: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  arenaStage: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  arena: {
    position: "relative",
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "#2b5d46",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  player: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    overflow: "visible",
  },
  playerImage: {
    width: "100%",
    height: "100%",
  },
  playerHitFlash: {
    tintColor: "#ef4444",
  },
  playerAimArrow: {
    position: "absolute",
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#fef3c7",
    zIndex: 3,
  },
  playerGhost: {
    position: "absolute",
    width: GHOST_SIZE,
    height: GHOST_SIZE,
    opacity: 0.95,
    zIndex: 5,
  },
  playerDownLabel: {
    position: "absolute",
    zIndex: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(127, 29, 29, 0.95)",
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  reviveTimerLabel: {
    position: "absolute",
    zIndex: 7,
    minWidth: 42,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(22, 101, 52, 0.95)",
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  orbCompanion: {
    position: "absolute",
    width: 20,
    height: 20,
    zIndex: 2,
  },
  buddyCompanion: {
    position: "absolute",
    width: 24,
    height: 24,
    zIndex: 2,
  },
  orbLaser: {
    position: "absolute",
    height: 14,
    zIndex: 1,
  },
  hud: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    zIndex: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  playerHudGroup: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  playerHudPlayer: {
    position: "relative",
    alignItems: "flex-start",
    gap: 2,
    maxWidth: 170,
  },
  playerHudTouchable: {
    alignItems: "flex-start",
    gap: 2,
    maxWidth: 170,
  },
  playerHudCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  playerHudCardCompact: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(7, 15, 13, 0.72)",
  },
  playerHudPlayerName: {
    maxWidth: 74,
    color: "#d9f5dc",
    fontSize: 8,
    fontWeight: "800",
  },
  playerStatsPopup: {
    position: "absolute",
    top: "100%",
    left: 0,
    zIndex: 30,
    elevation: 30,
    width: 150,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(187, 247, 208, 0.28)",
    backgroundColor: "rgba(5, 15, 11, 0.68)",
  },
  playerStatsPopupTitle: {
    marginBottom: 3,
    color: "#bbf7d0",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  playerStatsPopupRow: {
    minHeight: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  playerStatsPopupLabel: {
    color: "#d8e3dc",
    fontSize: 8,
    fontWeight: "600",
  },
  playerStatsPopupValue: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
  },
  playerStatsPopupValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  playerStatsPopupBonus: {
    color: "#84cc16",
    fontSize: 8,
    fontWeight: "900",
  },
  playerAvatarWrap: {
    position: "relative",
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(125, 211, 252, 0.9)",
    backgroundColor: "rgba(22, 39, 36, 0.95)",
    overflow: "visible",
  },
  playerAvatarBadge: {
    position: "absolute",
    top: -5,
    left: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: "#facc15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0b120d",
    zIndex: 2,
  },
  playerAvatarBadgeText: {
    color: "#0b120d",
    fontSize: 8,
    fontWeight: "900",
  },
  playerAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 10,
  },
  playerAvatarWrapCompact: {
    width: 38,
    height: 38,
  },
  playerAvatarImageCompact: {
    width: 32,
    height: 32,
  },
  playerHealthColumn: {
    width: 94,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 2,
  },
  playerHealthColumnCompact: {
    width: 74,
  },
  playerHealthBarRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  playerHealthTrack: {
    position: "relative",
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "visible",
    borderWidth: 1,
    borderColor: "rgba(255, 224, 160, 0.6)",
  },
  playerHealthFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#ef4444",
    overflow: "hidden",
  },
  speedBoostBadge: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    backgroundColor: "rgba(14, 116, 144, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(125, 211, 252, 0.9)",
    overflow: "hidden",
    zIndex: 5,
  },
  playerWorldBuffs: {
    position: "absolute",
    top: -25,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    zIndex: 8,
  },
  activeBuffs: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 3,
    maxWidth: 74,
    marginTop: 1,
    zIndex: 5,
  },
  rapidFireBuffBadge: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    backgroundColor: "rgba(180, 83, 9, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(253, 186, 116, 0.95)",
    overflow: "hidden",
  },
  highDamageBuffBadge: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    backgroundColor: "rgba(126, 34, 206, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(216, 180, 254, 0.95)",
    overflow: "hidden",
  },
  activeBuffCooldownFill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  activeBuffIcon: {
    width: 12,
    height: 12,
    zIndex: 1,
  },
  playerHealthValue: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -3,
    color: "#fff",
    fontSize: 8,
    fontWeight: "900",
    lineHeight: 12,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    zIndex: 2,
  },
  playerReadyIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  playerReadyIndicatorReady: {
    backgroundColor: "rgba(21, 128, 61, 0.85)",
    borderColor: "#86efac",
  },
  playerReadyIndicatorHost: {
    backgroundColor: "rgba(120, 83, 10, 0.92)",
    borderColor: "#facc15",
  },
  playerReadyIndicatorWaiting: {
    backgroundColor: "rgba(127, 29, 29, 0.85)",
    borderColor: "#fca5a5",
  },
  playerReadyIndicatorText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  playerHostCrown: {
    color: "#fde68a",
    fontSize: 13,
    lineHeight: 14,
  },
  hudRightStack: {
    alignItems: "flex-end",
    gap: 6,
    marginRight: 48,
  },
  scoreWaveStack: {
    gap: 4,
  },
  hudText: {
    color: "#e5f9eb",
    fontSize: 16,
    fontWeight: "700",
  },
  localMultiplayerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(22, 39, 36, 0.87)",
    borderWidth: 1,
    borderColor: "rgba(125, 211, 252, 0.9)",
  },
  localMultiplayerBadgeText: {
    color: "#dff7ff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  hostInfoFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 4,
    zIndex: 4,
    alignItems: "center",
  },
  hostInfoFooterText: {
    color: "#d9f5dc",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(7, 15, 13, 0.72)",
  },
  topRow: {
    position: "absolute",
    top: 8,
    left: 16,
    right: 16,
    zIndex: 5,
    alignItems: "stretch",
  },
  topRowContent: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  topRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topActionIcon: {
    width: 26,
    height: 26,
  },
  bossBarWrap: {
    position: "absolute",
    top: 12,
    left: "25%",
    right: "25%",
    alignItems: "center",
    zIndex: 18,
  },
  bossLabel: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 4,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  bossBarOuter: {
    width: "100%",
    height: 13,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "#fb7185",
  },
  bossBarInner: {
    height: "100%",
    backgroundColor: "#ef4444",
  },
  bossHealthText: {
    marginTop: 2,
    color: "#ffe4e6",
    fontSize: 8,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowRadius: 3,
  },
  bossWarningOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "transparent",
    zIndex: 25,
  },
  bossEntryMarker: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#ef4444",
    backgroundColor: "rgba(69, 10, 10, 0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  bossEntryMarkerTop: { top: 6, left: ARENA_WIDTH / 2 - 22 },
  bossEntryMarkerBottom: { bottom: 6, left: ARENA_WIDTH / 2 - 22 },
  bossEntryMarkerLeft: { left: 6, top: ARENA_HEIGHT / 2 - 22 },
  bossEntryMarkerRight: { right: 6, top: ARENA_HEIGHT / 2 - 22 },
  bossEntryMarkerText: {
    color: "#fca5a5",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 32,
  },
  bossAddsWarning: {
    position: "absolute",
    zIndex: 30,
    elevation: 30,
    minWidth: 92,
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ef4444",
    backgroundColor: "rgba(69, 10, 10, 0.9)",
  },
  bossAddsWarningTop: {
    top: 6,
    left: ARENA_WIDTH / 2 - 46,
  },
  bossAddsWarningRight: {
    top: ARENA_HEIGHT / 2 - 19,
    right: 6,
  },
  bossAddsWarningBottom: {
    bottom: 6,
    left: ARENA_WIDTH / 2 - 46,
  },
  bossAddsWarningLeft: {
    top: ARENA_HEIGHT / 2 - 19,
    left: 6,
  },
  bossAddsWarningMark: {
    color: "#fca5a5",
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 30,
    textShadowColor: "#ef4444",
    textShadowRadius: 8,
  },
  bossAddsWarningLabel: {
    color: "#fee2e2",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  bossWarningEyebrow: {
    color: "#fecdd3",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  bossWarningTitle: {
    marginTop: 4,
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1.5,
    textAlign: "center",
    textShadowColor: "#dc2626",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  bossWarningName: {
    marginTop: 3,
    color: "#ef4444",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "center",
  },
  bossWarningCountdown: {
    marginTop: 2,
    color: "#fff",
    fontSize: 42,
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  bossWarningHint: {
    color: "#ffe4e6",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },
  bossTelegraphLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 14,
  },
  bossAreaTelegraph: {
    position: "absolute",
    width: BOSS_AREA_RADIUS * 2,
    height: BOSS_AREA_RADIUS * 2,
    borderRadius: BOSS_AREA_RADIUS,
    borderWidth: 3,
    borderColor: "rgba(255, 35, 55, 0.95)",
    backgroundColor: "rgba(239, 35, 55, 0.2)",
  },
  bossDashTelegraph: {
    position: "absolute",
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255, 35, 55, 0.95)",
    backgroundColor: "rgba(239, 35, 55, 0.24)",
  },
  bossTelegraphLabel: {
    position: "absolute",
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textShadowColor: "#dc2626",
    textShadowRadius: 6,
  },
  bossAreaImpact: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 4,
    borderColor: "#fb7185",
    backgroundColor: "rgba(239, 35, 55, 0.42)",
    zIndex: 11,
  },
  bossProjectile: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#fff1f2",
    shadowOpacity: 0.95,
    shadowRadius: 24,
    zIndex: 12,
  },
  arenaBossEnemy: {
    zIndex: 10,
    shadowColor: "#fb7185",
    shadowOpacity: 0.95,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  arenaBossHealthBar: {
    height: 12,
    borderColor: "#a855f7",
    zIndex: 10,
  },
  arenaBossHealthFill: {
    backgroundColor: "#9333ea",
  },
  arenaBossHealthText: {
    color: "#ef4444",
  },
  eliteEnemyHealthBar: {
    borderColor: "#c2410c",
  },
  eliteEnemyHealthFill: {
    backgroundColor: "#f97316",
  },
  enemy: {
    position: "absolute",
    justifyContent: "flex-end",
    alignItems: "center",
    overflow: "visible",
  },
  enemySprite: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  enemyDeathSprite: {
    position: "absolute",
    zIndex: 5,
  },
  enemyImpact: {
    position: "absolute",
    left: "15%",
    top: "15%",
    width: "70%",
    height: "70%",
    zIndex: 3,
  },
  enemyHitFlash: {
    tintColor: "#ef4444",
  },
  enemyHealthText: {
    position: "absolute",
    inset: 0,
    color: "#fef2f2",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
    lineHeight: 8,
    zIndex: 5,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  enemyLevelBadge: {
    position: "absolute",
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
    zIndex: 2,
  },
  enemyLevelText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "900",
    lineHeight: 10,
    textAlign: "center",
  },
  enemyHealthBarOuter: {
    position: "absolute",
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    borderWidth: 2,
    borderColor: "#7f1d1d",
    overflow: "hidden",
    zIndex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  enemyHealthBarInner: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: "#ef4444",
  },
  damageNumber: {
    position: "absolute",
    width: 72,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
    zIndex: 5,
  },
  playerDamageNumber: {
    color: "#fb7185",
  },
  enemyDamageNumber: {
    color: "#fef08a",
  },
  consumableDrop: {
    position: "absolute",
    zIndex: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.9)",
    shadowColor: "#000",
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  consumableDropImage: {
    width: "82%",
    height: "82%",
  },
  consumableDropBorder: {
    borderColor: "#4ade80",
  },
  buffDropBorder: {
    borderColor: "#60a5fa",
  },
  healNumber: {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    color: "#4ade80",
    textShadowColor: "rgba(0, 0, 0, 0.95)",
    textShadowRadius: 6,
  },
  bossAreaImpactImage: {
    position: "absolute",
    zIndex: 11,
  },
  bossProjectileImage: {
    position: "absolute",
    zIndex: 12,
  },
  consumablePickupNumber: {
    width: 152,
    color: "#fff3a3",
    fontSize: 16,
    textShadowColor: "rgba(0, 0, 0, 0.95)",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 6,
  },
  waveCountdownOverlay: {
    textAlign: "center",
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.5,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  wavePreparationLabel: {
    marginTop: 1,
    color: "#bbf7d0",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowRadius: 4,
  },
  powerUpOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 110,
    elevation: 110,
  },
  powerUpBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(2, 8, 6, 0.9)",
  },
  powerUpPanel: {
    width: "100%",
    maxWidth: 620,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(134, 239, 172, 0.55)",
    backgroundColor: "#0b1b14",
  },
  powerUpPanelCompact: {
    paddingVertical: 8,
  },
  powerUpEyebrow: {
    color: "#86efac",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
    textAlign: "center",
  },
  powerUpTitle: {
    marginTop: 2,
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  powerUpCards: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 7,
    marginTop: 7,
  },
  powerUpCard: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#42644f",
    borderRadius: 11,
    backgroundColor: "#13271d",
  },
  powerUpCardCompact: {
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  powerUpCardSelected: {
    borderWidth: 2,
    borderColor: "#86efac",
    backgroundColor: "#1c3b2a",
  },
  powerUpCardIndex: {
    color: "#9db6a5",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },
  powerUpCardTitle: {
    marginTop: 1,
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  powerUpCardBonus: {
    marginTop: 1,
    color: "#86efac",
    fontSize: 9,
    fontWeight: "900",
  },
  powerUpPreviewLabel: {
    position: "absolute",
    top: 6,
    right: 6,
    color: "#bbf7d0",
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  powerUpCardStats: {
    marginTop: 5,
    paddingTop: 3,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
  },
  powerUpCardStatsHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 13,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.13)",
  },
  powerUpCardStatHeading: {
    width: 91,
    color: "#82948a",
    fontSize: 6,
    fontWeight: "900",
    textAlign: "right",
  },
  powerUpCardStatName: {
    flex: 1,
    minWidth: 44,
    textAlign: "left",
  },
  powerUpCardStatBonus: {
    width: 34,
  },
  powerUpCardSectionTitle: {
    paddingTop: 2,
    paddingBottom: 0,
    color: "#87988e",
    fontSize: 6,
    fontWeight: "800",
  },
  powerUpCardStatRow: {
    minHeight: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  powerUpStatRowAlternate: {
    backgroundColor: "rgba(148, 163, 184, 0.12)",
  },
  powerUpStatLabel: {
    color: "#f1f5f9",
    fontSize: 7,
    fontWeight: "700",
  },
  powerUpCardStatCurrent: {
    width: 91,
    color: "#e2e8f0",
    fontSize: 7,
    fontWeight: "700",
    textAlign: "right",
  },
  powerUpStatBonus: {
    width: 34,
    color: "#84cc16",
    fontSize: 7,
    fontWeight: "900",
    textAlign: "right",
  },
  powerUpStatBonusEmpty: {
    color: "#64746a",
    fontWeight: "500",
  },
  powerUpTeamNote: {
    marginTop: 4,
    color: "#9db6a5",
    fontSize: 7,
    textAlign: "center",
  },
  powerUpConfirmButton: {
    width: "100%",
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#22c55e",
  },
  powerUpConfirmButtonDisabled: {
    opacity: 0.45,
  },
  powerUpConfirmText: {
    color: "#052e16",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  warpTransitionOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#020617",
    zIndex: 100,
  },
  warpTransitionMessage: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    zIndex: 101,
  },
  warpTransitionTitle: {
    color: "#e0f2fe",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.95)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  warpTransitionCountdown: {
    marginTop: 10,
    color: "#ffffff",
    fontSize: 48,
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.95)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  waveCountdownGroup: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    gap: 8,
  },
  grenadeAimDash: {
    position: "absolute",
    width: 10,
    height: 3,
    borderRadius: 999,
    zIndex: 8,
  },
  grenadeAimBlastArea: {
    position: "absolute",
    width: GRENADE_BLAST_RADIUS * 2,
    height: GRENADE_BLAST_RADIUS * 2,
    borderRadius: 999,
    zIndex: 7,
  },
  grenadeAimAreaDash: {
    position: "absolute",
    width: 10,
    height: 3,
    borderRadius: 999,
    zIndex: 8,
  },
  grenadeCancelButton: {
    position: "absolute",
    top: 58,
    right: 16,
    width: 120,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#fecaca",
    backgroundColor: "rgba(153, 27, 27, 0.96)",
    zIndex: 30,
    elevation: 30,
  },
  grenadeCancelButtonActive: {
    backgroundColor: "rgba(239, 68, 68, 0.98)",
    borderColor: "#fff",
  },
  grenadeCancelHint: {
    position: "absolute",
    top: 108,
    right: 16,
    zIndex: 29,
  },
  grenadeCancelText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  waveCountdownReadyButton: {
    marginTop: 4,
    minWidth: 136,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.85)",
    backgroundColor: "rgba(7, 17, 13, 0.65)",
    zIndex: 20,
    elevation: 20,
  },
  waveCountdownReadyButtonDisabled: {
    opacity: 0.5,
  },
  waveCountdownReadyText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  waveCountdownSkipButton: {
    marginTop: 4,
    minWidth: 136,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(190, 242, 100, 0.85)",
    backgroundColor: "rgba(54, 83, 20, 0.82)",
    zIndex: 20,
    elevation: 20,
  },
  waveCountdownSkipButtonDisabled: { opacity: 0.5 },
  waveCountdownSkipText: {
    color: "#ecfccb",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  bossChestConversation: {
    position: "absolute",
    left: "25%",
    width: "45%",
    top: 15,
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(187, 247, 208, 0.65)",
    backgroundColor: "rgba(5, 18, 14, 0.58)",
    zIndex: 45,
    elevation: 45,
  },
  bossChestConversationPortrait: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(5, 18, 14, 0.45)",
  },
  bossChestConversationText: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    textShadowColor: "rgba(0, 0, 0, 0.95)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  reviveActionPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 22,
    zIndex: 12,
    alignItems: "center",
  },
  reviveButton: {
    minWidth: 190,
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#bbf7d0",
    backgroundColor: "rgba(21, 128, 61, 0.95)",
  },
  stopReviveButton: {
    borderColor: "#fecaca",
    backgroundColor: "rgba(153, 27, 27, 0.96)",
  },
  reviveButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  reviveHelpText: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(127, 29, 29, 0.95)",
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  bullet: {
    position: "absolute",
    width: 24,
    height: 18,
  },
  grenadeProjectile: {
    position: "absolute",
    width: 24,
    height: 24,
    zIndex: 4,
  },
  grenadeExplosion: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255, 140, 0, 0.3)",
    borderWidth: 3,
    borderColor: "#ffd166",
    shadowColor: "#ff8c00",
    shadowOpacity: 1,
    shadowRadius: 16,
    zIndex: 3,
  },
  overlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(7, 17, 13, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 20,
  },
  overlayTitle: {
    color: "#fefce8",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  overlayText: {
    color: "#d1fae5",
    fontSize: 18,
  },
  gameOverStat: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 18,
  },
  gameOverStatIcon: {
    width: 30,
    height: 30,
  },
  overlayActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  restartButton: {
    backgroundColor: "#22c55e",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  menuButton: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#7dd3fc",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  giveUpButton: {
    backgroundColor: "#7f1d1d",
    borderWidth: 1,
    borderColor: "#fca5a5",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  giveUpButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  menuButtonText: {
    color: "#dbeafe",
    fontWeight: "800",
    fontSize: 16,
  },
  restartText: {
    color: "#052e16",
    fontWeight: "800",
    fontSize: 16,
  },
  controls: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  joystickControl: {
    position: "absolute",
    width: 90,
    height: 90,
  },
  actionStack: {
    ...StyleSheet.absoluteFill,
  },
  joystickPad: {
    width: 90,
    height: 90,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderWidth: 2,
    borderColor: "#7dd3fc",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  joystickStick: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#bfdbfe",
    position: "absolute",
    left: 28,
    top: 28,
  },
  actionTopRow: {
    ...StyleSheet.absoluteFill,
  },
  fireButtonFrame: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonFrame: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  pauseButtonTop: {
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    borderWidth: 2,
    borderColor: "#7dd3fc",
    borderRadius: 999,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  fireButton: {
    position: "relative",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    width: 84,
    height: 84,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#7dd3fc",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#7dd3fc",
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  fireButtonBackgroundIcon: {
    position: "absolute",
    width: 56,
    height: 56,
    opacity: 0.55,
  },
  fireButtonLabel: {
    position: "relative",
    zIndex: 1,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowRadius: 3,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  grenadeFireButtonText: {
    fontSize: 10,
    lineHeight: 12,
  },
  secondaryRow: {
    ...StyleSheet.absoluteFill,
  },
  secondaryButton: {
    position: "relative",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    borderColor: "#7dd3fc",
    borderWidth: 2,
    borderRadius: 12,
    height: 54,
    paddingHorizontal: 8,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#dcfce7",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    textAlign: "center",
  },
  weaponButton: {
    minWidth: 60,
    paddingHorizontal: 5,
  },
  actionCircleButton: {
    width: 54,
    height: 54,
    minWidth: 54,
    paddingHorizontal: 0,
    borderRadius: 999,
  },
  gunButtonIcon: {
    width: 32,
    height: 32,
  },
  grenadeButtonIcon: {
    width: 30,
    height: 30,
  },
  healButtonIcon: {
    width: 30,
    height: 30,
  },
  itemCountBadge: {
    position: "absolute",
    top: -7,
    right: -7,
    minWidth: 24,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: 999,
    backgroundColor: "#0f172a",
    borderWidth: 1.5,
    borderColor: "#7dd3fc",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  itemCountBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
  },
  weaponButtonSelected: {
    backgroundColor: "rgba(71, 85, 105, 0.62)",
    borderColor: "#4ade80",
    borderWidth: 3,
  },
  weaponButtonDisabled: {
    opacity: 0.45,
  },
  dashButton: {
    position: "relative",
    height: 54,
    justifyContent: "center",
    overflow: "hidden",
    paddingVertical: 0,
  },
  dashButtonDisabled: {
    opacity: 0.55,
  },
  dashCooldownText: {
    position: "relative",
    zIndex: 2,
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  dashReadyIcon: {
    position: "relative",
    zIndex: 2,
    width: 28,
    height: 28,
  },
  dashCooldownFillTrack: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  dashCooldownFill: {
    height: "100%",
    backgroundColor: "rgba(148, 163, 184, 0.4)",
  },
});
