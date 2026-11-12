import { ProfileBorderOverlay } from "@/components/ui/profile-border-overlay";
import { getBuddy, getBuddyBonus } from "@/constants/buddy-catalog";
import { awardCoins } from "@/constants/coin-wallet";
import {
  coinRewards,
  dropConfig,
  type DropKind,
} from "@/constants/game-configuration";
import { DEFAULT_ORB_SKIN_ID, getOrbSkin } from "@/constants/orb-catalog";
import { awardPlayerXp } from "@/constants/player-experience";
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
  getSoundEffectsVolume,
  getVibrationEnabled,
  subscribeToSoundEffectsVolume,
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
  BackHandler,
  Platform,
  Pressable,
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
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  color: string;
  isBoss: boolean;
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
};

type GrenadeProjectile = {
  id: number;
  playerId?: "host" | "join";
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuse: number;
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
  speedBoostTimer: number;
  rapidFireTimer: number;
  highDamageTimer: number;
  facing: Vector;
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
  isDead: boolean;
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
  damageNumbers: DamageNumber[];
  score: number;
  wave: number;
  arenaBackgroundWave: number;
  waveCountdown: number;
  warpTransitionTimer: number;
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
};

const ARENA_WIDTH = 640;
const ARENA_HEIGHT = 360;
const PLAYER_RADIUS = 18;
const MAX_HEALTH = 100;
const PLAYER_SPEED = 140;
const SPEED_BOOST_DURATION = 30;
const SPEED_BOOST_MULTIPLIER = 1.55;
const RAPID_FIRE_DURATION = 30;
const NORMAL_FIRE_COOLDOWN = 0.22;
const RAPID_FIRE_COOLDOWN = 0.11;
const HIGH_DAMAGE_DURATION = 30;
const HIGH_DAMAGE_MULTIPLIER = 2;
const DASH_COOLDOWN = 2.2;
const BULLET_SPEED = 260;
const GRENADE_SPEED = 250;
const GRENADE_BLAST_RADIUS = 82;
const GRENADE_DAMAGE = 45;
const GRENADE_MIN_RANGE = 70;
const GRENADE_MAX_RANGE = 280;
const GRENADE_RANGE_DRAG_DISTANCE = 64;
const DEFAULT_GRENADE_RANGE = 200;
const MAX_ACTIVE_ENEMIES = 18;
const WAVE_BREAK_DURATION = 60;
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
const bulletImage = getRemoteAssetSource("game/icons/bullet_1.png");
const dashImage = getRemoteAssetSource("game/icons/dash_1.png");
const ghostImage = getRemoteAssetSource("game/icons/ghost_1.png");
const coinImage = getRemoteAssetSource("game/icons/coin_1.png");
const trophyImage = getRemoteAssetSource("game/icons/trophy_1.png");
const homeIcon = getRemoteAssetSource("game/icons/home_1.png");
const playIcon = getRemoteAssetSource("game/icons/play_1.png");
const pauseIcon = getRemoteAssetSource("game/icons/pause_1.png");
const orbLaserSound = getRemoteAssetSource(
  "game/music/freesound_community-pulse_sound_try1-89547.mp3",
);
const playerShotSound = getRemoteAssetSource(
  "game/music/yodguard-short-energy-beam-shot-3-482517.mp3",
);
const grenadeExplosionSound = getRemoteAssetSource(
  "game/music/dragon-studio-explosion-sound-effect-425455.mp3",
);

function getWaveEnemyCount(wave: number) {
  return 4 + wave;
}

function getEnemiesRemainingInWave(game: GameState) {
  const pendingBoss =
    game.wave > 1 && game.wave % 3 === 0 && game.bossSpawnedAtWave !== game.wave
      ? 1
      : 0;
  return game.enemies.length + game.enemiesToSpawn + pendingBoss;
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

const arenaBackgrounds = [
  getRemoteAssetSource("game/arena/arena_1.png"),
  getRemoteAssetSource("game/arena/arena_2.png"),
  getRemoteAssetSource("game/arena/arena_3.png"),
  getRemoteAssetSource("game/arena/arena_4.jpg"),
];
const WAVES_PER_ARENA = 5;
const WARP_TRANSITION_DURATION = 5;

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
    (player.speedBoostTimer > 0 ? SPEED_BOOST_MULTIPLIER : 1)
  );
}

function getEffectiveFireCooldown(player: PlayerState) {
  const baseCooldown =
    player.rapidFireTimer > 0 ? RAPID_FIRE_COOLDOWN : NORMAL_FIRE_COOLDOWN;
  return (
    baseCooldown / (1 + getBuddyBonus(player.buddyId, "attackSpeed") / 100)
  );
}

