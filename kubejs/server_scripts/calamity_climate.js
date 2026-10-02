// Calamity climate on top of the LSO temperature system (LSO keeps computing temperature, HUD, armor, coats, rings, wetness).
// LSO damage is turned off in its config ("Dangerous ... Temperature Effects" = false); this script adds the consequences:
//   Cold        LSO "cold"      (temp < 15)    Slowness I, attack speed -10%                       anywhere, also at home
//   Freezing    LSO "frostbite" (temp < 7.5)   Slowness II, attack speed -20%, healing -50% (+ LSO cold hunger)
//               + 1 damage / 2 s ONLY in mountains and the harshest frozen biomes
//   Thresholds are LSO's own, so the HUD icon, shaking and frost overlay always match the state.
//   Hot         LSO "hot"        (temp >= 25)   healing -25%, attack speed -10%
//   Heatstroke  LSO "heat stroke"(temp >= 32.5) healing -40%, attack speed -15%           never deals damage
//   Rested      20 s under a roof by a fire (standing or sitting)    healing +50%, attack speed +10%, 7 min + 1 min per comfort
// Penalties are attribute modifiers added/removed only when the state set changes; icons are short status effects.

const $BlockPos = Java.loadClass('net.minecraft.core.BlockPos')
const $BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
const $BlockStateProperties = Java.loadClass('net.minecraft.world.level.block.state.properties.BlockStateProperties')
const $BlockTags = Java.loadClass('net.minecraft.tags.BlockTags')
const $BiomeTags = Java.loadClass('net.minecraft.tags.BiomeTags')
const $MobEffects = Java.loadClass('net.minecraft.world.effect.MobEffects')
const $Attributes = Java.loadClass('net.minecraft.world.entity.ai.attributes.Attributes')

let $LsoAttachments = null
try { $LsoAttachments = Java.loadClass('sfiomn.legendarysurvivaloverhaul.util.AttachmentUtil') } catch (e) { $LsoAttachments = null }

// KubeJS 2101 exposes argument-less getters as bean properties (level.gameTime, player.server ...):
// G(obj, 'getGameTime') works whichever form the object offers.
function G(obj, method) {
  let f = obj[method]
  if (typeof f === 'function') return f.call(obj)
  let base = method.replace(/^(get|is)/, '')
  let v = obj[base.charAt(0).toLowerCase() + base.slice(1)]
  return typeof v === 'function' ? v.call(obj) : v
}
// KubeJS exposes some vanilla methods as bean properties (player.level, level.dimension): accept both forms
function prop(obj, name) {
  let v = obj[name]
  return typeof v === 'function' ? v.call(obj) : v
}
function dimensionId(level) {
  let d = prop(level, 'dimension')
  return (d != null && typeof d.location === 'function') ? String(d.location()) : String(d)
}


// Damage from frostbite only here (plus the vanilla #minecraft:is_mountain biomes)
const HARSH = {
  'minecraft:frozen_peaks': true, 'minecraft:jagged_peaks': true, 'minecraft:snowy_slopes': true, 'minecraft:ice_spikes': true,
  'minecraft:frozen_ocean': true, 'minecraft:deep_frozen_ocean': true,
  'terralith:frozen_cliffs': true, 'terralith:glacial_chasm': true, 'terralith:ice_marsh': true,
  'terralith:emerald_peaks': true, 'terralith:skylands_winter': true,
  'twilightforest:glacier': true, 'eternal_starlight:permafrost_peaks': true, 'undergarden:frostfields': true
}
// never lethal here, whatever the tags say
const SAFE = { 'terralith:forested_highlands': true }

const HEAT_BLOCK = /(campfire|_fire|:fire|lava|magma_block|furnace|smoker|heater|brazier|stove|fireplace)$/

const HEAL = 'apothic_attributes:healing_received'
const ATK = 'minecraft:generic.attack_speed'
const SPEED = 'minecraft:generic.movement_speed'   // only cleaned up, movement is slowed with Slowness now
const MODS = {
  wet: [[HEAL, -0.25]],   // no longer used, kept so old modifiers get removed
  cold: [[ATK, -0.1]],
  freezing: [[ATK, -0.2], [HEAL, -0.5]],
  hot: [[HEAL, -0.25], [ATK, -0.1]],
  heatstroke: [[HEAL, -0.4], [ATK, -0.15]],
  rested: [[HEAL, 0.5], [ATK, 0.1]]
}