function getEffectiveBulletDamage(player: PlayerState) {
  const attackDamage =
    20 *
    (1 + getBuddyBonus(player.buddyId, "attack") / 100) *
    (player.highDamageTimer > 0 ? HIGH_DAMAGE_MULTIPLIER : 1);
  const criticalChance = getBuddyBonus(player.buddyId, "criticalChance");
  return Math.round(
    attackDamage * (Math.random() * 100 < criticalChance ? 1.5 : 1),
  );
}

function normalize(vector: Vector): Vector {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function makeEnemyDrops(
  enemy: Enemy,
  existingDrops: ConsumableDrop[] = [],
): ConsumableDrop[] {
  const spawnedKinds = (Object.keys(dropConfig) as DropKind[]).filter(
    (kind) => {
      const config = dropConfig[kind];
      return config.enabled && Math.random() < config.dropChance;
    },
  );
  const placedDrops: ConsumableDrop[] = [...existingDrops];

  return spawnedKinds.map((kind) => {
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

    const nextDrop = {
      id: Date.now() + Math.random(),
      kind,
      x,
      y,
      life: config.stayDurationSeconds + config.flickerDurationSeconds,
    };

    placedDrops.push(nextDrop);
    return nextDrop;
  });
}

function advanceItemDrops(
  drops: ConsumableDrop[],
  player: PlayerState,
  delta: number,
) {
  const remainingDrops: ConsumableDrop[] = [];
  const damageNumbers: DamageNumber[] = [];
  let nextPlayer = { ...player };

  for (const drop of drops) {
    const config = dropConfig[drop.kind];
    const life = drop.life - delta;
    if (life <= 0) {
      continue;
    }

    const touchingPlayer =
      !player.isDead &&
      Math.hypot(drop.x - player.x, drop.y - player.y) <= config.pickupRadius;
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

  return (
    <View style={badgeStyle}>
      <Image
        source={buff.kind === "speed" ? bootsFastImage : bulletImage}
        style={styles.speedBoostIcon}
        contentFit="contain"
      />
      <Text style={styles.speedBoostText}>{Math.ceil(buff.remaining)}s</Text>
    </View>
  );
}

function PlayerBuffIndicators({ player }: { player: PlayerState }) {
  const activeBuffs = getActiveBuffs(player);

  if (activeBuffs.length === 0) {
    return null;
  }

  const badgeWidth = activeBuffs.length * 40 + (activeBuffs.length - 1) * 3;

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

      enemy.health -= GRENADE_DAMAGE;
      damageNumbers.push({
        id: Date.now() + Math.random(),
        x: enemy.x,
        y: enemy.y - enemy.radius - 12,
        amount: GRENADE_DAMAGE,
        life: 0.75,
        target: "enemy",
      });
      if (enemy.health <= 0) {
        score += enemy.isBoss ? 50 : 10;
        itemDrops.push(...makeEnemyDrops(enemy, itemDrops));
      }
    }
  }

  return {
    projectiles: remainingProjectiles,
    enemies: nextEnemies.filter((enemy) => enemy.health > 0),
    explosions,
    itemDrops,
    damageNumbers,
    score,
  };
}

function makeEnemy(wave: number, id: number): Enemy {
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
    speedBoostTimer: 0,
    rapidFireTimer: 0,
    highDamageTimer: 0,
    facing: { x: 1, y: 0 },
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
      y: 12 + Math.sin(angle) * radius * 0.55,
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
    };
  }

  const criticalHit =
    Math.random() * 100 < getBuddyBonus(player.buddyId, "criticalChance");
  const damage = Math.round(
    ORB_ATTACK_DAMAGE *
      (1 + getBuddyBonus(player.buddyId, "attack") / 100) *
      (criticalHit ? 1.5 : 1),
  );
  target.health -= damage;
  damageNumbers.push({
    id: Date.now() + Math.random(),
    x: target.x,
    y: target.y - target.radius - 12,
    amount: damage,
    life: 0.75,
    target: "enemy",
  });

  const defeated = target.health <= 0;
  if (defeated) {
    itemDrops.push(...makeEnemyDrops(target, itemDrops));
  }

  return {
    player: { ...player, orbFireCooldown: ORB_ATTACK_COOLDOWN },
    enemies: defeated
      ? enemies.filter((enemy) => enemy.id !== target.id)
      : enemies,
    score: defeated ? (target.isBoss ? 50 : 10) : 0,
    message: defeated ? (target.isBoss ? "Boss defeated!" : "Plant down!") : "",
    beam: {
      id: Date.now() + Math.random(),
      playerId: player.id,
      orbSkinId: player.orbSkinId,
      startX: orbPosition.x,
      startY: orbPosition.y,
      endX: target.x,
      endY: target.y,
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
    damageNumbers: [],
    pendingPlayerDamage: 0,
    playerDamageTimer: 0.45,
    score: 0,
    wave: 1,
    arenaBackgroundWave: 1,
    waveCountdown: WAVE_BREAK_DURATION,
    warpTransitionTimer: 0,
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
  const [joystick, setJoystick] = useState({ x: 0, y: 0, active: false });
  const [aimDirection, setAimDirection] = useState<Vector>({ x: 1, y: 0 });
  const [earnedCoins, setEarnedCoins] = useState(0);
  const [earnedXp, setEarnedXp] = useState(0);
  const [isFireHeld, setIsFireHeld] = useState(false);
  const [ghostAnimationTime, setGhostAnimationTime] = useState(0);
  const [selectedWeapon, setSelectedWeapon] = useState<"gun" | "grenade">(
    "gun",
  );
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
  const vibrationEnabledRef = useRef(true);
  const vibrationPreferenceLoadedRef = useRef(false);
  const lastDamageEventIdRef = useRef<number | null>(null);
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
    playerShotPlayer.volume = soundEffectsVolumeRef.current;
    orbLaserPlayer.volume = soundEffectsVolumeRef.current * 0.7;
    grenadeExplosionPlayer.volume = soundEffectsVolumeRef.current;
    playerShotPlayerRef.current = playerShotPlayer;
    orbLaserPlayerRef.current = orbLaserPlayer;
    grenadeExplosionPlayerRef.current = grenadeExplosionPlayer;

    return () => {
      playerShotPlayer.pause();
      playerShotPlayer.remove();
      orbLaserPlayer.pause();
      orbLaserPlayer.remove();
      grenadeExplosionPlayer.pause();
      grenadeExplosionPlayer.remove();
      playerShotPlayerRef.current = null;
      orbLaserPlayerRef.current = null;
      grenadeExplosionPlayerRef.current = null;
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
    if (
      explodedByLocalPlayer &&
      soundEffectsLoadedRef.current &&
      soundEffectsVolumeRef.current > 0
    ) {
      replaySoundEffect(grenadeExplosionPlayerRef.current);
    }
  }, [game.grenadeExplosions, localPlayerId]);

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
    if (vibrationPreferenceLoadedRef.current && vibrationEnabledRef.current) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
        () => undefined,
      );
    }
  }, [game.damageNumbers, localPlayerId]);

  useEffect(() => {
    if (!hasDownedPlayer && !hasEquippedOrb && !localPlayer.buddyId) {
      return;
    }

    let animationFrame = 0;
    let lastUpdate = 0;
    const animateGhost = (timestamp: number) => {
      if (timestamp - lastUpdate >= 1000 / 30) {
        setGhostAnimationTime(timestamp / 1000);
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
  const hasJoinedPlayer = lobbyPlayers.some(
    (player) => player.role === "guest",
  );
  const canHostSkipWave =
    multiplayerRole === "host" &&
    (!hasJoinedPlayer || multiplayerReadiness.join);
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
  const multiplayerSocketRef = useRef<MultiplayerSocket | null>(null);
  const gameRef = useRef(game);
  const soundEffectsVolumeRef = useRef(0.75);
  const soundEffectsLoadedRef = useRef(false);
  const knownBulletIdsRef = useRef<Set<number> | null>(null);
  const knownOrbBeamIdsRef = useRef<Set<number> | null>(null);
  const knownGrenadeExplosionIdsRef = useRef<Set<number> | null>(null);
  const playerShotPlayerRef = useRef<ReturnType<
    typeof createAudioPlayer
  > | null>(null);
  const orbLaserPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(
    null,
  );
  const grenadeExplosionPlayerRef = useRef<ReturnType<
    typeof createAudioPlayer
  > | null>(null);
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

  const skipWaveCooldown = useCallback(
    (broadcast = true) => {
      setGame((previous) =>
        previous.waveCountdown > 0
          ? {
              ...previous,
              waveCountdown: 0,
              message: `Wave ${previous.wave} started!`,
            }
          : previous,
      );

      if (broadcast && isLocalMultiplayer && multiplayerRole === "host") {
        const socket = multiplayerSocketRef.current;
        if (socket && socket.readyState === MULTIPLAYER_SOCKET_OPEN) {
          socket.send(
            JSON.stringify({
              type: "command",
              action: "skip-wave",
            }),
          );
        }
      }
    },
    [isLocalMultiplayer, multiplayerRole],
  );

  const resetGameLocally = useCallback(() => {
    coinsAwardedRef.current = false;
    xpAwardedRef.current = false;
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

        if (message.type === "room-command" && message.action === "skip-wave") {
          skipWaveCooldown(false);
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
    skipWaveCooldown,
    resetGameLocally,
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

  const selectWeapon = (weapon: "gun" | "grenade") => {
    selectedWeaponRef.current = weapon;
    setSelectedWeapon(weapon);
    setIsFireHeld(false);
    if (grenadeAimRef.current.active) {
      grenadeAimRef.current.active = false;
      setGrenadeAim(null);
    }
  };

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
          if (
            movementRef.current.x === 0 &&
            movementRef.current.y === 0 &&
            Math.hypot(facing.x - player.facing.x, facing.y - player.facing.y) <
              0.01 &&
            Math.abs(targetOrbSide - player.orbSide) < 0.01
          ) {
            return previous;
          }

          const effectiveSpeed = getEffectivePlayerSpeed(player);
          return {
            ...previous,
            joinPlayer: {
              ...player,
              speedBoostTimer: Math.max(0, player.speedBoostTimer - delta),
              rapidFireTimer: Math.max(0, player.rapidFireTimer - delta),
              highDamageTimer: Math.max(0, player.highDamageTimer - delta),
              orbFireCooldown: Math.max(0, player.orbFireCooldown - delta),
              x: clamp(
                player.x + movement.x * effectiveSpeed * delta,
                player.radius,
                ARENA_WIDTH - player.radius,
              ),
              y: clamp(
                player.y + movement.y * effectiveSpeed * delta,
                player.radius,
                ARENA_HEIGHT - player.radius,
              ),
              facing,
              orbSide: getOrbSideAfterDelta({ ...player, facing }, delta),
            },
          };
        });
        animationFrame = requestAnimationFrame(tick);
        return;
      }

      setGame((previous) => {
        if (!previous.isRunning || previous.isPaused) {
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
            }
          : null;
        const hostIsReviving = previous.reviveState?.reviverId === "host";
        const joinIsReviving = previous.reviveState?.reviverId === "join";
        const moveVector = normalize(movementRef.current);

        if (!player.isDead && !hostIsReviving) {
          const effectiveSpeed = getEffectivePlayerSpeed(player);
          player.x = clamp(
            player.x + moveVector.x * effectiveSpeed * delta,
            player.radius,
            ARENA_WIDTH - player.radius,
          );
          player.y = clamp(
            player.y + moveVector.y * effectiveSpeed * delta,
            player.radius,
            ARENA_HEIGHT - player.radius,
          );
          player.facing = normalize(aimRef.current);
          player.orbSide = getOrbSideAfterDelta(player, delta);
        }
        if (joinPlayer && !joinPlayer.isDead && !joinIsReviving) {
          const guestMove = normalize(remoteInputRef.current.movement);
          const guestEffectiveSpeed = getEffectivePlayerSpeed(joinPlayer);
          joinPlayer.x = clamp(
            joinPlayer.x + guestMove.x * guestEffectiveSpeed * delta,
            joinPlayer.radius,
            ARENA_WIDTH - joinPlayer.radius,
          );
          joinPlayer.y = clamp(
            joinPlayer.y + guestMove.y * guestEffectiveSpeed * delta,
            joinPlayer.radius,
            ARENA_HEIGHT - joinPlayer.radius,
          );
          joinPlayer.facing = normalize(remoteInputRef.current.aim);
          joinPlayer.orbSide = getOrbSideAfterDelta(joinPlayer, delta);
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

        if (previous.waveCountdown > 0) {
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
          let itemDrops = previous.itemDrops;
          if (!player.isDead) {
            const pickup = advanceItemDrops(itemDrops, player, delta);
            player = pickup.player;
            itemDrops = pickup.drops;
            damageNumbers.push(...pickup.damageNumbers);
          }
          if (joinPlayer && !joinPlayer.isDead) {
            const pickup = advanceItemDrops(itemDrops, joinPlayer, delta);
            joinPlayer = pickup.player;
            itemDrops = pickup.drops;
            damageNumbers.push(...pickup.damageNumbers);
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
            damageNumbers,
            arenaBackgroundWave,
            waveCountdown,
            warpTransitionTimer,
            fireCooldown,
            dashCooldown: Math.max(0, player.dashCooldown - delta),
            pendingPlayerDamage: 0,
            playerDamageTimer: Math.max(0, previous.playerDamageTimer - delta),
            message:
              previous.warpTransitionTimer > 0
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
        let enemies = previous.enemies.map((enemy) => {
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
          return {
            ...enemy,
            x: clamp(newX, enemy.radius, ARENA_WIDTH - enemy.radius),
            y: clamp(newY, enemy.radius, ARENA_HEIGHT - enemy.radius),
          };
        });

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
        let enemiesToSpawn = previous.enemiesToSpawn;
        let bossSpawnedAtWave = previous.bossSpawnedAtWave;
        let message = previous.message;
        let bossHealth = previous.bossHealth;
        let bossHealthMax = previous.bossHealthMax;
        let bossName = previous.bossName;
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

        const bulletHitIds = new Set<number>();
        const survivingEnemies: Enemy[] = [];

        for (const enemy of enemies) {
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
              enemy.health -= bullet.damage;
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
                score += enemy.isBoss ? 50 : 10;
                message = enemy.isBoss ? "Boss defeated!" : "Plant down!";
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

        const currentBoss = enemies.find((enemy) => enemy.isBoss);
        if (currentBoss) {
          bossHealth = currentBoss.health;
          bossHealthMax = currentBoss.maxHealth;
          bossName = currentBoss.health > 0 ? "Thorn Titan" : bossName;
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

        const damageOnePlayer = (
          currentPlayer: PlayerState | null,
          hostPlayer: boolean,
        ) => {
          if (!currentPlayer || currentPlayer.isDead) return currentPlayer;
          let damageTaken = 0;
          for (const enemy of enemies) {
            const dx = currentPlayer.x - enemy.x;
            const dy = currentPlayer.y - enemy.y;
            const hitRange = currentPlayer.radius + enemy.radius + 4;
            if (dx * dx + dy * dy < hitRange * hitRange) {
              if (
                Math.random() * 100 >=
                getBuddyBonus(currentPlayer.buddyId, "dodgeChance")
              ) {
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
          };
        };
        player = damageOnePlayer(player, true) ?? player;
        joinPlayer = damageOnePlayer(joinPlayer, false);

        if (!player.isDead) {
          const pickup = advanceItemDrops(itemDrops, player, delta);
          player = pickup.player;
          itemDrops = pickup.drops;
          damageNumbers.push(...pickup.damageNumbers);
        }
        if (joinPlayer && !joinPlayer.isDead) {
          const pickup = advanceItemDrops(itemDrops, joinPlayer, delta);
          joinPlayer = pickup.player;
          itemDrops = pickup.drops;
          damageNumbers.push(...pickup.damageNumbers);
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

        if (enemies.length === 0 && enemiesToSpawn === 0) {
          wave += 1;
          waveCountdown = WAVE_BREAK_DURATION;
          const isNewArena = (wave - 1) % WAVES_PER_ARENA === 0;
          warpTransitionTimer = isNewArena ? WARP_TRANSITION_DURATION : 0;
          enemiesToSpawn = getWaveEnemyCount(wave);
          bullets = [];
          spawnCooldown = 0;
          bossHealth = 0;
          bossHealthMax = 0;
          message = isNewArena
            ? "Warping to another location"
            : `Wave ${wave - 1} cleared! Prepare for wave ${wave}`;
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
          damageNumbers,
          pendingPlayerDamage,
          playerDamageTimer,
          score,
          wave,
          waveCountdown,
          warpTransitionTimer,
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
        };

        return nextState;
      });

      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [isFireHeld, isLocalMultiplayer, multiplayerRole, reviveTarget]);

  const updateJoystick = (x: number, y: number) => {
    const dx = x - 42;
    const dy = y - 42;
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
        }
      }
      setIsFireHeld(false);
    },
    [isOverGrenadeCancel, sendPlayerAction],
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
  const waveCountdownGesture = useTapGesture({
    runOnJS: true,
    simultaneousWith: joystickGesture,
    onActivate: () => {
      if (isLocalPlayerReviving || localPlayer.isDead) {
        return;
      }
      if (!isLocalMultiplayer) {
        skipWaveCooldown();
        return;
      }
      if (multiplayerRole === "host") {
        if (canHostSkipWave) {
          skipWaveCooldown();
        }
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

                  <GestureDetector gesture={waveCountdownGesture}>
                    <View
                      accessible
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled:
                          isLocalPlayerReviving ||
                          localPlayer.isDead ||
                          (multiplayerRole === "host" && !canHostSkipWave),
                      }}
                      accessibilityLabel={
                        multiplayerRole === "host"
                          ? canHostSkipWave
                            ? "Start wave"
                            : "Waiting for player to get ready"
                          : multiplayerRole === "join"
                            ? "Mark ready for next wave"
                            : "Start wave"
                      }
                      pointerEvents="auto"
                      style={[
                        styles.waveCountdownSkipButton,
                        (isLocalPlayerReviving ||
                          localPlayer.isDead ||
                          (multiplayerRole === "host" && !canHostSkipWave)) &&
                          styles.waveCountdownSkipButtonDisabled,
                      ]}
                    >
                      <Text
                        pointerEvents="none"
                        style={styles.waveCountdownSkipText}
                      >
                        {multiplayerRole === "host"
                          ? canHostSkipWave
                            ? "START WAVE!"
                            : "WAITING FOR READY"
                          : multiplayerRole === "join"
                            ? multiplayerReadiness.join
                              ? "READY!"
                              : "READY"
                            : "START WAVE!"}
                      </Text>
                    </View>
                  </GestureDetector>
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
              <View
                key={bullet.id}
                style={[
                  styles.bullet,
                  {
                    left: bullet.x - bullet.radius,
                    top: bullet.y - bullet.radius,
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
              <View
                key={projectile.id}
                pointerEvents="none"
                style={[
                  styles.grenadeProjectile,
                  {
                    left: projectile.x - 9,
                    top: projectile.y - 9,
                  },
                ]}
              />
            ))}

            {game.enemies.map((enemy) => (
              <View key={enemy.id}>
                <View
                  style={[
                    styles.enemyHealthBarOuter,
                    {
                      left: enemy.x - 22,
                      top: enemy.y - enemy.radius - 13,
                      width: 44,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.enemyHealthBarInner,
                      {
                        width: `${Math.max(
                          0,
                          (enemy.health / enemy.maxHealth) * 100,
                        )}%`,
                      },
                    ]}
                  />
                  <Text style={styles.enemyHealthText}>
                    {Math.ceil(enemy.health)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.enemy,
                    {
                      left: enemy.x - enemy.radius,
                      top: enemy.y - enemy.radius,
                      width: enemy.radius * 2,
                      height: enemy.radius * 2,
                      backgroundColor: enemy.color,
                      borderWidth: enemy.isBoss ? 3 : 1,
                      opacity: enemy.isBoss ? 1 : 0.88,
                    },
                  ]}
                />
              </View>
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
                    <Text style={styles.grenadeDropIcon}>💣</Text>
                  ) : drop.kind === "rapidFire" ? (
                    <Image
                      source={bulletImage}
                      contentFit="contain"
                      style={styles.consumableDropImage}
                    />
                  ) : drop.kind === "highDamage" ? (
                    <Image
                      source={bulletImage}
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
                  {drop.kind === "medkit" && (
                    <Text style={styles.medkitPlus}>+</Text>
                  )}
                  {drop.kind === "rapidFire" && (
                    <View style={styles.rapidFireDropBadge}>
                      <Text style={styles.rapidFireDropBadgeText}>
                        &gt;&gt;
                      </Text>
                    </View>
                  )}
                  {drop.kind === "highDamage" && (
                    <View style={styles.highDamageDropBadge}>
                      <Text style={styles.rapidFireDropBadgeText}>+</Text>
                    </View>
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
                      getOrbPosition(game.player, ghostAnimationTime).x - 16,
                    top: getOrbPosition(game.player, ghostAnimationTime).y - 16,
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
                      getBuddyPosition(game.player, ghostAnimationTime).x - 16,
                    top:
                      getBuddyPosition(game.player, ghostAnimationTime).y - 16,
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
                  left: game.player.x - game.player.radius,
                  top: game.player.y - game.player.radius,
                  width: game.player.radius * 2,
                  height: game.player.radius * 2,
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
                style={styles.playerImage}
                contentFit="contain"
              />
              <View
                pointerEvents="none"
                style={[
                  styles.playerAimIndicator,
                  {
                    transform: [
                      {
                        rotate: `${Math.atan2(hostAimDirection.y, hostAimDirection.x)}rad`,
                      },
                    ],
                  },
                ]}
              />
              <View style={styles.playerFacing} />
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
                            .x - 16,
                        top:
                          getOrbPosition(game.joinPlayer, ghostAnimationTime)
                            .y - 16,
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
                            .x - 16,
                        top:
                          getBuddyPosition(game.joinPlayer, ghostAnimationTime)
                            .y - 16,
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
                      left: game.joinPlayer.x - game.joinPlayer.radius,
                      top: game.joinPlayer.y - game.joinPlayer.radius,
                      width: game.joinPlayer.radius * 2,
                      height: game.joinPlayer.radius * 2,
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
                    style={styles.playerImage}
                    contentFit="contain"
                  />
                  <View
                    pointerEvents="none"
                    style={[
                      styles.playerAimIndicator,
                      {
                        transform: [
                          {
                            rotate: `${Math.atan2(joinAimDirection.y, joinAimDirection.x)}rad`,
                          },
                        ],
                      },
                    ]}
                  />
                  <View style={styles.playerFacing} />
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
                <Text style={styles.gameOverXpIcon}>XP</Text>
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

        <View pointerEvents="none" style={styles.hud}>
          <View style={styles.playerHudGroup}>
            {hudPlayers.map(
              ({ id, badge, role, player, profilePicture, profileBorder }) => (
                <View key={id} style={styles.playerHudPlayer}>
                  <View
                    style={[styles.playerHudCard, styles.playerHudCardCompact]}
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
                      <Image
                        source={heartImage}
                        style={styles.playerHealthIcon}
                        contentFit="contain"
                      />
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
                        {getActiveBuffs(player).length > 0 && (
                          <View style={styles.activeBuffs} pointerEvents="none">
                            {getActiveBuffs(player).map((buff) => (
                              <ActiveBuffBadge key={buff.kind} buff={buff} />
                            ))}
                          </View>
                        )}
                        <Text
                          pointerEvents="none"
                          style={styles.playerHealthValue}
                        >
                          {Math.max(0, Math.round(player.health))}/
                          {Math.round(player.maxHealth)}
                        </Text>
                      </View>
                    </View>

                    {isLocalMultiplayer && (
                      <View
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
                  <Text numberOfLines={1} style={styles.playerHudPlayerName}>
                    {badge} · {player.name}
                  </Text>
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
          pointerEvents={isLocalPlayerReviving ? "none" : "auto"}
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
            <View style={styles.controls}>
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

              <View style={styles.actionStack}>
                <View style={styles.actionTopRow}>
                  <GestureDetector gesture={fireHoldGesture}>
                    <View style={styles.fireButton}>
                      {selectedWeapon === "gun" ? (
                        <Image
                          pointerEvents="none"
                          source={bulletImage}
                          contentFit="contain"
                          style={styles.fireButtonBackgroundIcon}
                        />
                      ) : (
                        <Text
                          pointerEvents="none"
                          style={[
                            styles.fireButtonBackgroundIcon,
                            styles.fireButtonBombIcon,
                          ]}
                        >
                          💣
                        </Text>
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
                  </GestureDetector>
                </View>
                <View style={styles.secondaryRow}>
                  <GestureDetector gesture={gunSelectGesture}>
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
                        selectedWeapon === "gun" && styles.weaponButtonSelected,
                      ]}
                    >
                      <Image
                        source={bulletImage}
                        contentFit="contain"
                        style={styles.gunButtonIcon}
                      />
                    </Pressable>
                  </GestureDetector>
                  <GestureDetector gesture={grenadeSelectGesture}>
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
                      <Text style={styles.grenadeButtonIcon}>💣</Text>
                      <View pointerEvents="none" style={styles.itemCountBadge}>
                        <Text style={styles.itemCountBadgeText}>
                          x{localPlayer.grenades}
                        </Text>
                      </View>
                    </Pressable>
                  </GestureDetector>
                  <GestureDetector gesture={healGesture}>
                    <View
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel={`Use heal, ${localPlayer.heals} remaining`}
                      accessibilityState={{ disabled: localPlayer.heals <= 0 }}
                      style={[
                        styles.secondaryButton,
                        styles.actionCircleButton,
                        localPlayer.heals <= 0 && styles.weaponButtonDisabled,
                      ]}
                    >
                      <Image
                        source={heartImage}
                        contentFit="contain"
                        style={styles.healButtonIcon}
                      />
                      <View pointerEvents="none" style={styles.itemCountBadge}>
                        <Text style={styles.itemCountBadgeText}>
                          x{localPlayer.heals}
                        </Text>
                      </View>
                    </View>
                  </GestureDetector>
                  <GestureDetector gesture={dashGesture}>
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
                          tintColor="#fff"
                          style={styles.dashReadyIcon}
                        />
                      )}
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
        {game.warpTransitionTimer > 0 && game.isRunning && (
          <View
            pointerEvents="none"
            style={[
              styles.warpTransitionOverlay,
              { opacity: getWarpFadeOpacity(game.warpTransitionTimer) },
            ]}
          />
        )}
        {game.warpTransitionTimer > 0 && game.isRunning && (
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
    maxWidth: 170,
    color: "#d9f5dc",
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 3,
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
    right: -5,
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
    width: 32,
    height: 32,
  },
  playerAvatarImageCompact: {
    width: 26,
    height: 26,
  },
  playerHealthColumn: {
    width: 94,
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  playerHealthColumnCompact: {
    width: 74,
  },
  playerHealthIcon: {
    width: 12,
    height: 12,
    flexShrink: 0,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(14, 116, 144, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(125, 211, 252, 0.9)",
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
    position: "absolute",
    top: -19,
    left: -12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 5,
  },
  rapidFireBuffBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(180, 83, 9, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(253, 186, 116, 0.95)",
  },
  highDamageBuffBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(126, 34, 206, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(216, 180, 254, 0.95)",
  },
  speedBoostIcon: {
    width: 11,
    height: 11,
  },
  speedBoostText: {
    color: "#ecfeff",
    fontSize: 9,
    fontWeight: "800",
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
    top: 82,
    left: "30%",
    right: "30%",
    zIndex: 2,
  },
  bossLabel: {
    color: "#fed7aa",
    fontWeight: "800",
    marginBottom: 6,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  bossBarOuter: {
    height: 12,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#f97316",
  },
  bossBarInner: {
    height: "100%",
    backgroundColor: "#f97316",
  },
  badge: {
    color: "#a7f3d0",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
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
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(236, 254, 255, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    overflow: "visible",
  },
  orbCompanion: {
    position: "absolute",
    width: 32,
    height: 32,
    zIndex: 2,
  },
  buddyCompanion: {
    position: "absolute",
    width: 32,
    height: 32,
    zIndex: 2,
  },
  orbLaser: {
    position: "absolute",
    height: 14,
    zIndex: 1,
  },
  playerImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  playerAimIndicator: {
    position: "absolute",
    width: 22,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#fef3c7",
    left: "50%",
    top: "50%",
    marginLeft: -2,
    marginTop: -1.5,
    transformOrigin: "left center",
    shadowColor: "#fef3c7",
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  playerFacing: {
    position: "absolute",
    width: 12,
    height: 12,
    backgroundColor: "#fef3c7",
    borderRadius: 999,
    right: -6,
    top: "50%",
    marginTop: -6,
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
  enemy: {
    position: "absolute",
    borderRadius: 999,
    borderColor: "#dcfce7",
    justifyContent: "flex-end",
    alignItems: "center",
    overflow: "hidden",
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
  grenadeDropIcon: {
    fontSize: 15,
    lineHeight: 18,
  },
  rapidFireDropBadge: {
    position: "absolute",
    top: -5,
    right: -6,
    minWidth: 17,
    height: 12,
    paddingHorizontal: 2,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f97316",
    borderWidth: 1,
    borderColor: "#fff7ed",
    zIndex: 2,
  },
  rapidFireDropBadgeText: {
    color: "#fff",
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "900",
  },
  highDamageDropBadge: {
    position: "absolute",
    top: -5,
    right: -6,
    width: 13,
    height: 13,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7e22ce",
    borderWidth: 1,
    borderColor: "#f3e8ff",
    zIndex: 2,
  },
  medkitPlus: {
    position: "absolute",
    color: "#fff",
    fontSize: 15,
    lineHeight: 16,
    fontWeight: "900",
    textShadowColor: "#bd1724",
    textShadowRadius: 3,
  },
  healNumber: {
    color: "#4ade80",
    textShadowColor: "rgba(0, 0, 0, 0.95)",
    textShadowRadius: 6,
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
    top: 10,
    left: 0,
    right: 0,
    alignItems: "center",
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
    borderColor: "rgba(255, 255, 255, 0.85)",
    backgroundColor: "rgba(7, 17, 13, 0.65)",
    zIndex: 20,
    elevation: 20,
  },
  waveCountdownSkipButtonDisabled: {
    opacity: 0.5,
  },
  waveCountdownSkipText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
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
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#ff2bd6",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#ff2bd6",
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  grenadeProjectile: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#ff8c00",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#ff4500",
    shadowOpacity: 1,
    shadowRadius: 10,
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
  gameOverXpIcon: {
    width: 30,
    color: "#fde68a",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
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
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 34,
    zIndex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  joystickPad: {
    width: 90,
    height: 90,
    marginLeft: 30,
    marginBottom: 6,
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
  actionStack: {
    flex: 1,
    marginLeft: 12,
    marginRight: 20,
    alignItems: "flex-end",
  },
  actionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
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
  fireButtonBombIcon: {
    color: "#fff",
    fontSize: 48,
    lineHeight: 56,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowRadius: 4,
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
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
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
    fontSize: 24,
    lineHeight: 30,
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