// LSO body temperature 0..40 (normal 20), or null when LSO is missing
function lsoTemperature(p) {
  if (!$LsoAttachments) return null
  try { return Number(G($LsoAttachments.getTempAttachment(p), 'getTemperatureLevel')) } catch (e) { return null }
}

function lethalColdHere(biome, biomeId) {
  if (SAFE[biomeId]) return false
  if (HARSH[biomeId]) return true
  try { return biome['is(net.minecraft.tags.TagKey)']($BiomeTags.IS_MOUNTAIN) == true } catch (e) { return false }
}

function blockId(state) { return String($BuiltInRegistries.BLOCK.getKey(G(state, 'getBlock'))) }

function isHeat(state) {
  if (!HEAT_BLOCK.test(blockId(state))) return false
  if (state.hasProperty($BlockStateProperties.LIT)) return state.getValue($BlockStateProperties.LIT) == true
  return true
}

function nearFire(level, pos) {
  let m = new $BlockPos.MutableBlockPos()
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -1; dy <= 2; dy++) {
    m.set(G(pos, 'getX') + dx, G(pos, 'getY') + dy, G(pos, 'getZ') + dz)
    let st = level.getBlockState(m)
    if (!G(st, 'isAir') && isHeat(st)) return true
  }
  return false
}

// Valheim comfort: 1 base + 1 shelter + best item of each category nearby
function comfort(level, pos, sheltered) {
  let found = {}
  let m = new $BlockPos.MutableBlockPos()
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) for (let dy = -2; dy <= 3; dy++) {
    m.set(G(pos, 'getX') + dx, G(pos, 'getY') + dy, G(pos, 'getZ') + dz)
    let st = level.getBlockState(m)
    if (G(st, 'isAir')) continue
    let id = blockId(st)
    if (!found.fire && isHeat(st)) found.fire = 1
    else if (!found.bed && st.is($BlockTags.BEDS)) found.bed = 1
    else if (!found.seat && /chair|bench|stool|couch|sofa|seat/.test(id)) found.seat = 1
    else if (!found.table && /table|desk|counter/.test(id) && !/crafting|enchanting|fletching|smithing|cartography|sewing/.test(id)) found.table = 1
    else if (!found.carpet && (st.is($BlockTags.WOOL_CARPETS) || /carpet|rug/.test(id))) found.carpet = 1
    else if (!found.decor && /banner|flower_pot|potted_|bookshelf|candle|lantern|vase|shelf|trophy|cushion/.test(id)) found.decor = 1
  }
  return 1 + (sheltered ? 1 : 0) + Object.keys(found).length
}

function monstersNear(level, p) {
  let list = level.getEntities(p, G(p, 'getBoundingBox').inflate(12))
  for (let i = 0; i < list.size(); i++) {
    let e = list.get(i)
    if (G(e, 'isAlive') && String(G(G(e, 'getType'), 'getCategory').name()) == 'MONSTER') return true
  }
  return false
}

function syncModifiers(server, name, p, states) {
  let key = 'v2:' + states.join(',')
  let data = p.persistentData
  if (String(data.getString('calamity_climate_mods')) == key) return
  // remove every id on every attribute we ever used, so modifiers from older versions can't linger
  Object.keys(MODS).forEach(s => [HEAL, ATK, SPEED].forEach(a => { for (let i = 0; i < 3; i++)
    server.runCommandSilent('attribute ' + name + ' ' + a + ' modifier remove calamity:' + s + '_' + i) }))
  states.forEach(s => MODS[s].forEach((m, i) =>
    server.runCommandSilent('attribute ' + name + ' ' + m[0] + ' modifier add calamity:' + s + '_' + i + ' ' + m[1] + ' add_multiplied_total')))
  data.putString('calamity_climate_mods', key)
}

let lastDebug = {}
function attrDebug(p) {
  try {
    return ' | atkSpeed ' + Number(p.getAttributeValue($Attributes.ATTACK_SPEED)).toFixed(2) +
      ' move ' + Number(p.getAttributeValue($Attributes.MOVEMENT_SPEED)).toFixed(3)
  } catch (e) { return ' | attr ?' }
}

PlayerEvents.tick(event => {
  let p = event.player
  if (p.tickCount % 20 != 0) return
  let level = prop(p, 'level')
  if (G(level, 'isClientSide')) return
  let server = G(p, 'getServer')
  let name = String(G(G(p, 'getGameProfile'), 'getName'))
  if (G(p, 'isSpectator') || G(p, 'isCreative')) { syncModifiers(server, name, p, []); return }

  let data = p.persistentData
  let now = G(level, 'getGameTime')
  let pos = prop(p, 'blockPosition')
  let biome = level.getBiome(pos)
  let biomeId = String(G(biome, 'getRegisteredName'))
  let temp = lsoTemperature(p)
  let sky = level.canSeeSky(pos.above())

  // LSO bands: frostbite < 7.5 <= cold < 15 <= normal < 25 <= hot < 32.5 <= heat stroke
  let cold = 0, hot = 0
  if (temp != null) {
    if (temp < 7.5) cold = 2
    else if (temp < 15) cold = 1
    else if (temp >= 32.5) hot = 2
    else if (temp >= 25) hot = 1
  }
  let lethal = cold == 2 && lethalColdHere(biome, biomeId)

  // Rested: 20 s under a roof by a fire, not freezing / heatstroke, no monsters, standing still or sitting
  let restedUntil = data.getLong('calamity_rested_until')
  let lx = data.getDouble('calamity_lx'), lz = data.getDouble('calamity_lz')
  let still = Math.abs(G(p, 'getX') - lx) < 0.05 && Math.abs(G(p, 'getZ') - lz) < 0.05
  data.putDouble('calamity_lx', G(p, 'getX'))
  data.putDouble('calamity_lz', G(p, 'getZ'))
  let canRest = !sky && cold < 2 && hot < 2 && (G(p, 'isPassenger') || still) && restedUntil - now < 1200 && nearFire(level, pos)
  if (canRest && !monstersNear(level, p)) {
    let t = data.getInt('calamity_rest_secs') + 1
    if (t >= 20) {
      let c = comfort(level, pos, true)
      let secs = (7 + c) * 60
      restedUntil = now + secs * 20
      data.putLong('calamity_rested_until', restedUntil)
      data.putInt('calamity_rest_secs', 0)
      server.runCommandSilent('effect give ' + name + ' calamity:rested ' + secs + ' 0 true')
      server.runCommandSilent('title ' + name + ' actionbar {"text":"Отдых: уют ' + c + ', ' + (7 + c) + ' мин","color":"gold"}')
    } else {
      data.putInt('calamity_rest_secs', t)
      server.runCommandSilent('effect give ' + name + ' calamity:resting 2 0 true')
    }
  } else data.putInt('calamity_rest_secs', 0)
  let rested = restedUntil > now

  lastDebug[name] = 'LSO temp ' + (temp == null ? 'нет' : temp.toFixed(1)) + ' | biome ' + biomeId +
    ' lethal=' + lethal + ' | cold=' + cold + ' hot=' + hot + ' rested=' + rested +
    attrDebug(p)

  let states = []
  if (cold == 1) states.push('cold')
  if (cold == 2) states.push('freezing')
  if (hot == 1) states.push('hot')
  if (hot == 2) states.push('heatstroke')
  if (rested) states.push('rested')
  syncModifiers(server, name, p, states)

  if (cold == 1) {
    server.runCommandSilent('effect give ' + name + ' calamity:cold 3 0 true')
    server.runCommandSilent('effect give ' + name + ' minecraft:slowness 3 0 true')
  }
  if (cold == 2) {
    server.runCommandSilent('effect give ' + name + ' calamity:freezing 3 0 true')
    server.runCommandSilent('effect give ' + name + ' minecraft:slowness 3 1 true')
    if (lethal && p.tickCount % 40 == 0) server.runCommandSilent('damage ' + name + ' 1 minecraft:freeze')
  }
  // clean up the cold hunger the previous version gave (LSO gives it itself again)
  if (data.getBoolean('calamity_cold_hunger')) {
    server.runCommandSilent('effect clear ' + name + ' legendarysurvivaloverhaul:cold_hunger')
    data.putBoolean('calamity_cold_hunger', false)
  }
  if (hot > 0) server.runCommandSilent('effect give ' + name + ' calamity:hot 3 ' + (hot - 1) + ' true')
})

// Re-apply the modifiers after login / respawn
PlayerEvents.loggedIn(event => event.player.persistentData.putString('calamity_climate_mods', '#'))
PlayerEvents.respawned(event => {
  event.player.persistentData.putString('calamity_climate_mods', '#')
  event.player.persistentData.putBoolean('calamity_cold_hunger', false)
})

// /climate: shows the LSO temperature and the chosen state
ServerEvents.commandRegistry(event => {
  const { commands: Commands } = event
  event.register(Commands.literal('climate').executes(ctx => {
    let p = ctx.source.player
    if (p == null) return 0
    p.tell(lastDebug[String(G(G(p, 'getGameProfile'), 'getName'))] || 'нет данных, подожди секунду')
    return 1
  }))
})
